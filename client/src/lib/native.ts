import { handleLocalApi } from "./local-api/router";
import { isNativeApp } from "./platform";

/**
 * The iOS app has no server: every relative `/api/...` request is answered
 * on the device from the app's own data file (see ./local-api).
 */
export function installLocalApi(): void {
  if (!isNativeApp) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return handleLocalApi(input, init);
    }
    return originalFetch(input, init);
  };
}
