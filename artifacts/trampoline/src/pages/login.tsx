import { Loader2, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppMark, AuthHero } from "@/components/auth-hero";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { useState } from "react";
import { Link } from "wouter";

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
          <div className="flex flex-col items-center gap-4">
            <AppMark />
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em]">Trampoline <span className="text-gradient-icon">Note</span></h1>
              <p className="text-muted-foreground mt-1.5 text-sm">Track your training, skills, and scores.</p>
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
        <AuthHero
          eyebrow="Training log"
          title={<>Trampoline <span className="text-gradient-icon">Note</span></>}
          subtitle="Track your training, skills, and scores."
        />

        <div className="w-full card-3d rounded-2xl p-6 flex flex-col gap-5 motion-safe:animate-fade-in-up motion-safe:[animation-delay:80ms] motion-safe:[animation-fill-mode:both]">
          <div key={mode} className="animate-morph-blur text-center flex flex-col gap-1">
            <h2 className="text-[22px] font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
              <span className="text-gradient-primary">.</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Sign in to access your training data." : "Start tracking your training in minutes."}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" data-testid="text-auth-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  autoComplete="name"
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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl h-11"
                data-testid="input-email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "login" && (
                  <Link href="/forgot-password" data-testid="link-forgot-password">
                    <span className="inline-flex items-center px-2 py-2 -mx-2 -my-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer">
                      Forgot password?
                    </span>
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
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
              className="w-full h-11 rounded-xl font-semibold mt-1 shadow-lg shadow-primary/25"
              disabled={isPending}
              data-testid="button-submit"
            >
              <span
                key={`${mode}-${String(isPending)}`}
                className="animate-morph-blur inline-flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </span>
            </Button>
          </form>

          <div className="border-t border-border/40 pt-4 -mb-1 text-center">
            <button
              type="button"
              className="inline-flex items-center px-2 py-1 text-sm"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              data-testid="button-toggle-mode"
            >
              <span key={mode} className="animate-morph-blur">
                {mode === "login" ? (
                  <>
                    <span className="text-muted-foreground">Don't have an account?</span>{" "}
                    <span className="text-primary font-medium">Create one</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">Already have an account?</span>{" "}
                    <span className="text-primary font-medium">Sign in</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center motion-safe:animate-fade-in-up motion-safe:[animation-delay:140ms] motion-safe:[animation-fill-mode:both]">
          Your data is stored privately and linked to your account.
        </p>
      </div>
    </div>
  );
}
