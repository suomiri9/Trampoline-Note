import { useEffect, useState } from "react";
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
  Sparkles,
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
  { label: string; icon: typeof Flame; accent: string; glow: string; ring: string }
> = {
  push: {
    label: "Push",
    icon: Flame,
    accent: "#f87171",
    glow: "hsl(0 84% 60% / 0.16)",
    ring: "hsl(0 84% 60% / 0.35)",
  },
  normal: {
    label: "Normal",
    icon: Activity,
    accent: "#4ade80",
    glow: "hsl(142 71% 45% / 0.16)",
    ring: "hsl(142 71% 45% / 0.35)",
  },
  easy: {
    label: "Easy",
    icon: Feather,
    accent: "#facc15",
    glow: "hsl(48 96% 53% / 0.14)",
    ring: "hsl(48 96% 53% / 0.32)",
  },
  rest: {
    label: "Rest",
    icon: Moon,
    accent: "#60a5fa",
    glow: "hsl(217 91% 60% / 0.16)",
    ring: "hsl(217 91% 60% / 0.35)",
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
    return <Skeleton className="h-[150px] rounded-2xl" data-testid="skeleton-coach-push" />;
  }

  if (error || !data) {
    return (
      <div
        className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
        data-testid="card-coach-push-error"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-sm">The coach couldn't build today's recommendation.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 rounded-xl"
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
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
      data-testid="card-coach-push"
    >
      {/* Level-tinted glow backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 100% 0%, ${lvl.glow} 0%, transparent 60%)` }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
            Today&apos;s push level
          </span>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:bg-white/[0.06] hover:text-foreground active:scale-95 transition-all"
            data-testid="button-coach-push-refresh"
            aria-label="Refresh recommendation"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refresh.isPending && "animate-spin")} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl shrink-0"
            style={{
              background: `${lvl.glow}`,
              boxShadow: `inset 0 0 0 1px ${lvl.ring}`,
            }}
            data-testid="badge-push-level"
          >
            <Icon className="w-7 h-7" style={{ color: lvl.accent }} />
          </div>
          <div className="min-w-0">
            <div
              className="font-black leading-none tracking-[-0.04em]"
              style={{ fontSize: "clamp(30px,9vw,40px)", color: lvl.accent }}
            >
              {lvl.label}
            </div>
            {data.whoopLinked && data.todayRecovery != null && (
              <div
                className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50"
                data-testid="text-push-recovery"
              >
                Recovery {Math.round(data.todayRecovery)}%
              </div>
            )}
          </div>
        </div>

        <p
          className="mt-4 text-sm text-muted-foreground/90 leading-relaxed"
          data-testid="text-push-reasoning"
        >
          {data.reasoning}
        </p>
        {!data.whoopLinked && (
          <p
            className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/60 mt-3"
            data-testid="text-push-no-whoop"
          >
            WHOOP not linked — guidance from training load only.
          </p>
        )}
      </div>
    </div>
  );
}

export default function CoachPage() {
  const isOnline = useOnline();

  const hero = (
    <PageHeader
      eyebrow="Coach"
      kicker="AI Coach"
      title="Ask anything."
      accent="anything."
      subtitle="Daily push guidance, training answers, and help using the app."
    />
  );

  if (!isOnline) {
    return (
      <PageLayout>
        {hero}
        <OfflinePlaceholder
          testId="card-offline-coach"
          hint="The AI coach is live-only. It will be back when you reconnect."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {hero}

      <div className="mt-2">
        <PushCard />
      </div>

      <div
        className="rounded-2xl border border-white/[0.07] bg-white/[0.025] flex flex-col mt-4 overflow-hidden"
        data-testid="card-coach-chat"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/[0.05]">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
            Chat <span className="text-primary/70">/ grounded in your data</span>
          </span>
          <ClearChatButton />
        </div>
        <CoachChat />
      </div>
    </PageLayout>
  );
}
