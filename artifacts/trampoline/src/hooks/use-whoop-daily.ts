// Per-day WHOOP recovery/strain lookup for annotating training-note cards.
// The endpoint is quiet when WHOOP isn't linked (200 {connected:false}),
// so cards simply show nothing for unlinked users or missing dates.
import { useQuery } from "@tanstack/react-query";
import { useOnline } from "@/hooks/use-online";

export interface WhoopDailySnapshot {
  connected: boolean;
  days: Record<string, { recovery: number | null; strain: number | null }>;
}

export function useWhoopDaily() {
  const isOnline = useOnline();
  return useQuery<WhoopDailySnapshot>({
    queryKey: ["/api/whoop/daily"],
    enabled: isOnline,
    staleTime: 5 * 60 * 1000,
  });
}

// WHOOP's own recovery color zones: green >= 67, yellow >= 34, red below.
export function recoveryColorClass(recovery: number): string {
  if (recovery >= 67) return "text-green-600 dark:text-green-400";
  if (recovery >= 34) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}
