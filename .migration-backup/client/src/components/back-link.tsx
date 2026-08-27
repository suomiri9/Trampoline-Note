import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

/**
 * App-wide back-navigation scheme: every subpage opens with this quiet
 * mono-caps link naming the parent page, sitting at the very top of the
 * content (above the hero). At rest it's muted; hover tints it toward the
 * page's accent so it inherits each section's identity.
 */
export function BackLink({
  to,
  label,
  testId,
  className,
}: {
  to: string;
  label: string;
  testId?: string;
  className?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        "pressable inline-flex items-center gap-1.5 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 hover:text-[hsl(var(--page-accent))] transition-colors",
        className,
      )}
      data-testid={testId}
    >
      <ArrowLeft className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
