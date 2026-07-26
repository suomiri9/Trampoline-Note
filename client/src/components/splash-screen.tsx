import { useEffect } from "react";

const VISIBLE_MS = 1500;
const FADE_MS = 500;

// The splash itself lives in index.html (#boot-splash): pure HTML + inline CSS
// painted during page parse, so the trampoline bounce starts long before the
// React bundle downloads and boots (a cold PWA launch used to sit frozen on
// the static iOS launch image for ~1s). This component renders NOTHING — it
// only times the fade-out and removes that node once the app is mounted, so
// the splash is the same DOM element the whole time and there is no handoff
// snap mid-bounce. iOS-standalone tweaks (skip entrance, status-bar offset,
// hold-until-icon-ready) are handled by the inline script in index.html.
export function SplashScreen() {
  useEffect(() => {
    const el = document.getElementById("boot-splash");
    if (!el) return;
    const leaveTimer = setTimeout(() => {
      el.style.transition = `opacity ${FADE_MS}ms ease-out`;
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }, VISIBLE_MS);
    const doneTimer = setTimeout(() => el.remove(), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return null;
}
