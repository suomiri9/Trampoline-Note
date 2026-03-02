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
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Layers, BarChart3 } from "lucide-react";

function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Training", icon: LayoutDashboard },
    { href: "/skills", label: "Skills", icon: Target },
    { href: "/routines", label: "Routines", icon: Layers },
    { href: "/stats", label: "Progress", icon: BarChart3 },
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-md border border-border px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2 z-50">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
            location === item.href 
              ? "bg-foreground text-background shadow-lg" 
              : "text-muted-foreground hover:bg-secondary"
          )}>
            <item.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </div>
        </Link>
      ))}
    </nav>
  );
}

function Router() {
  return (
    <div className="pb-24">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/skills" component={SkillsPage} />
        <Route path="/routines" component={RoutinesPage} />
        <Route path="/stats" component={StatsPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Navigation />
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
