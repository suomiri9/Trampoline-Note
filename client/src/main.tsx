import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const RESIZE_OBSERVER_RE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

window.addEventListener("error", (e) => {
  if (e.message && RESIZE_OBSERVER_RE.test(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return;
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e.reason as any)?.message ?? e.reason ?? "");
  if (RESIZE_OBSERVER_RE.test(msg)) {
    e.preventDefault();
    return;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
