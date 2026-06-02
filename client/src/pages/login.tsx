import { Activity, Loader2, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { useState } from "react";

export default function LoginPage() {
  const { login, register, loginError, registerError, isLoggingIn, isRegistering } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const isOnline = useOnline();

  const error = mode === "login" ? loginError : registerError;
  const isPending = mode === "login" ? isLoggingIn : isRegistering;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) return;
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({ email, password, displayName: displayName || undefined });
      }
    } catch {
    }
  };

  if (!isOnline) {
    return (
      <div
        className="min-h-[100svh] flex flex-col items-center justify-center bg-mesh px-6"
        data-testid="page-login-offline"
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground btn-3d">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold tracking-tight">Trampoline Note</h1>
              <p className="text-muted-foreground mt-1.5">Track your training, skills, and scores.</p>
            </div>
          </div>

          <div className="w-full card-3d rounded-2xl p-6 flex flex-col items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary text-muted-foreground">
              <WifiOff className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold">You're offline</h2>
            <p className="text-sm text-muted-foreground" data-testid="text-auth-offline">
              Connect to the internet to sign in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center bg-mesh px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground btn-3d">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Trampoline Note</h1>
            <p className="text-muted-foreground mt-1.5">Track your training, skills, and scores.</p>
          </div>
        </div>

        <div className="w-full card-3d rounded-2xl p-6 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-center">
            {mode === "login" ? "Sign in to access your training data." : "Create an account to get started."}
          </p>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" data-testid="text-auth-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-xl h-11"
                  data-testid="input-display-name"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl h-11"
                data-testid="input-email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                className="rounded-xl h-11"
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-semibold mt-1 btn-3d"
              disabled={isPending}
              data-testid="button-submit"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "login" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              data-testid="button-toggle-mode"
            >
              {mode === "login" ? "Don't have an account? Create one" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Your data is stored privately and linked to your account.
        </p>
      </div>
    </div>
  );
}
