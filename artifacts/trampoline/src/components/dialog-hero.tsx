import type { ComponentType, ReactNode } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Shared hero header for form popups — the treatment from the session-log
 * dialog: a soft page-accent glow bleeding from the top edge, a mono-caps
 * eyebrow with the page icon, a bold title with an accent period, and an
 * optional helper line.
 *
 * The accent comes from `--page-accent`. Dialogs render in a portal, so a
 * page's accent does NOT reach them automatically — pass
 * `style={pageAccentStyle("...")}` on the DialogContent to scope it (omit for
 * the default primary blue).
 */
interface DialogHeroProps {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  /** Title text. A period in the page accent is appended unless `noPeriod`. */
  title: ReactNode;
  /** Skip the accent period (questions, titles with trailing counters). */
  noPeriod?: boolean;
  description?: ReactNode;
  /** Right-aligned action beside the title, e.g. a "From photo" button. */
  action?: ReactNode;
}

export function DialogHero({ icon: Icon, eyebrow, title, noPeriod, description, action }: DialogHeroProps) {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background: "radial-gradient(ellipse 90% 100% at 50% 0%, hsl(var(--page-accent) / 0.13), transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
        }}
      />
      <DialogHeader className="space-y-1 text-left">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--page-accent)/0.9)]">
          <Icon className="w-3.5 h-3.5" />
          {eyebrow}
        </div>
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-[22px] font-bold tracking-tight leading-none">
            {title}
            {!noPeriod && <span className="text-[hsl(var(--page-accent))]">.</span>}
          </DialogTitle>
          {action}
        </div>
        {description != null && (
          <DialogDescription className="text-xs text-muted-foreground/70">{description}</DialogDescription>
        )}
      </DialogHeader>
    </>
  );
}
