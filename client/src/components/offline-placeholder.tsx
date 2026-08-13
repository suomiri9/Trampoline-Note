import { WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfflinePlaceholderProps {
  hint?: string;
  className?: string;
  testId?: string;
  /** Manual escape hatch. The offline card must never be a dead end: on iOS
   * PWAs the device can mis-report "offline" after resuming from the
   * background, and the only user-visible fix used to be force-quitting. */
  onRetry?: () => void;
  retrying?: boolean;
}

export function OfflinePlaceholder({
  hint = "It will be back when you reconnect.",
  className,
  testId,
  onRetry,
  retrying,
}: OfflinePlaceholderProps) {
  return (
    <div
      className={cn(
        "rounded-2xl card-3d p-8 flex flex-col items-center text-center",
        className,
      )}
      data-testid={testId ?? "card-offline-placeholder"}
    >
      <div className="w-12 h-12 mb-4 rounded-full bg-white/[0.03] flex items-center justify-center">
        <WifiOff className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-semibold mb-1">You are not connected to the internet.</p>
      <p className="text-sm text-muted-foreground max-w-xs">{hint}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-5 flex items-center gap-1.5 h-8 px-3 rounded-xl border border-white/[0.07] bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 hover:bg-white/[0.06] pressable disabled:opacity-50"
          data-testid="button-offline-retry"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
          {retrying ? "Trying…" : "Try again"}
        </button>
      )}
    </div>
  );
}
