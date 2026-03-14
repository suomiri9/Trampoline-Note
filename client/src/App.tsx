import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import SkillsPage from "@/pages/skills";
import RoutinesPage from "@/pages/routines";
import StatsPage from "@/pages/stats";
import LoginPage from "@/pages/login";
import ScorePage from "@/pages/score";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Layers, BarChart3, Trophy, LogOut, Loader2, UserCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

function Navigation() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);
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
    <nav className="fixed bottom-4 left-0 right-0 mx-auto w-fit bg-background/80 backdrop-blur-md border border-border px-3 pt-2 pb-2 mb-safe rounded-2xl shadow-2xl flex items-center gap-1 z-40">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
            location === item.href
              ? `${item.activeClass} ${item.colorClass} font-semibold`
              : "hover:bg-secondary"
          )}>
            <item.icon className={cn("w-4 h-4", item.colorClass)} />
            <span className={cn(
              "hidden sm:inline",
              location === item.href ? "" : "text-muted-foreground"
            )}>{item.label}</span>
          </div>
        </Link>
      ))}

      {user && (
        <Popover>
          <PopoverTrigger asChild>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer text-muted-foreground hover:bg-secondary">
              <UserCircle className="w-4 h-4" />
              <span className="hidden sm:inline max-w-[80px] truncate">
                {user.displayName ?? user.firstName ?? user.email?.split("@")[0] ?? "Account"}
              </span>
            </div>
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-56 rounded-2xl p-3 mb-2">
            <div className="mb-3 px-1">
              <p className="text-xs font-semibold text-foreground truncate">
                {user.displayName ?? (user.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "My Account")}
              </p>
              {user.email && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
              )}
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9 rounded-xl text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowSignOutAlert(true)}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign out
            </Button>
          </PopoverContent>
        </Popover>
      )}

      <ConfirmDialog
        open={showSignOutAlert}
        onOpenChange={setShowSignOutAlert}
        title="Sign out?"
        description="Are you sure you want to sign out of your account?"
        onConfirm={() => logout()}
        confirmLabel="Sign out"
      />
    </nav>
  );
}

function Router() {
  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/score" component={ScorePage} />
        <Route path="/stats" component={StatsPage} />
        <Route path="/skills" component={SkillsPage} />
        <Route path="/routines" component={RoutinesPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

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
