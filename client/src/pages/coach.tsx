import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CoachChat, ClearChatButton } from "@/components/coach-chat";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import {
  Flame,
  Activity,
  Feather,
  Moon,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface PushRecommendation {
  level: "push" | "normal" | "easy" | "rest";
  reasoning: string;
  whoopLinked: boolean;
  todayRecovery: number | null;
  date: string;
}

const LEVELS: Record<
  PushRecommendation["level"],
  { label: string; icon: typeof Flame; badgeClass: string; barClass: string }
> = {
  push: {
    label: "Push",
    icon: Flame,
    badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400",
    barClass: "bg-red-500",
  },
  normal: {
    label: "Normal",
    icon: Activity,
    badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400",
    barClass: "bg-green-500",
  },
  easy: {
    label: "Easy",
    icon: Feather,
    badgeClass: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    barClass: "bg-yellow-500",
  },
  rest: {
    label: "Rest",
    icon: Moon,
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    barClass: "bg-blue-500",
  },
};

function PushCard() {
  // Send the athlete's LOCAL calendar date — the server clock is UTC, which
  // runs up to half a day behind (e.g. NZ mornings). "en-CA" formats as
  // YYYY-MM-DD. Having the date in the key also refetches after midnight.
  const localDate = new Date().toLocaleDateString("en-CA");
  const queryKey = [`/api/coach/push?date=${localDate}`];
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useQuery<PushRecommendation>({
    queryKey,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Manual refresh: bypass the server's per-day cache so the coach re-reads
  // today's data (new sessions, fresh WHOOP sync) and makes a new AI call.
  const refresh = useMutation({
    mutationFn: async (): Promise<PushRecommendation> => {
      const res = await fetch(`/api/coach/push?date=${localDate}&refresh=1`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("refresh failed");
      return res.json();
    },
    onSuccess: (rec) => {
      queryClient.setQueryData(queryKey, rec);
    },
  });

  if (isLoading) {
    return <Skeleton className="h-[120px] rounded-2xl" data-testid="skeleton-coach-push" />;
  }

  if (error || !data) {
    return (
      <div className="card-3d rounded-2xl p-5" data-testid="card-coach-push-error">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <span className="text-sm">The coach couldn't build today's recommendation.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-coach-push-retry"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
          Try again
        </Button>
      </div>
    );
  }

  const lvl = LEVELS[data.level] ?? LEVELS.normal;
  const Icon = lvl.icon;

  return (
    <div className="card-3d rounded-2xl p-5 relative overflow-hidden" data-testid="card-coach-push">
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", lvl.barClass)} />
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">Today's push level</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          data-testid="button-coach-push-refresh"
          aria-label="Refresh recommendation"
        >
          <RefreshCw className={cn("w-4 h-4", refresh.isPending && "animate-spin")} />
        </Button>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <span
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono uppercase tracking-wider text-sm font-semibold",
            lvl.badgeClass,
          )}
          data-testid="badge-push-level"
        >
          <Icon className="w-4 h-4" />
          {lvl.label}
        </span>
        {data.whoopLinked && data.todayRecovery != null && (
          <span className="text-xs font-mono text-muted-foreground" data-testid="text-push-recovery">
            recovery {Math.round(data.todayRecovery)}%
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-push-reasoning">
        {data.reasoning}
      </p>
      {!data.whoopLinked && (
        <p className="text-[11px] font-mono text-muted-foreground/70 mt-2" data-testid="text-push-no-whoop">
          WHOOP not linked — guidance is based on training load only.
        </p>
      )}
    </div>
  );
}

export default function CoachPage() {
  const isOnline = useOnline();

  const header = (
    <PageHeader
      eyebrow="AI Coach"
      title="Coach"
      accent="Coach"
      subtitle=""
    />
  );

  if (!isOnline) {
    return (
      <PageLayout>
        {header}
        <OfflinePlaceholder
          testId="card-offline-coach"
          hint="The AI coach is live-only. It will be back when you reconnect."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {header}

      <PushCard />

      <div className="card-3d rounded-2xl flex flex-col mt-4" data-testid="card-coach-chat">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="eyebrow">
            Chat <span className="text-primary">/ grounded in your data</span>
          </div>
          <ClearChatButton />
        </div>
        <CoachChat />
      </div>
    </PageLayout>
  );
}
