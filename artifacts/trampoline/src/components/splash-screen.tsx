import { useEffect } from "react";

const VISIBLE_MS = 1500;
const FADE_MS = 500;
// The splash icon draws its graph one point per bounce; keep the splash up
// until the first full graph has been drawn (4 bounces of 0.7s plus a beat).
const FIRST_GRAPH_MS = 2900;
const MIN_AFTER_MOUNT_MS = 600;

declare global {
  interface Window {
    __bootSplashReadyAt?: number;
  }
}

// The splash itself lives in index.html (#boot-splash): pure HTML + inline CSS
// painted during page parse, so the trampoline bounce starts long before the
// React bundle downloads and boots (a cold PWA launch used to sit frozen on
// the static iOS launch image for ~1s). This component renders NOTHING — it
// only times the fade-out and removes that node once the app is mounted, so
// the splash is the same DOM element the whole time and there is no handoff
// snap mid-bounce. The loading gate (spinner until the icon + fonts are
// ready) is handled by the inline script in index.html.
export function SplashScreen() {
  useEffect(() => {
    const el = document.getElementById("boot-splash");
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const readyAt = window.__bootSplashReadyAt ?? performance.now();
    const visibleMs = reduceMotion
      ? VISIBLE_MS
      : Math.max(MIN_AFTER_MOUNT_MS, readyAt + FIRST_GRAPH_MS - performance.now());
    const leaveTimer = setTimeout(() => {
      el.style.transition = `opacity ${FADE_MS}ms ease-out`;
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }, visibleMs);
    const doneTimer = setTimeout(() => el.remove(), visibleMs + FADE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return null;
}
