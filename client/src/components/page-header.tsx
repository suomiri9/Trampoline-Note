import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One sizing scheme for EVERY header action button, on every page:
 * compact on phones, comfortable on sm+. Import this for any custom
 * button placed in a PageHeader `actions` slot so all headers match.
 */
export const headerActionClass =
  "rounded-xl h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2";

/** Glowing solid-blue primary action (e.g. "Start Training"). */
export const primaryActionClass = cn(
  headerActionClass,
  "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all btn-3d",
);

/** Outlined amber/gold secondary action (e.g. "Points to Fix"). */
export const goldActionClass = cn(headerActionClass, "btn-gold relative");

/** Collapse once scrolled past this point… */
const COLLAPSE_AT = 48;
/** …and only expand again when back near the very top (hysteresis to avoid jitter). */
const EXPAND_AT = 12;

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

  // Non-sticky headers (className="static !mt-0") scroll away naturally and
  // shouldn't shrink mid-page.
  const isStatic = className?.includes("static") ?? false;

  // NRC-style collapse: full header at the top of the page, compact once
  // scrolled. Buttons (actions) stay the same size in both states.
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);

  useEffect(() => {
    if (isStatic) return;
    // html/body are locked (overflow: hidden) — all scrolling happens inside
    // #root. Walk up from the header to the nearest scrollable ancestor so
    // this keeps working if the scroll architecture ever changes.
    let scroller: HTMLElement | null = headerRef.current?.parentElement ?? null;
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scroller = scroller.parentElement;
    }
    const target: HTMLElement | Window = scroller ?? window;
    const readY = () =>
      scroller ? scroller.scrollTop : window.scrollY;
    const readRange = () =>
      scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;

    let raf = 0;
    const sync = () => {
      raf = 0;
      const y = readY();
      // Only collapse when there's comfortably more scroll range than the
      // height the collapse removes — otherwise the shrink can clamp the
      // scroll position back under the expand threshold and flicker.
      const next = collapsedRef.current
        ? y > EXPAND_AT
        : y > COLLAPSE_AT && readRange() > 240;
      if (next !== collapsedRef.current) {
        collapsedRef.current = next;
        setCollapsed(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    onScroll(); // pick up an already-scrolled position on mount
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isStatic]);

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

  /** Grid-rows trick: animates an unknown-height row down to 0 (needs overflow-hidden child). */
  const collapsibleRow = (visible: boolean) =>
    cn(
      "grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none",
      visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
    );

  return (
    <div
      ref={headerRef}
      className={cn(
        "sticky top-0 z-30 full-bleed-bar page-header-safe mb-6 bg-background/90 backdrop-blur-md border-b border-border/60",
        "transition-all duration-300 motion-reduce:transition-none",
        collapsed ? "pb-3" : "pb-4 sm:pb-5",
        className,
      )}
    >
      <div className={collapsibleRow(!collapsed)} aria-hidden={collapsed}>
        <div className="overflow-hidden">
          <div className="font-mono text-[10px] font-semibold tracking-[0.22em] uppercase text-muted-foreground/75 mb-2.5 sm:mb-3">
            Training / {eyebrow}
          </div>
        </div>
      </div>
      {/* Title and actions share one row; buttons sit on the right and only
          wrap below on screens too narrow to fit both. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          className={cn(
            "font-black tracking-[-0.04em] leading-[0.95] shrink-0 transition-[font-size] duration-300 motion-reduce:transition-none",
            collapsed ? "text-lg sm:text-3xl" : "text-[27px] sm:text-5xl",
          )}
        >
          {lead && <span>{lead} </span>}
          <span className="text-gradient-primary">{accentPart}</span>
        </h1>
        {actions && (
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">{actions}</div>
        )}
      </div>
      {subtitle && (
        <div className={collapsibleRow(!collapsed)} aria-hidden={collapsed}>
          <p className="overflow-hidden text-muted-foreground/70 text-[11px] leading-snug sm:text-sm pt-2 sm:pt-3">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
