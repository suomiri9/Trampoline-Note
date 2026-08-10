import { cn } from "@/lib/utils";

export interface StatStripItem {
  label: string;
  value: string;
  /** Gradient accent for the figure. Defaults to the primary blue→indigo. */
  accent?: "primary" | "gold" | "plain";
  testId?: string;
}

const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/**
 * Full-bleed hairline stat band — the Home/Stats signature. Purely
 * presentational: values are formatted strings derived from data the
 * page already loads.
 */
export function StatStrip({ items, className }: { items: StatStripItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "-mx-4 sm:-mx-6 grid border-y border-border/20 py-4 px-4 sm:px-6",
        COLS[items.length] ?? "grid-cols-4",
        className,
      )}
    >
      {items.map((s, i) => (
        <div key={s.label} className={cn("space-y-1 min-w-0", i > 0 && "border-l border-border/20 pl-3")}>
          <div
            className={cn(
              "text-[20px] sm:text-[26px] font-medium tracking-[-0.05em] leading-none tabular-nums truncate",
              s.accent === "gold" ? "text-gradient-gold" : s.accent === "plain" ? "" : "text-gradient-primary",
            )}
            data-testid={s.testId}
          >
            {s.value}
          </div>
          <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 truncate">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
