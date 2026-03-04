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
import { LayoutDashboard, Target, Layers, BarChart3, Trophy, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function Navigation() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const navItems = [
    { href: "/", label: "Training", icon: LayoutDashboard },
    { href: "/score", label: "Score", icon: Trophy },
    { href: "/stats", label: "Progress", icon: BarChart3 },
    { href: "/skills", label: "Skills", icon: Target },
    { href: "/routines", label: "Routines", icon: Layers },
  ];

  return (
    <nav className="fixed left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-md border border-border px-3 py-2 rounded-2xl shadow-2xl flex items-center gap-1 z-50" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
            location === item.href
              ? "bg-foreground text-background shadow-lg"
              : "text-muted-foreground hover:bg-secondary"
          )}>
            <item.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </div>
        </Link>
      ))}
      {user && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:bg-secondary rounded-xl ml-1"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title={`Sign out (${user.email ?? user.firstName ?? ""})`}
        >
          {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </Button>
      )}
    </nav>
  );
}

function Router() {
  return (
    <div style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
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
