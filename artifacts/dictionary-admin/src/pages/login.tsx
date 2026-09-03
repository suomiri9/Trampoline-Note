import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@workspace/rebound/components/ui/button';
import { Input } from '@workspace/rebound/components/ui/input';
import { Label } from '@workspace/rebound/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@workspace/rebound/components/ui/card';
import { cn } from '@workspace/rebound/lib/utils';
import { toast } from '@workspace/rebound/hooks/use-toast';
import type { AuthUser } from '@/hooks/use-auth';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Login failed' }));
        setError(data.message ?? 'Login failed');
        return;
      }
      const user: AuthUser = await res.json();
      toast({ title: 'Signed in', description: `Welcome, ${user.displayName ?? user.email}` });
      onLogin(user);
      setLocation('/');
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="eyebrow text-muted-foreground mb-2">Dictionary Admin</p>
          <h1 className="page-title text-foreground">Owner Sign In</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Restricted to Trampoline workspace owners.
          </p>
        </div>

        <Card className="panel-hairline">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign in to your account</CardTitle>
            <CardDescription>Enter your credentials to access the dictionary workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="owner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isPending}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isPending}
                  data-testid="input-password"
                />
              </div>

              {error && (
                <p
                  className="text-sm text-destructive rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2"
                  data-testid="login-error"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isPending}
                data-testid="button-submit"
              >
                {isPending ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
