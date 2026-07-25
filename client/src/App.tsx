import { Switch, Route, Link, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { lazy, Suspense } from "react";

const Home = lazy(() => import("@/pages/home"));
const SkillsPage = lazy(() => import("@/pages/skills"));
const SkillDetailPage = lazy(() => import("@/pages/skill-detail"));
const RoutinesPage = lazy(() => import("@/pages/routines"));
const RoutineDetailPage = lazy(() => import("@/pages/routine-detail"));
const StatsPage = lazy(() => import("@/pages/stats"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const ScorePage = lazy(() => import("@/pages/score"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const WhoopPage = lazy(() => import("@/pages/whoop"));
const CoachPage = lazy(() => import("@/pages/coach"));
const TofPage = lazy(() => import("@/pages/tof"));
const TofSkillPage = lazy(() => import("@/pages/tof-skill"));
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Layers, BarChart3, Trophy, Loader2, Settings, HeartPulse, Bot, MoreHorizontal, Timer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { drainQueue } from "@/lib/offline-queue";
import { useToast } from "@/hooks/use-toast";
import { OfflineIndicator } from "@/components/offline-indicator";
import { CoachWidget } from "@/components/coach-widget";
import { SplashScreen } from "@/components/splash-screen";

function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const navItems = [
    { href: "/", label: "Training", icon: LayoutDashboard, lightColor: "text-blue-600/55 dark:text-blue-400/45", activeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    { href: "/score", label: "Score", icon: Trophy, lightColor: "text-yellow-600/60 dark:text-yellow-400/45", activeColor: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
    { href: "/stats", label: "Progress", icon: BarChart3, lightColor: "text-green-600/55 dark:text-green-400/45", activeColor: "bg-green-500/15 text-green-600 dark:text-green-400" },
    { href: "/skills", label: "Skills", icon: Target, lightColor: "text-red-600/55 dark:text-red-400/45", activeColor: "bg-red-500/15 text-red-600 dark:text-red-400" },
    { href: "/routines", label: "Routines", icon: Layers, lightColor: "text-purple-600/55 dark:text-purple-400/45", activeColor: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  ];

  const moreItems = [
    { href: "/whoop", label: "WHOOP", icon: HeartPulse, iconColor: "text-rose-600 dark:text-rose-400" },
    { href: "/coach", label: "Coach", icon: Bot, iconColor: "text-cyan-600 dark:text-cyan-400" },
    { href: "/tof", label: "ToF", icon: Timer, iconColor: "text-amber-600 dark:text-amber-400" },
    ...(user ? [{ href: "/settings", label: "Settings", icon: Settings }] : []),
  ];
  const moreActive = moreItems.some(
    (item) => location === item.href || location.startsWith(item.href + "/"),
  );

  const baseItem =
    "flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-all cursor-pointer";

  // z-[60] — above dialogs (z-50) so the coach launcher stays visible over
  // popups. The wrapper itself is click-through; only the pill and the
  // launcher accept pointer events.
  return (
    <div className="fixed bottom-4 left-0 right-0 z-[60] mb-safe px-1 flex items-center justify-center gap-1.5 pointer-events-none">
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

function Router() {
  return (
    <div className="pt-safe pb-nav-safe bg-mesh min-h-[100dvh]">
      <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/score" component={ScorePage} />
        <Route path="/stats" component={StatsPage} />
        <Route path="/skills" component={SkillsPage} />
        <Route path="/skills/:id" component={SkillDetailPage} />
        <Route path="/routines" component={RoutinesPage} />
        <Route path="/routines/:id" component={RoutineDetailPage} />
        <Route path="/whoop" component={WhoopPage} />
        <Route path="/coach" component={CoachPage} />
        <Route path="/tof" component={TofPage} />
        <Route path="/tof/skill/:id" component={TofSkillPage} />
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
  const { isAuthenticated, isLoading } = useAuth();
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
      <TooltipProvider>
        <SplashScreen />
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
