import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

// Online state derived from navigator.onLine — but never trusted blindly.
// iOS (especially the installed standalone PWA) can miss the online/offline
// events fired while the app was suspended, and can keep a stale
// navigator.onLine value for a while after resume. Event-only state (like
// React Query's onlineManager, or this hook before) then stays "offline"
// until the app is force-quit. So: re-read the flag every time the app
// returns to the foreground, and whenever it reads true, heal onlineManager
// too so reconnect refetches resume. We never push `false` into
// onlineManager from the flag — v5 deliberately starts it at `true` because
// navigator.onLine under-reports connectivity; real `offline` events still
// set it false through React Query's own listener.

function readOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

let current = readOnline();
const subscribers = new Set<() => void>();
let wired = false;

function sync() {
  const next = readOnline();
  if (next) onlineManager.setOnline(true);
  if (next !== current) {
    current = next;
    subscribers.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
  }
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  // Foreground-return hooks: these DO fire reliably on resume, unlike the
  // online/offline events above.
  window.addEventListener("focus", sync);
  window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", sync);
}

function subscribe(fn: () => void): () => void {
  wire();
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribe, () => current, () => true);
}
