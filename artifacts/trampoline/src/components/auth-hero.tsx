import { useId } from "react";

const GRAPH_POINTS = "340,690 430,610 520,640 610,500 690,410";
const DOTS: [number, number, number][] = [
  [340, 690, 22],
  [430, 610, 22],
  [520, 640, 22],
  [610, 500, 22],
  [690, 410, 32],
];

/** The app icon (white page with a rising graph on the blue gradient). On the
 *  auth pages the graph draws itself once, point by point, then stays still. */
export function AppMark() {
  const gradientId = useId();
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-10 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.22),transparent_65%)] pointer-events-none"
      />
      <svg
        viewBox="0 0 1024 1024"
        aria-hidden
        className="app-mark relative w-16 h-16 rounded-2xl ring-1 ring-white/15 shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.6)]"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3B5BFF" />
            <stop offset="1" stopColor="#00B4E6" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill={`url(#${gradientId})`} />
        <rect x="250" y="150" width="524" height="724" rx="64" fill="#fff" />
        <path d="M318 240H706M318 300H706" stroke="#D1D1D6" strokeWidth="20" strokeLinecap="round" />
        <path d="M314 770H710" stroke="#1C1C1E" strokeWidth="26" strokeLinecap="round" />
        <polyline
          className="app-mark-line"
          pathLength={100}
          points={GRAPH_POINTS}
          fill="none"
          stroke="#4A78F2"
          strokeWidth="28"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {DOTS.map(([cx, cy, r], i) => (
          <circle
            key={i}
            className="app-mark-dot"
            style={{ animationDelay: `${150 + i * 220}ms` }}
            cx={cx}
            cy={cy}
            r={r}
            fill="#4A78F2"
            stroke="#fff"
            strokeWidth="12"
          />
        ))}
      </svg>
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
