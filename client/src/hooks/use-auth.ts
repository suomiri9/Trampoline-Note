import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SafeUser } from "@shared/models/auth";
import { cacheGet, cacheSet, cacheClearAll } from "@/lib/offline-db";
import { getOfflineModeEnabled } from "@/lib/offline-mode";

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
  try {
    const response = await fetch("/api/auth/user", {
      credentials: "include",
    });

    if (response.status === 401) {
      setSessionMarker(false);
      await cacheClearAll();
      return null;
    }

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as SafeUser;
    setSessionMarker(true);
    await cacheSet(USER_CACHE_KEY, data);
    return data;
  } catch (err) {
    // Only fall back to cached identity when offline mode is on, the
    // device is offline, AND we previously held a verified session
    // (session marker present). This prevents a stale cached user from
    // being shown when the session was invalidated or the user signed
    // out on another device.
    if (
      getOfflineModeEnabled() &&
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      hasSessionMarker()
    ) {
      const cached = await cacheGet<SafeUser>(USER_CACHE_KEY);
      if (cached) return cached;
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
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerFn,
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutFn,
    onSuccess: () => {
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
