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
  MessageSquare,
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
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:bg-white/[0.06] hover:text-foreground pressable [--press-scale:0.95]"
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
      kicker="AI Coach · Live"
      title="Talk it through."
      accent="through."
      subtitle="Daily push guidance, training answers, and help using the app."
    />
  );

  if (!isOnline) {
    return (
      <PageLayout accent="coach">
        {hero}
        <OfflinePlaceholder
          testId="card-offline-coach"
          hint="The AI coach is live-only. It will be back when you reconnect."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout accent="coach">
      {hero}

      {/* Conversational opening gesture — a cyan "today's read" lead-in that
          frames the push card as the coach's first word of the day. */}
      <div className="relative mt-2 mb-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 right-0 h-32 w-56 rounded-full blur-2xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--page-accent) / 0.16) 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[hsl(var(--page-accent)/0.1)] border border-[hsl(var(--page-accent)/0.2)] shrink-0">
            <Sparkles className="w-4 h-4 text-[hsl(var(--page-accent))]" />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.75)]">
            Today&apos;s read
          </p>
        </div>
      </div>

      <PushCard />

      {/* Chat room — framed as a conversation surface with a cyan-tinted lead
          rail so it reads as its own space, not a generic list panel. */}
      <div
        className="relative rounded-2xl border border-white/[0.07] bg-white/[0.025] flex flex-col mt-5 overflow-hidden"
        data-testid="card-coach-chat"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "radial-gradient(ellipse 70% 100% at 20% 0%, hsl(var(--page-accent) / 0.08) 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-3.5 h-3.5 text-[hsl(var(--page-accent))] shrink-0" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 truncate">
              Chat <span className="text-[hsl(var(--page-accent)/0.75)]">· grounded in your data</span>
            </span>
          </div>
          <ClearChatButton />
        </div>
        <CoachChat />
      </div>
    </PageLayout>
  );
}
