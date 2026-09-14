import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SafeUser } from "@shared/models/auth";
import { cacheGet, cacheSet, cacheClearAll } from "@/lib/offline-db";
import { cancelPendingSettingsPush } from "@/lib/settings-sync";
import { getOfflineModeEnabled } from "@/lib/offline-mode";
import { fetchWithTimeout, markCacheServed, markNetworkOk } from "@/lib/read-fallback";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";

const USER_CACHE_KEY = "user";
const SESSION_MARKER_KEY = "tn-session-active";

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
  const offlineModeOn = getOfflineModeEnabled();
  try {
    // Cap the wait when offline mode is on: on flaky wifi this request can
    // hang for minutes while navigator.onLine still reads true, leaving the
    // auth gate on a spinner forever (the cold-start deep-link hang).
    const response = offlineModeOn
      ? await fetchWithTimeout("/api/auth/user", { credentials: "include" })
      : await fetch("/api/auth/user", { credentials: "include" });

    if (response.status === 401) {
      // Definitive server answer — identity is no longer mirror-served.
      markNetworkOk(USER_CACHE_KEY);
      setSessionMarker(false);
      await cacheClearAll();
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
    // Fully parsed network result — clear this key's saved-data signal.
    markNetworkOk(USER_CACHE_KEY);
    setSessionMarker(true);
    await cacheSet(USER_CACHE_KEY, data);
    return data;
  } catch (err) {
    // Fall back to the cached identity whenever the network layer failed
    // (rejected, timed out, or the server errored) while offline mode is on
    // AND we previously held a verified session (marker present). A real
    // 401 never reaches this catch — it's handled above and wipes the
    // cache — so a signed-out session can't be resurrected from here.
    // Deliberately NOT gated on navigator.onLine: flaky "still online" wifi
    // is exactly when the fallback is needed.
    if (offlineModeOn && hasSessionMarker()) {
      const cached = await cacheGet<SafeUser>(USER_CACHE_KEY);
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

  const data = (await response.json()) as SafeUser;
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

  const userData = (await response.json()) as SafeUser;
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
  cancelPendingSettingsPush();
  await cacheClearAll();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<SafeUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: loginFn,
    onSuccess: (data) => {
      trackEvent("account_login_succeeded");
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerFn,
    onSuccess: (data) => {
      trackEvent("account_registration_succeeded");
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutFn,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/user"], null);
    },
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
  };
}
