import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Glowing solid-blue primary action (e.g. "Start Training"). */
export const primaryActionClass =
  "rounded-xl h-12 px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all btn-3d flex items-center gap-2";

/** Outlined amber/gold secondary action (e.g. "Points to Fix"). */
export const goldActionClass =
  "rounded-xl h-12 px-4 font-semibold btn-gold flex items-center gap-2 relative";

interface PageHeaderProps {
  /** Small monospace eyebrow text, rendered as `// EYEBROW`. */
  eyebrow: string;
  /** Full page title (rendered uppercase). */
  title: string;
  /** Trailing portion of the title shown in the accent color. Defaults to the last word. */
  accent?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  accent,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  // Publish the rendered header height so sticky sub-bars (e.g. the Skills tab
  // bar) can pin themselves directly beneath it via top: var(--page-header-h).
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty("--page-header-h", `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trimmed = title.trim();
  let lead = trimmed;
  let accentPart = accent;

  if (accentPart === undefined) {
    const idx = trimmed.lastIndexOf(" ");
    if (idx === -1) {
      lead = "";
      accentPart = trimmed;
    } else {
      lead = trimmed.slice(0, idx);
      accentPart = trimmed.slice(idx + 1);
    }
  } else {
    // Strip the accent (and trailing space) from the lead if it's a suffix.
    if (lead.toLowerCase().endsWith(accentPart.toLowerCase())) {
      lead = lead.slice(0, lead.length - accentPart.length).trimEnd();
    }
  }

  return (
    <div
      ref={headerRef}
      className={cn(
        "sticky top-0 z-30 full-bleed-bar page-header-safe pb-5 mb-6 bg-background/90 backdrop-blur-md border-b border-border/60",
        "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="eyebrow mb-2">// {eyebrow}</div>
        <h1 className="page-title text-5xl sm:text-6xl">
          {lead && <span>{lead} </span>}
          <span className="title-accent">{accentPart}</span>
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm mt-3">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>
      )}
    </div>
  );
}
