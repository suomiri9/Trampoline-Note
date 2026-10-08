// Native touches for the iOS app (artifacts/ios-app), which loads this web
// app inside a Capacitor shell. Every helper is a no-op in a normal browser,
// so callers never need to check where they run.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNativeApp = Capacitor.isNativePlatform();

function run(fn: () => Promise<unknown>) {
  if (!isNativeApp) return;
  fn().catch(() => {
    // Haptics/status bar are cosmetic; never surface failures.
  });
}

export const haptics = {
  /** A light tap, e.g. picking a star rating. */
  tap: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** A selection tick, e.g. starting a drag. */
  select: () => run(() => Haptics.selectionChanged()),
  success: () => run(() => Haptics.notification({ type: NotificationType.Success })),
  error: () => run(() => Haptics.notification({ type: NotificationType.Error })),
};

/** Opens the iOS share sheet. Resolves false when not in the iOS app. */
export async function shareText(title: string, text: string): Promise<boolean> {
  if (!isNativeApp) return false;
  try {
    await Share.share({ title, text, dialogTitle: title });
  } catch {
    // Dismissing the share sheet rejects; that's not an error for the user.
  }
  return true;
}

/** Matches the status bar text color to the app theme. */
export function syncStatusBar(theme: "dark" | "light") {
  run(() => StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light }));
}

// ---------------------------------------------------------------------------
// API access from the iOS app
//
// The iOS app ships these screens on the device (origin capacitor://localhost)
// and talks to the hosted API. iOS blocks cross-site cookies there, so the
// server hands the app its session as a token at sign-in (see
// api-server/src/app-client.ts) and every request carries it as a header.
// ---------------------------------------------------------------------------

export const API_ORIGIN = (import.meta.env.VITE_APP_API_ORIGIN ?? "https://trampoline-note.onrender.com").replace(/\/+$/, "");
const TOKEN_KEY = "tn-app-session";

function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Stores the session token from a sign-in response and strips it from the data. */
export function rememberAppSession<T extends object>(data: T): T {
  const token = (data as { sessionToken?: unknown }).sessionToken;
  if (isNativeApp && typeof token === "string") {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }
  if ("sessionToken" in data) {
    const { sessionToken: _, ...rest } = data as T & { sessionToken?: unknown };
    return rest as T;
  }
  return data;
}

export function forgetAppSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/** Absolute URL for an /api path when running in the iOS app. */
export function apiUrl(path: string): string {
  return isNativeApp && path.startsWith("/api") ? API_ORIGIN + path : path;
}

/**
 * In the iOS app, sends every relative /api request to the hosted API with
 * the session token attached. No-op in a browser.
 */
export function installAppApiAccess(): void {
  if (!isNativeApp) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Request/URL objects arrive already resolved against the app's own origin.
    if (url.startsWith(window.location.origin + "/api")) url = url.slice(window.location.origin.length);
    if (!url.startsWith("/api")) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = getSessionToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    const target = input instanceof Request ? new Request(API_ORIGIN + url, input) : API_ORIGIN + url;
    return originalFetch(target, { ...init, headers });
  };
}

/** Where to send the browser to start "Sign in with WHOOP". */
export function whoopAuthUrl(): string {
  if (!isNativeApp) return "/api/whoop/auth";
  const token = getSessionToken() ?? "";
  return `${API_ORIGIN}/api/whoop/auth?app_token=${encodeURIComponent(token)}`;
}
