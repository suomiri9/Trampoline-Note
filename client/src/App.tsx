import { Switch, Route, Link, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { lazy, Suspense, useState, useRef } from "react";
import { getOfflineModeEnabled } from "@/lib/offline-mode";
import { OFFLINE_READ_TIMEOUT_MS } from "@/lib/read-fallback";

// A stale tab/PWA (still running a previous build) that lazy-loads a page
// AFTER a newer build went live asks for a chunk hash that no longer exists:
// the server replaced the file and the new service worker pruned it from the
// cache. While online the cure is a full reload (fresh HTML + new chunks), so
// ChunkRecovery does that automatically — but at most once per minute, so a
// genuinely broken server can never reload-loop the app.
function autoReloadOncePerMinute(): boolean {
  try {
    const KEY = "tn-chunk-auto-reload-at";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
    return true;
  } catch {
    // Storage unavailable (private mode etc.) — never risk a reload loop.
    return false;
  }
}

// Lazy route loader that doesn't blank the whole app when a page's JS chunk
// can't be fetched (e.g. navigating offline to a page that was never loaded).
// Instead it renders a small "not downloaded yet" screen with a retry button.
//
// React.lazy caches a failed load forever, so on first failure it resolves to
// ChunkRecovery (never rejects), and ChunkRecovery owns every later retry:
// in-place import attempts on mount/tap, escalating a user-tapped retry that
// still fails while online to a full reload (fresh module map, always cures).
function lazyPage(load: () => Promise<{ default: React.ComponentType<any> }>) {
  // Once the real module loads (first try or any retry), it's cached here so
  // every later mount renders it instantly with no further network fetches.
  let Loaded: React.ComponentType<any> | null = null;
  // Chunk URL captured from the failed-import error. Chrome caches a FAILED
  // dynamic import in its module map, so re-running the same import() rejects
  // instantly without touching the network — retries must re-import the chunk
  // by URL with a cache-busting query instead.
  let failedUrl: string | null = null;
  let retrySeq = 0;

  const attemptLoad = async (force = false): Promise<{ default: React.ComponentType<any> }> => {
    // While the browser knows it's offline, only attempt the import when a
    // service worker controls the page — the SW serves precached chunks from
    // its cache, so the import succeeds with zero network. Without a
    // controller the fetch is guaranteed to fail, and a failed fetch poisons
    // the browser's module map (both the chunk itself and its
    // modulepreload'ed dependencies), after which even online imports of the
    // same URLs reject instantly from cache. Skipping that attempt keeps the
    // module map clean so the first online retry succeeds normally.
    // `force` (user tapped Retry) bypasses the guard: navigator.onLine can
    // misreport offline indefinitely (VPNs, macOS quirks), which would
    // otherwise make every Retry tap a silent no-op.
    if (
      !force &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false &&
      !navigator.serviceWorker?.controller
    ) {
      throw new Error("offline: skipping chunk import");
    }
    const doLoad = async (): Promise<{ default: React.ComponentType<any> }> => {
      try {
        return await load();
      } catch (err) {
        const m = /https?:\/\/\S+\.js/.exec(String(err));
        if (m) failedUrl = m[0];
        if (!failedUrl) throw err;
        // Fresh URL → fresh module-map entry → real network re-fetch.
        return await import(/* @vite-ignore */ `${failedUrl}?retry=${++retrySeq}`);
      }
    };
    // With offline mode on, chunks are precached by the service worker and
    // normally resolve instantly from cache — a load still pending after 8s
    // is wedged on flaky wifi. Reject so ChunkRecovery's card (with Retry)
    // replaces the endless spinner. If the slow fetch completes later it
    // still fills the browser's module cache, so the next retry is instant.
    if (!getOfflineModeEnabled()) return doLoad();
    const loading = doLoad();
    // The race can settle first; keep a handler attached so a late
    // rejection of the real load never surfaces as an unhandled rejection.
    loading.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        loading,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("offline: chunk load timed out")),
            OFFLINE_READ_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  // ChunkRecovery is what React.lazy resolves to when the FIRST import fails
  // (e.g. navigating offline to a never-downloaded page). React.lazy caches
  // its result forever, so recovery cannot happen by rebuilding the lazy
  // component: while the route is suspended, React re-mounts the subtree on
  // every retry, and "rebuild on failure" loops forever creating fresh
  // pending imports (the app just spins). Instead, this component owns all
  // retries itself: on every mount (and on Retry taps) it re-runs the dynamic
  // import and swaps in the real page in place — pure SPA, no reload.
  function ChunkRecovery(props: any) {
    const [Comp, setComp] = useState<React.ComponentType<any> | null>(() => Loaded);
    const [attempt, setAttempt] = useState(0);
    const [failedNow, setFailedNow] = useState(false);
    // Distinguishes user-tapped retries from automatic mount attempts so a
    // failing tap can escalate to a full reload without ever reload-looping.
    const userRetryRef = useRef(false);

    useEffect(() => {
      if (Comp) return;
      let alive = true;
      const isUserRetry = userRetryRef.current;
      userRetryRef.current = false;
      setFailedNow(false);
      attemptLoad(isUserRetry)
        .then((m) => {
          Loaded = m.default;
          if (alive) setComp(() => m.default);
        })
        .catch(() => {
          if (!alive) return;
          // An in-place retry can't cure a poisoned module map: once an
          // offline import failed, the browser cached rejections for the
          // chunk and/or its static deps, so the same URLs reject instantly
          // even after reconnecting. While the browser agrees we're online, a
          // full reload is the one path that always recovers (fresh module
          // map; also picks up a newer build when the old chunk is gone) —
          // taken unconditionally for a user-tapped Retry, and automatically
          // (guarded to once a minute) for the common stale-build case so the
          // user never even sees the card.
          if (
            navigator.onLine !== false &&
            (isUserRetry || autoReloadOncePerMinute())
          ) {
            window.location.reload();
            return;
          }
          setFailedNow(true);
        });
      return () => {
        alive = false;
      };
    }, [Comp, attempt]);

    if (Comp) return <Comp {...props} />;
    if (!failedNow) return <PageLoader />;
    // Honest copy: "offline" wording only when the browser is actually
    // offline. Online failures are almost always a stale build (or a server
    // hiccup), where "reconnect" is misleading.
    const offlineNow =
      typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center" data-testid="card-chunk-offline">
        <p className="text-lg font-medium">
          {offlineNow ? "This page isn't available offline yet" : "This page didn't load"}
        </p>
        <p className="text-sm text-muted-foreground">
          {offlineNow
            ? "It hasn't been downloaded to this device. Reconnect and try again."
            : "The app may have just been updated. Retry reloads it."}
        </p>
        <button
          className="mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm"
          onClick={() => {
            userRetryRef.current = true;
            setAttempt((a) => a + 1);
          }}
          data-testid="button-chunk-retry"
        >
          Retry
        </button>
      </div>
    );
  }

  const Lazy = lazy(() =>
    attemptLoad()
      .then((m) => {
        Loaded = m.default;
        return m;
      })
      .catch(() => ({ default: ChunkRecovery })),
  );

  return function LazyPageGate(props: any) {
    return <Lazy {...props} />;
  };
}

