import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import SkillsPage from "@/pages/skills";
import SkillDetailPage from "@/pages/skill-detail";
import RoutinesPage from "@/pages/routines";
import RoutineDetailPage from "@/pages/routine-detail";
import StatsPage from "@/pages/stats";
import LoginPage from "@/pages/login";
import ScorePage from "@/pages/score";
import SettingsPage from "@/pages/settings";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Layers, BarChart3, Trophy, Loader2, Settings } from "lucide-react";
import { useEffect } from "react";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { drainQueue } from "@/lib/offline-queue";
import { useToast } from "@/hooks/use-toast";
import { OfflineIndicator } from "@/components/offline-indicator";

function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const navItems = [
    { href: "/", label: "Training", icon: LayoutDashboard,
      activeClass: "bg-blue-50 dark:bg-blue-950/40 shadow-sm",
      colorClass: "text-blue-600 dark:text-blue-400" },
    { href: "/score", label: "Score", icon: Trophy,
      activeClass: "bg-yellow-50 dark:bg-yellow-950/40 shadow-sm",
      colorClass: "text-yellow-500 dark:text-yellow-400" },
    { href: "/stats", label: "Progress", icon: BarChart3,
      activeClass: "bg-slate-100 dark:bg-slate-800/40 shadow-sm",
      colorClass: "text-slate-500 dark:text-slate-400" },
    { href: "/skills", label: "Skills", icon: Target,
      activeClass: "bg-red-50 dark:bg-red-950/40 shadow-sm",
      colorClass: "text-red-500 dark:text-red-400" },
    { href: "/routines", label: "Routines", icon: Layers,
      activeClass: "bg-zinc-100 dark:bg-zinc-800/40 shadow-sm",
      colorClass: "text-zinc-600 dark:text-zinc-400" },
  ];

  return (
    <nav className="fixed bottom-4 left-0 right-0 mx-auto w-fit glass-surface px-3 pt-2 pb-2 mb-safe rounded-2xl flex items-center gap-1 z-40">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
            (location === item.href || (item.href !== "/" && location.startsWith(item.href + "/")))
              ? `${item.activeClass} ${item.colorClass} font-semibold`
              : "hover:bg-secondary"
          )}>
            <item.icon className={cn("w-4 h-4", item.colorClass)} />
            <span className={cn(
              "hidden sm:inline",
              (location === item.href || (item.href !== "/" && location.startsWith(item.href + "/"))) ? "" : "text-muted-foreground"
            )}>{item.label}</span>
          </div>
        </Link>
      ))}

      {user && (
        <Link href="/settings">
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
            location === "/settings"
              ? "bg-zinc-100 dark:bg-zinc-800/40 shadow-sm text-zinc-600 dark:text-zinc-400 font-semibold"
              : "text-muted-foreground hover:bg-secondary"
          )}
          data-testid="link-settings"
          >
            <Settings className={cn("w-4 h-4", location === "/settings" && "text-zinc-600 dark:text-zinc-400")} />
            <span className="hidden sm:inline">Settings</span>
          </div>
        </Link>
      )}
    </nav>
  );
}

function Router() {
  return (
    <div className="pb-20 bg-mesh min-h-screen">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/score" component={ScorePage} />
        <Route path="/stats" component={StatsPage} />
        <Route path="/skills" component={SkillsPage} />
        <Route path="/skills/:id" component={SkillDetailPage} />
        <Route path="/routines" component={RoutinesPage} />
        <Route path="/routines/:id" component={RoutineDetailPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
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
    return <LoginPage />;
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
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
