import { Link } from "wouter";
import { WifiOff } from "lucide-react";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { useCacheServed } from "@/hooks/use-cache-served";
import { useQueueCount } from "@/lib/offline-queue";

export function OfflineIndicator() {
  const [offlineModeEnabled] = useOfflineMode();
  const online = useOnline();
  const pendingCount = useQueueCount();
  // Reads fell back to the on-device mirror (slow/hanging network) even
  // though the browser still reports being online.
  const cacheServed = useCacheServed();

  if (!offlineModeEnabled) return null;
  if (online && pendingCount === 0 && !cacheServed) return null;

  const label = !online
    ? pendingCount > 0
      ? `Offline — ${pendingCount} pending`
      : "Offline"
    : pendingCount > 0
      ? `Syncing — ${pendingCount} pending`
      : "Slow connection — saved data";

  return (
    <Link href="/settings#offline">
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-20 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-surface text-xs font-medium text-muted-foreground shadow-sm cursor-pointer hover-elevate active-elevate-2"
        data-testid="badge-offline-indicator"
        role="status"
        aria-live="polite"
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span data-testid="text-offline-indicator-label">{label}</span>
      </div>
    </Link>
  );
}
