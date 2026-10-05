import { Capacitor } from "@capacitor/core";

/** True when running inside the iOS (Capacitor) app rather than a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * In the iOS app the UI is bundled on the device, so relative `/api/...`
 * requests must be sent to the hosted server instead. The URL comes from
 * VITE_API_BASE_URL at build time (e.g. https://trampoline-note.replit.app).
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function installNativeApiBase(): void {
  if (!isNativeApp) return;
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL is not set; API calls will fail in the iOS app.");
    return;
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return originalFetch(API_BASE_URL + input, init);
    }
    return originalFetch(input, init);
  };
}