const Home = lazyPage(() => import("@/pages/home"));
const SkillsPage = lazyPage(() => import("@/pages/skills"));

const DictionaryPage = lazyPage(() => import("@/pages/dictionary"));
const SkillDetailPage = lazyPage(() => import("@/pages/skill-detail"));
const RoutinesPage = lazyPage(() => import("@/pages/routines"));
const RoutineDetailPage = lazyPage(() => import("@/pages/routine-detail"));
const StatsPage = lazyPage(() => import("@/pages/stats"));
const ForgotPasswordPage = lazyPage(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazyPage(() => import("@/pages/reset-password"));
const PrivacyPage = lazyPage(() => import("@/pages/privacy"));
const ScorePage = lazyPage(() => import("@/pages/score"));
const SettingsPage = lazyPage(() => import("@/pages/settings"));
const WhoopPage = lazyPage(() => import("@/pages/whoop"));
const CoachPage = lazyPage(() => import("@/pages/coach"));
const TofPage = lazyPage(() => import("@/pages/tof"));
const TofSkillPage = lazyPage(() => import("@/pages/tof-skill"));
const TofRoutinePage = lazyPage(() => import("@/pages/tof-routine"));
const TofSessionPage = lazyPage(() => import("@/pages/tof-session"));
const ExecutionSessionPage = lazyPage(() => import("@/pages/execution-session"));
const DebutsPage = lazyPage(() => import("@/pages/debuts"));
const ExecutionPage = lazyPage(() => import("@/pages/execution"));
const ExecutionRoutinePage = lazyPage(() => import("@/pages/execution-routine"));
const ExecutionSkillPage = lazyPage(() => import("@/pages/execution-skill"));
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Layers, BarChart3, Trophy, Loader2, Settings, HeartPulse, Bot, MoreHorizontal, Timer, ClipboardCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { drainQueue } from "@/lib/offline-queue";
import { applyAccountSettings } from "@/lib/settings-sync";
import { useToast } from "@/hooks/use-toast";
import { OfflineIndicator } from "@/components/offline-indicator";
import { CoachWidget } from "@/components/coach-widget";
import { SplashScreen } from "@/components/splash-screen";

function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const navItems = [
    { href: "/", label: "Training", icon: LayoutDashboard, lightColor: "text-blue-400/45", activeColor: "bg-blue-500/15 text-blue-400" },
    { href: "/score", label: "Score", icon: Trophy, lightColor: "text-yellow-400/45", activeColor: "bg-yellow-500/15 text-yellow-400" },
    { href: "/stats", label: "Progress", icon: BarChart3, lightColor: "text-green-400/45", activeColor: "bg-green-500/15 text-green-400" },
    { href: "/skills", label: "Skills", icon: Target, lightColor: "text-red-400/45", activeColor: "bg-red-500/15 text-red-400" },
    { href: "/routines", label: "Routines", icon: Layers, lightColor: "text-purple-400/45", activeColor: "bg-purple-500/15 text-purple-400" },
  ];

  const moreItems = [
    { href: "/whoop", label: "WHOOP", icon: HeartPulse, iconColor: "text-rose-600 dark:text-rose-400" },
    { href: "/coach", label: "Coach", icon: Bot, iconColor: "text-cyan-600 dark:text-cyan-400" },
    { href: "/tof", label: "ToF", icon: Timer, iconColor: "text-amber-600 dark:text-amber-400" },
    { href: "/execution", label: "Execution", icon: ClipboardCheck, iconColor: "text-emerald-600 dark:text-emerald-400" },
    ...(user ? [{ href: "/settings", label: "Settings", icon: Settings }] : []),
  ];
  const moreActive = moreItems.some(
    (item) => location === item.href || location.startsWith(item.href + "/"),
  );

  const baseItem =
    "flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer pressable";

  // z-[60] — above dialogs (z-50) so the coach launcher stays visible over
  // popups. The wrapper itself is click-through; only the pill and the
  // launcher accept pointer events.
  return (
    <div data-bottom-nav className="fixed bottom-4 left-0 right-0 z-[60] mb-safe px-1 flex items-center justify-center gap-1.5 pointer-events-none">
      <nav className="glass-surface px-1.5 sm:px-2 pt-2 pb-2 rounded-2xl flex items-center gap-0.5 sm:gap-1 pointer-events-auto">
      {navItems.map((item) => {
        const active =
          location === item.href ||
          (item.href !== "/" && location.startsWith(item.href + "/"));
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                baseItem,
                active
                  ? `${item.activeColor} font-semibold`
                  : `${item.lightColor} hover:bg-secondary`,
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </div>
          </Link>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              baseItem,
              moreActive
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            data-testid="button-nav-more"
            aria-label="More"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">More</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={10} className="w-44 rounded-xl z-[70]">
          {moreItems.map((item) => {
            const active = location === item.href || location.startsWith(item.href + "/");
            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 cursor-pointer font-mono uppercase tracking-wider text-[11px]",
                      active && "text-foreground font-semibold",
                    )}
                    data-testid={`link-more-${item.label.toLowerCase()}`}
                  >
                    <item.icon className={cn("w-4 h-4", item.iconColor)} />
                    {item.label}
                  </div>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      </nav>
      <CoachWidget />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-[100svh] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Safety net: if a modal dialog gets unmounted mid-navigation (e.g. bottom
// nav is clicked while a dialog is open), Radix's body scroll lock can leak
// and leave the page dimmed/unscrollable. Clear it once no dialog remains.
function BodyLockCleanup() {
  const [location] = useLocation();
  useEffect(() => {
    const t = setTimeout(() => {
      const anyOpen = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]',
      );
      if (!anyOpen) {
        if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
        if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
      }
    }, 350);
    return () => clearTimeout(t);
  }, [location]);
  return null;
}

function Router() {
  return (
    <div className="pt-safe pb-nav-safe bg-mesh min-h-[100dvh]">
      <BodyLockCleanup />
      <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/score" component={ScorePage} />
        <Route path="/score/debuts" component={DebutsPage} />
        <Route path="/stats" component={StatsPage} />
        <Route path="/skills" component={SkillsPage} />
        {/* Must come before /skills/:id so "dictionary" isn't parsed as an id. */}
        <Route path="/skills/dictionary" component={DictionaryPage} />
        <Route path="/skills/:id" component={SkillDetailPage} />
        <Route path="/routines" component={RoutinesPage} />
        <Route path="/routines/:id" component={RoutineDetailPage} />
        <Route path="/whoop" component={WhoopPage} />
        <Route path="/coach" component={CoachPage} />
        <Route path="/tof" component={TofPage} />
        <Route path="/tof/skill/:id" component={TofSkillPage} />
        <Route path="/tof/routine/:id" component={TofRoutinePage} />
        <Route path="/tof/session/:id" component={TofSessionPage} />
        <Route path="/execution" component={ExecutionPage} />
        <Route path="/execution/skill/:id" component={ExecutionSkillPage} />
        <Route path="/execution/routine/:id" component={ExecutionRoutinePage} />
        <Route path="/execution/session/:id" component={ExecutionSessionPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/forgot-password"><Redirect to="/" /></Route>
        <Route path="/reset-password"><Redirect to="/" /></Route>
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Account-synced general settings: apply the server copy whenever the
  // signed-in user (re)loads, so preferences follow the account across devices.
  useEffect(() => {
    if (user?.appSettings) applyAccountSettings(user.appSettings);
  }, [user?.appSettings]);
  const [offlineModeEnabled] = useOfflineMode();
  const { toast } = useToast();

  useEffect(() => {
    if (!offlineModeEnabled || !isAuthenticated) return;
    let cancelled = false;
    const tryDrain = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const { synced, rejected } = await drainQueue();
      if (cancelled) return;
      if (synced > 0) {
        toast({
          title: `Synced ${synced} offline ${synced === 1 ? "entry" : "entries"}.`,
        });
      }
      if (rejected > 0) {
        toast({
          title: `${rejected} offline ${rejected === 1 ? "entry was" : "entries were"} rejected.`,
          description: "Open Settings to review or discard them.",
          variant: "destructive",
        });
      }
    };
    void tryDrain();
    const onOnline = () => {
      void tryDrain();
      try {
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]').forEach((link) => {
          const href = link.href;
          const fresh = link.cloneNode(true) as HTMLLinkElement;
          fresh.href = href.includes("?") ? `${href}&_r=${Date.now()}` : `${href}?_r=${Date.now()}`;
          link.parentNode?.insertBefore(fresh, link.nextSibling);
          fresh.addEventListener("load", () => link.remove(), { once: true });
          fresh.addEventListener("error", () => fresh.remove(), { once: true });
        });
      } catch {}
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [offlineModeEnabled, isAuthenticated, toast]);

  useEffect(() => {
    const vv = window.visualViewport;
    let rafId = 0;
    let savedY = 0;

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      // Save scroll position at the moment of focus (before any Safari auto-scroll)
      savedY = window.scrollY;
      const rect = el.getBoundingClientRect();
      const viewH = vv ? vv.height : window.innerHeight;
      if (rect.top >= 0 && rect.bottom <= viewH) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (window.scrollY !== savedY) window.scrollTo(0, savedY);
        });
      }
    };

    // Covers virtual keyboard open, suggestion bar, AND autofill bar appearing
    const onVVResize = () => {
      if (!vv) return;
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      if (hidden > 0) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          // Use savedY from focus time, not current scroll, so autofill bar can't shift the page
          if (Math.abs(window.scrollY - savedY) < 300) window.scrollTo(0, savedY);
        });
      }
    };

    document.addEventListener("focusin", onFocusIn, true);
    vv?.addEventListener("resize", onVVResize);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      vv?.removeEventListener("resize", onVVResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route component={LoginPage} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <>
      <Navigation />
      <OfflineIndicator />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400} skipDelayDuration={500}>
        <SplashScreen />
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
