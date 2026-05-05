import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getOfflineModeEnabled } from "./lib/offline-mode";
import { registerServiceWorker } from "./lib/offline-control";

if (getOfflineModeEnabled()) {
  window.addEventListener("load", () => {
    void registerServiceWorker();
  });
}

const RESIZE_OBSERVER_RE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

window.addEventListener(
  "error",
  (e) => {
    if (e.message && RESIZE_OBSERVER_RE.test(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
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
    }
  },
  true,
);

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === "string" && RESIZE_OBSERVER_RE.test(first)) return;
  if (first && typeof (first as any).message === "string" && RESIZE_OBSERVER_RE.test((first as any).message)) return;
  originalConsoleError.apply(console, args as []);
};

createRoot(document.getElementById("root")!).render(<App />);
