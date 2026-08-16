import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Intent design-system tokens (generated bridge — see script/sync-intent-tokens.mjs).
// Imported after index.css so its :root/.dark variable blocks are authoritative.
import "./intent-tokens.css";
import { ensureOfflineReady } from "./lib/offline-control";
import { applyTheme, getTheme } from "./lib/theme";

// Offline self-heal: whenever the app is open with a connection (launch,
// reconnect, foreground-resume), re-register the service worker, refill any
// cached files the OS evicted, and re-mirror core reference data. Each call
// self-gates on the offline-mode toggle and is throttled internally.
window.addEventListener("load", () => {
  void ensureOfflineReady();
});
window.addEventListener("online", () => {
  void ensureOfflineReady();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void ensureOfflineReady();
});

const RESIZE_OBSERVER_RE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

window.addEventListener(
  "error",
  (e) => {
    if (e.message && RESIZE_OBSERVER_RE.test(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    // Normalize uncaught non-Error throws (e.g. `throw null` / a plain
    // object from a third-party script): log a real Error with whatever
    // detail exists instead of letting an unidentifiable payload surface
    // as an opaque runtime crash.
    if (!(e.error instanceof Error)) {
      e.preventDefault();
      console.error(
        new Error(
          `Uncaught non-Error value: ${safeStringify(e.error)} (message: ${e.message || "n/a"}, source: ${e.filename || "n/a"}:${e.lineno ?? "?"})`,
        ),
      );
    }
  },
  true,
);

window.addEventListener(
  "unhandledrejection",
  (e) => {
    const msg = String((e.reason as any)?.message ?? e.reason ?? "");
    if (RESIZE_OBSERVER_RE.test(msg)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    // Normalize promise rejections whose reason is not an Error (null,
    // string, plain object) into a logged Error so they are diagnosable
    // rather than reported as "not an error object".
    if (!(e.reason instanceof Error)) {
      e.preventDefault();
      console.error(
        new Error(`Unhandled rejection with non-Error reason: ${safeStringify(e.reason)}`),
      );
    }
  },
  true,
);

function safeStringify(v: unknown): string {
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === "string" && RESIZE_OBSERVER_RE.test(first)) return;
  if (first && typeof (first as any).message === "string" && RESIZE_OBSERVER_RE.test((first as any).message)) return;
  originalConsoleError.apply(console, args as []);
};

// iOS Safari only applies :active styles while a finger is down if at least
// one touchstart listener exists (historic WebKit quirk). This no-op enables
// the app-wide pointer-down press feedback (.pressable, index.css).
document.addEventListener("touchstart", () => {}, { passive: true });

applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(<App />);
