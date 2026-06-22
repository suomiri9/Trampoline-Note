import { Activity, Loader2, AlertCircle, MailCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
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
            <h1 className="text-3xl font-display font-normal tracking-tight">Forgot your <span className="text-primary">password?</span></h1>
            <p className="text-muted-foreground mt-1.5 font-mono text-sm">We'll email you a secure reset link.</p>
          </div>
        </div>

        <div className="w-full card-3d rounded-2xl p-6 flex flex-col gap-4">
          {sent ? (
            <div className="flex flex-col items-center gap-3 text-center py-2" data-testid="status-reset-sent">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 text-primary">
                <MailCheck className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-mono text-foreground">{email}</span>, a password reset link is on its way. The link expires in 60 minutes.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Enter the email for your account and we'll send you a link to set a new password.
              </p>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" data-testid="text-forgot-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
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

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl font-semibold mt-1 btn-3d"
                  disabled={isPending}
                  data-testid="button-send-reset"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
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
