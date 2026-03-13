import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Trampoline Log</h1>
            <p className="text-muted-foreground mt-1.5">Track your training, skills, and scores.</p>
          </div>
        </div>

        <div className="w-full bg-card border border-border/50 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
          <p className="text-sm text-muted-foreground text-center">
            Sign in to access your personal training data.
          </p>
          <Button
            className="w-full h-11 rounded-xl font-semibold"
            onClick={() => { window.location.href = "/api/login"; }}
          >
            Sign in with email
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Your data is stored privately and linked to your account.
        </p>
      </div>
    </div>
  );
}
