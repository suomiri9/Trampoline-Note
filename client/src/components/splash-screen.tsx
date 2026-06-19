import { useEffect, useState } from "react";

const VISIBLE_MS = 1500;
const FADE_MS = 500;

function isIosStandalone() {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
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
          className="h-24 w-24 select-none rounded-3xl shadow-2xl shadow-primary/25 ring-1 ring-white/10 animate-splash-bounce"
        />
        <div className="flex flex-col items-center gap-2.5">
          <h1 className="page-title text-5xl">
            Trampoline <span className="title-accent">Log</span>
          </h1>
          <p className="eyebrow text-[11px] text-muted-foreground/70">
            Jump · Log · Progress
          </p>
        </div>
      </div>
    </div>
  );
}
