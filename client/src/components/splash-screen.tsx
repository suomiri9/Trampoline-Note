import { useEffect, useState } from "react";

const VISIBLE_MS = 1500;
const FADE_MS = 500;

function isIosStandalone() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  // navigator.standalone is true for BOTH iOS home-screen PWAs and macOS
  // "Add to Dock" web apps. We only want to skip our in-app splash where Apple
  // already shows a NATIVE launch image — that's iOS/iPadOS only (the
  // apple-touch-startup-image media queries match iPhone/iPad sizes, never a Mac).
  // So on a MacBook dock app we still show the splash.
  const isIosDevice =
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return nav.standalone === true && isIosDevice;
}

export function SplashScreen() {
  const [done, setDone] = useState(isIosStandalone);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (done) return;
    const leaveTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const doneTimer = setTimeout(() => setDone(true), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [done]);

  if (done) return null;

  return (
    <div
      data-testid="splash-screen"
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background bg-mesh transition-opacity ease-out ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="flex flex-col items-center gap-7 animate-fade-in-up">
        <img
          src="/icon-512.png"
          alt=""
          draggable={false}
          className="h-24 w-24 select-none rounded-3xl shadow-2xl shadow-primary/25 ring-1 ring-black/5 dark:ring-white/10 animate-splash-bounce"
        />
        <div className="flex flex-col items-center gap-2.5">
          <h1 className="page-title text-5xl">
            Trampoline <span className="title-accent">Note</span>
          </h1>
          <p className="eyebrow text-[11px] text-muted-foreground/70">
            Jump · Log · Progress
          </p>
        </div>
      </div>
    </div>
  );
}
