import type { QueryClient } from "@tanstack/react-query";

// The coach's daily push recommendation depends on training load and WHOOP
// recovery. Whenever either changes (note writes, WHOOP link/unlink), the
// server clears its per-day cache — this makes the client refetch too instead
// of serving its 10-minute-fresh copy.
export function invalidateCoachPush(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/coach/push");
    },
  });
}
