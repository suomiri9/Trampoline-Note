import { useEffect, useState } from "react";

const VISIBLE_MS = 1500;
const FADE_MS = 500;

// Shown on EVERY platform, including installed iOS PWAs: the native
// apple-touch-startup-image launch images are generated to look identical to
// this splash, so on iOS the static image hands off seamlessly to this live
// overlay — which then plays the icon bounce animation.
function isIosStandalone() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  // navigator.standalone is true for BOTH iOS home-screen PWAs and macOS
  // "Add to Dock" web apps; only iOS/iPadOS shows a native launch image
  // (the apple-touch-startup-image media queries never match a Mac).
  const isIosDevice =
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return nav.standalone === true && isIosDevice;
}

export function SplashScreen() {
  // On installed iOS PWAs the native launch image is already on screen when we
  // mount, so skip the fade-in-up entrance (it would blank the content for a
  // frame) and let the bounce play immediately.
  const [skipEntrance] = useState(isIosStandalone);
  // iOS only: hold the content invisible until the icon image is actually
  // decoded, so the splash never paints the title with a blank hole where the
  // icon belongs (the gap the native launch image hands off into). The icon is
  // preloaded from index.html, so this is normally instant.
  const [iconReady, setIconReady] = useState(!isIosStandalone());
  // iOS standalone geometry fix: the static launch image is centered on the
  // FULL screen, but with status-bar-style "black" the web viewport starts
  // BELOW the status bar — so viewport-centered content sits statusBar/2 lower
  // than the static image and visibly jumps at handoff (worst on notched
  // iPhones, invisible on iPads with their thin bar). Measure the bar
  // (screen.height − innerHeight) and shift the content up by half of it so
  // the live splash lands exactly on the static image.
  const [standaloneShift] = useState(() => {
    if (!isIosStandalone()) return 0;
    const bar = (window.screen?.height ?? 0) - window.innerHeight;
    return bar > 0 && bar < 120 ? bar / 2 : 0;
  });
  const [done, setDone] = useState(false);
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

  // Safety net: never stay invisible if the icon load stalls or errors.
  useEffect(() => {
    if (iconReady) return;
    const t = setTimeout(() => setIconReady(true), 600);
    return () => clearTimeout(t);
  }, [iconReady]);

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
      <div
        className={`flex flex-col items-center gap-7 ${
          iconReady ? "" : "invisible"
        } ${skipEntrance ? "" : "animate-fade-in-up"}`}
        style={standaloneShift > 0 ? { transform: `translateY(-${standaloneShift}px)` } : undefined}
      >
        <img
          src="/icon-512.png"
          alt=""
          draggable={false}
          ref={(el) => {
            if (el && el.complete) setIconReady(true);
          }}
          onLoad={() => setIconReady(true)}
          onError={() => setIconReady(true)}
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
