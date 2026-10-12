import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SafeUser } from "@shared/models/auth";
import { cacheGet, cacheSet, cacheClearAll } from "@/lib/offline-db";
import { cancelPendingSettingsPush } from "@/lib/settings-sync";
import { forgetAppSession, rememberAppSession } from "@/lib/native-app";
import { getOfflineModeEnabled } from "@/lib/offline-mode";
import { fetchWithTimeout, markCacheServed, markNetworkOk } from "@/lib/read-fallback";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { clearSessionDraft } from "@/lib/session-draft";

const USER_CACHE_KEY = "user";
const SESSION_MARKER_KEY = "tn-session-active";
const AUTH_QUERY_KEY = ["/api/auth/user"] as const;

// Reads started under an earlier session must never update the identity mirror
// (or wipe the offline queue on a late 401) after an auth transition begins.
let authEpoch = 0;
let authTransitionPending = 0;
// A read that already received a response may be writing/clearing IndexedDB.
// Let that finish before a new session writes its own mirror.
let authReadStorage: Promise<void> = Promise.resolve();

function assertCurrentAuthRead(epoch: number) {
  if (epoch !== authEpoch || authTransitionPending > 0) {
    throw new Error("Auth read superseded by a session change");
  }
}

async function beginAuthTransition(queryClient: ReturnType<typeof useQueryClient>) {
  authEpoch++;
  authTransitionPending++;
  await authReadStorage;
  await queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
}

function finishAuthTransition() {
  authEpoch++;
  authTransitionPending--;
}

function failAuthTransition(queryClient: ReturnType<typeof useQueryClient>) {
  finishAuthTransition();
  // A cancelled read may have learned that the old session expired. When the
  // attempted change fails, verify the existing session again rather than
  // leaving its pre-transition identity trusted indefinitely.
  if (authTransitionPending === 0) {
    void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  }
}

function replaceIdentity(queryClient: ReturnType<typeof useQueryClient>, user: SafeUser | null) {
  // clear() removes the *active* auth query. Its mounted useQuery observer
  // remains attached to that removed query, not the new query setQueryData
  // creates, so the login page stays visible until a full app restart.
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0],
  });
  // clear() also removed user-scoped mutation results; retain that isolation
  // without detaching the mounted auth observer.
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(AUTH_QUERY_KEY, user);
}

function setSessionMarker(active: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (active) localStorage.setItem(SESSION_MARKER_KEY, "1");
    else localStorage.removeItem(SESSION_MARKER_KEY);
  } catch {
    // ignore
  }
}

function hasSessionMarker(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(SESSION_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

async function fetchUser(): Promise<SafeUser | null> {
  const epoch = authEpoch;
  const offlineModeOn = getOfflineModeEnabled();
  try {
    // Cap the wait when offline mode is on: on flaky wifi this request can
    // hang for minutes while navigator.onLine still reads true, leaving the
    // auth gate on a spinner forever (the cold-start deep-link hang).
    const response = offlineModeOn
      ? await fetchWithTimeout("/api/auth/user", { credentials: "include" })
      : await fetch("/api/auth/user", { credentials: "include" });
    assertCurrentAuthRead(epoch);

    if (response.status === 401) {
      // Definitive server answer — identity is no longer mirror-served.
      markNetworkOk(USER_CACHE_KEY);
      setSessionMarker(false);
      forgetAppSession();
      const clearing = cacheClearAll();
      authReadStorage = clearing;
      await clearing;
      assertCurrentAuthRead(epoch);
      appQueryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "/api/auth/user",
      });
      appQueryClient.getMutationCache().clear();
      return null;
    }

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as SafeUser;
    assertCurrentAuthRead(epoch);
    // Fully parsed network result — clear this key's saved-data signal.
    markNetworkOk(USER_CACHE_KEY);
    setSessionMarker(true);
    const writing = cacheSet(USER_CACHE_KEY, data);
    authReadStorage = writing;
    await writing;
    assertCurrentAuthRead(epoch);
    return data;
  } catch (err) {
    assertCurrentAuthRead(epoch);
    // Fall back to the cached identity whenever the network layer failed
    // (rejected, timed out, or the server errored) while offline mode is on
    // AND we previously held a verified session (marker present). A real
    // 401 never reaches this catch — it's handled above and wipes the
    // cache — so a signed-out session can't be resurrected from here.
    // Deliberately NOT gated on navigator.onLine: flaky "still online" wifi
    // is exactly when the fallback is needed.
    if (offlineModeOn && hasSessionMarker()) {
      const cached = await cacheGet<SafeUser>(USER_CACHE_KEY);
      assertCurrentAuthRead(epoch);
      if (cached) {
        markCacheServed(USER_CACHE_KEY);
        return cached;
      }
    }
    throw err;
  }
}

async function loginFn(credentials: { email: string; password: string }): Promise<SafeUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Login failed");
  }

  const data = rememberAppSession((await response.json()) as SafeUser);
  setSessionMarker(true);
  await cacheSet(USER_CACHE_KEY, data);
  return data;
}

async function registerFn(data: { email: string; password: string; displayName?: string }): Promise<SafeUser> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || "Registration failed");
  }

  const userData = rememberAppSession((await response.json()) as SafeUser);
  setSessionMarker(true);
  await cacheSet(USER_CACHE_KEY, userData);
  return userData;
}

async function logoutFn(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }
  // Wipe everything that could be replayed against another account on
  // this device: session marker, cached user, mirrored skills/routines,
  // AND any pending offline create queue entries.
  setSessionMarker(false);
  forgetAppSession();
  cancelPendingSettingsPush();
  clearSessionDraft();
  await cacheClearAll();
}

async function deleteAccountFn(): Promise<void> {
  const response = await fetch("/api/auth/account", {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || "Failed to delete account");
  }
  setSessionMarker(false);
  forgetAppSession();
  cancelPendingSettingsPush();
  clearSessionDraft();
  await cacheClearAll();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<SafeUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: loginFn,
    onMutate: () => beginAuthTransition(queryClient),
    onSuccess: (data) => {
      finishAuthTransition();
      trackEvent("account_login_succeeded");
      replaceIdentity(queryClient, data);
    },
    onError: () => failAuthTransition(queryClient),
  });

  const registerMutation = useMutation({
    mutationFn: registerFn,
    onMutate: () => beginAuthTransition(queryClient),
    onSuccess: (data) => {
      finishAuthTransition();
      trackEvent("account_registration_succeeded");
      replaceIdentity(queryClient, data);
    },
    onError: () => failAuthTransition(queryClient),
  });

  const logoutMutation = useMutation({
    mutationFn: logoutFn,
    onMutate: () => beginAuthTransition(queryClient),
    onSuccess: () => {
      finishAuthTransition();
      replaceIdentity(queryClient, null);
    },
    onError: () => failAuthTransition(queryClient),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccountFn,
    onMutate: () => beginAuthTransition(queryClient),
    onSuccess: () => {
      finishAuthTransition();
      replaceIdentity(queryClient, null);
    },
    onError: () => failAuthTransition(queryClient),
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    deleteAccount: deleteAccountMutation.mutateAsync,
    isDeletingAccount: deleteAccountMutation.isPending,
  };
}
