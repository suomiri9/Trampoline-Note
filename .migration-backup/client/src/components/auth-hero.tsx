import { Activity } from "lucide-react";

/** Ambient app mark — the auth surface's refined replacement for btn-3d's boxy glow. */
export function AppMark() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-10 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.22),transparent_65%)] pointer-events-none"
      />
      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground ring-1 ring-white/15 shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.6)]">
        <Activity className="w-8 h-8" />
      </div>
    </div>
  );
}

/** Shared hero for the standalone auth pages (login / forgot / reset password). */
export function AuthHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center motion-safe:animate-fade-in-up motion-safe:[animation-fill-mode:both]">
      <AppMark />
      <div>
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary/70 mb-2">{eyebrow}</div>
        <h1 className="text-3xl font-black tracking-[-0.04em]">{title}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}
