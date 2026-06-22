import { Activity, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useSearch, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setTokenState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (!cancelled) setTokenState(data.valid ? "valid" : "invalid");
      } catch {
        if (!cancelled) setTokenState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setIsPending(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => setLocation("/"), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // apiRequest throws "<status>: <body>"; surface the server message.
      const clean = message.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(clean);
        setError(parsed.message || "Could not reset password.");
        if (/invalid or has expired/i.test(parsed.message || "")) {
          setTokenState("invalid");
        }
      } catch {
        setError(clean || "Could not reset password.");
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center bg-mesh px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground btn-3d">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary/70 mb-2">// Reset Password</div>
            <h1 className="text-3xl font-display font-normal tracking-tight">Set a new <span className="text-primary">password</span></h1>
            <p className="text-muted-foreground mt-1.5 font-mono text-sm">Choose a new password for your account.</p>
          </div>
        </div>

        <div className="w-full card-3d rounded-2xl p-6 flex flex-col gap-4">
          {tokenState === "checking" && (
            <div className="flex flex-col items-center gap-3 py-4" data-testid="status-token-checking">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            </div>
          )}

          {tokenState === "invalid" && (
            <div className="flex flex-col items-center gap-3 text-center py-2" data-testid="status-token-invalid">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/15 text-destructive">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold">Link invalid or expired</h2>
              <p className="text-sm text-muted-foreground">
                This password reset link is no longer valid. Reset links expire after 60 minutes and can only be used once.
              </p>
              <Link href="/forgot-password" data-testid="link-request-new">
                <span className="inline-flex items-center justify-center w-full h-11 rounded-xl font-semibold btn-3d bg-primary text-primary-foreground px-4 mt-1 cursor-pointer">
                  Request a new link
                </span>
              </Link>
            </div>
          )}

          {tokenState === "valid" && done && (
            <div className="flex flex-col items-center gap-3 text-center py-2" data-testid="status-reset-done">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 text-primary">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold">Password updated</h2>
              <p className="text-sm text-muted-foreground">
                Your password has been changed. Redirecting you to sign in…
              </p>
            </div>
          )}

          {tokenState === "valid" && !done && (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Enter a new password below. This will sign you out everywhere else.
              </p>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" data-testid="text-reset-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="rounded-xl h-11"
                    data-testid="input-new-password"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="rounded-xl h-11"
                    data-testid="input-confirm-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl font-semibold mt-1 btn-3d"
                  disabled={isPending}
                  data-testid="button-reset-password"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
                </Button>
              </form>
            </>
          )}

          <div className="text-center">
            <Link href="/" data-testid="link-back-to-login">
              <span className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
