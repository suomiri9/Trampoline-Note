import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/rebound/components/ui/toaster';
import { TooltipProvider } from '@workspace/rebound/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import { useAuth } from '@/hooks/use-auth';
import type { AuthUser } from '@/hooks/use-auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppShell() {
  const { user, isLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // Use either the hook user or the locally set user
  const currentUser = authUser ?? user;

  function handleLogin(u: AuthUser) {
    setAuthUser(u);
    queryClient.clear();
  }

  function handleLogout() {
    setAuthUser(null);
    refetch();
    queryClient.clear();
    setLocation('/login');
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {currentUser ? (
          <Redirect to="/" />
        ) : (
          <LoginPage onLogin={handleLogin} />
        )}
      </Route>
      <Route path="/">
        {!currentUser ? (
          <Redirect to="/login" />
        ) : !currentUser.isAdmin ? (
          <RestrictedView email={currentUser.email} onLogout={handleLogout} />
        ) : (
          <Dashboard user={currentUser} onLogout={handleLogout} />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function RestrictedView({ email, onLogout }: { email: string; onLogout: () => void }) {
  async function signOut() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    onLogout();
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm space-y-4">
        <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Access Restricted</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {email} does not have owner access to the Dictionary Admin workspace.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          onClick={() => void signOut()}
          data-testid="button-restricted-logout"
        >
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <AppShell />
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
