import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertScoreSchema, type Score, type Routine, type Skill, type InsertScore } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calcDDFromSkillIds, parseNoteSkills } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useOnline } from "@/hooks/use-online";
import { useNotes } from "@/hooks/use-notes";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useQueuedScores } from "@/hooks/use-queued-scores";
import { deleteQueuedByTempId, isQueuedOfflineResult, tryNetworkOrEnqueue, type OfflineQueuedResult } from "@/lib/offline-queue";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Trash2, Plus, Trophy, CalendarIcon, Pencil, MoreVertical, TrendingUp, SlidersHorizontal } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

const scoreDefaults = {
  date: new Date().toISOString().split('T')[0],
  routineId: undefined as number | undefined,
  routineIdVol: undefined as number | undefined,
  attempt: null as number | null,
  attemptVol: null as number | null,
  type: "practice" as string,
  category: "vol" as string,
  competitionName: "",
  competitionId: null as string | null,
  round: null as string | null,
  rank: undefined as number | undefined,
  execution: 0,
  executionTwo: 0,
  doubleExecution: false,
  difficulty: 0,
  horizontal: 0,
  timeOfFlight: 0,
  total: 0,
  executionVol: 0,
  executionTwoVol: 0,
  doubleExecutionVol: false,
  difficultyVol: 0,
  horizontalVol: 0,
  timeOfFlightVol: 0,
  totalVol: 0,
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthYear(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  const mi = parseInt(m, 10) - 1;
  return `${MONTH_ABBR[mi] ?? ""} ${y}`.trim();
}

// Format a score value with up to 3 decimal places, trimming trailing zeros
// but always keeping at least one decimal (e.g. 50.105, 50.1, 50.0).
function fmtScore(n: number): string {
  const r = Math.round((n + Number.EPSILON) * 1000) / 1000;
  return r.toFixed(3).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ".0");
}

function ScoreBreakdown({ e, d, h, t, label, routineName, total, totalColor, totalTestId }: { e: number; d: number; h: number; t: number; label?: string; routineName?: string | null; total?: number; totalColor?: string; totalTestId?: string }) {
  const cols: { k: string; v: string; accent?: boolean }[] = [
    { k: "E", v: e.toFixed(1) },
    { k: "DD", v: d.toFixed(1) },
    { k: "H", v: h.toFixed(1) },
    { k: "TOF", v: fmtScore(t) },
    ...(total != null ? [{ k: "TOTAL", v: fmtScore(total), accent: true }] : []),
  ];
  return (
    <div>
      {(label || routineName) && (
        <div className="flex items-baseline gap-2 mb-2 min-w-0">
          {label && <span className="eyebrow text-[0.6rem] tracking-[0.2em] text-muted-foreground/80 shrink-0">{label}</span>}
          {routineName && (
            <span className="inline-block max-w-full truncate rounded-lg border border-border/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground align-middle">
              {routineName}
            </span>
          )}
        </div>
      )}
      <div className={cn("grid gap-2 text-center", total != null ? "grid-cols-5" : "grid-cols-4")}>
        {cols.map((c) => (
          <div key={c.k}>
            <div className={cn("font-mono text-[14px] font-semibold tabular-nums tracking-tight", c.accent && totalColor)} data-testid={c.accent ? totalTestId : undefined}>{c.v}</div>
            <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">{c.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreGroups({ score, totalColor, routines, firstPracticedByRoutine }: { score: Score; totalColor: string; routines?: Routine[]; firstPracticedByRoutine?: Map<number, string> }) {
  const isMulti = score.category === "both" || score.category === "vol_vol";
  const group1Label = score.category === "vol_vol" ? "VOL 1" : score.category === "vol" ? "VOL" : "SET";
  const group2Label = score.category === "vol_vol" ? "VOL 2" : "VOL";
  const routineName = (id?: number | null) => {
    if (id == null) return undefined;
    const name = routines?.find((r) => r.id === id)?.name;
    if (!name) return undefined;
    const fp = firstPracticedByRoutine?.get(id);
    return fp ? `${name} (${formatMonthYear(fp)}-)` : name;
  };
  return (
    <div className="space-y-4">
      <ScoreBreakdown
        e={effectiveE(score.execution, score.executionTwo, score.doubleExecution)}
        d={score.difficulty}
        h={score.horizontal}
        t={score.timeOfFlight}
        label={`${group1Label}${score.attempt != null ? ` · attempt ${score.attempt}` : ""}`}
        routineName={routineName(score.routineId)}
        total={score.total}
        totalColor={totalColor}
        totalTestId={`text-group1-total-${score.id}`}
      />
      {isMulti && (
        <ScoreBreakdown
          e={effectiveE(score.executionVol ?? 0, score.executionTwoVol, score.doubleExecutionVol)}
          d={score.difficultyVol ?? 0}
          h={score.horizontalVol ?? 0}
          t={score.timeOfFlightVol ?? 0}
          label={`${group2Label}${score.attemptVol != null ? ` · attempt ${score.attemptVol}` : ""}`}
          routineName={routineName(score.routineIdVol)}
          total={score.totalVol ?? 0}
          totalColor={totalColor}
          totalTestId={`text-group2-total-${score.id}`}
        />
      )}
    </div>
  );
}

function ScoreCard({
  score,
  routines,
  actions,
  pendingBadge,
  testId,
  pending,
  firstPracticedByRoutine,
}: {
  score: Score;
  routines?: Routine[];
  actions?: ReactNode;
  pendingBadge?: ReactNode;
  testId?: string;
  pending?: boolean;
  firstPracticedByRoutine?: Map<number, string>;
}) {
  const isComp = score.type === "competition";
  const isTrial = score.type === "trial";
  const grandTotal = effectiveTotal(score);

  const totalColor = isComp ? "text-amber-400" : isTrial ? "text-red-400" : "text-primary";
  const accentBar = isComp ? "bg-amber-500" : isTrial ? "bg-red-500" : "bg-primary";
  const pillClass = isComp
    ? "border-amber-500/40 text-amber-400"
    : isTrial
    ? "border-red-500/40 text-red-400"
    : "border-primary/40 text-primary";

  return (
    <div
      className={cn("relative card-3d rounded-2xl overflow-hidden", pending && "border-amber-500/40")}
      data-testid={testId}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-1", accentBar)} aria-hidden="true" />
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{format(new Date(score.date), "EEE, d MMM yyyy")}</span>
              {pendingBadge}
            </div>
            <span className={cn("inline-block mt-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider", pillClass)}>
              {score.type}
            </span>
            {isComp && (score.competitionName || score.rank != null) && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {score.competitionName}
                {score.rank != null ? ` · #${score.rank}` : ""}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-start gap-1">
            <div className="text-right">
              <div className={cn("font-display font-normal text-5xl sm:text-6xl leading-none", totalColor)} data-testid={`text-score-total-${score.id}`}>
                {fmtScore(grandTotal)}
              </div>
              <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">Score</div>
            </div>
            {actions}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/60">
          <ScoreGroups score={score} totalColor={totalColor} routines={routines} firstPracticedByRoutine={firstPracticedByRoutine} />
        </div>
      </div>
    </div>
  );
}

const roundOrder = (round?: string | null) => (round === "final" ? 1 : round === "prelims" ? 0 : 2);
const roundLabel = (round?: string | null) => (round === "final" ? "Final" : round === "prelims" ? "Prelims" : "Round");

const COMP_THEME = {
  competition: {
    bar: "bg-amber-500",
    accent: "text-amber-400",
    accentSoft: "text-amber-400/70",
    accentEyebrow: "text-amber-400/80",
    badge: "border-amber-500/40 text-amber-400",
  },
  trial: {
    bar: "bg-red-500",
    accent: "text-red-400",
    accentSoft: "text-red-400/70",
    accentEyebrow: "text-red-400/80",
    badge: "border-red-500/40 text-red-400",
  },
} as const;

function newCompetitionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Overall score for a row: vol_vol counts the BEST of the two voluntary routines,
// "both" sums set + vol, everything else is the single total.
function effectiveTotal(score: Pick<Score, "category" | "total" | "totalVol">): number {
  if (score.category === "vol_vol") return Math.max(score.total, score.totalVol ?? 0);
  if (score.category === "both") return score.total + (score.totalVol ?? 0);
  return score.total;
}

// Combined execution: two judges summed (E1 + E2), or the first judge doubled (E1 * 2).
function effectiveE(e: number, eTwo: number | null | undefined, dbl: boolean | null | undefined): number {
  return dbl ? e * 2 : e + (eTwo ?? 0);
}

function RoundBlock({
  score,
  hideRank,
  accent = "text-amber-400",
  accentEyebrow = "text-amber-400/80",
  onEdit,
  onDelete,
  routines,
  firstPracticedByRoutine,
}: {
  score: Score;
  hideRank?: boolean;
  accent?: string;
  accentEyebrow?: string;
  onEdit: (score: Score) => void;
  onDelete: (id: number) => void;
  routines?: Routine[];
  firstPracticedByRoutine?: Map<number, string>;
}) {
  const grandTotal = effectiveTotal(score);

  return (
    <div className="pt-4 border-t border-border/60 first:border-t-0 first:pt-0" data-testid={`round-${score.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {score.round && (
            <div className={cn("eyebrow !text-[10px]", accentEyebrow)}>{roundLabel(score.round)}</div>
          )}
          {!hideRank && score.rank != null && (
            <div className="font-mono text-xs text-muted-foreground mt-0.5" data-testid={`text-round-rank-${score.id}`}>Rank #{score.rank}</div>
          )}
        </div>
        <div className="shrink-0 flex items-start gap-1">
          <div className="text-right">
            <div className={cn("font-display font-normal text-4xl sm:text-5xl leading-none", accent)} data-testid={`text-round-total-${score.id}`}>
              {fmtScore(grandTotal)}
            </div>
            <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">Score</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 text-muted-foreground/50 hover:text-foreground" data-testid={`btn-round-actions-${score.id}`}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 rounded-xl">
              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => onEdit(score)} data-testid={`btn-round-edit-${score.id}`}>
                <Pencil className="h-3.5 w-3.5" /> Edit round
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => onDelete(score.id)} data-testid={`btn-round-delete-${score.id}`}>
                <Trash2 className="h-3.5 w-3.5" /> Delete round
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-3">
        <ScoreGroups score={score} totalColor={accent} routines={routines} firstPracticedByRoutine={firstPracticedByRoutine} />
      </div>
    </div>
  );
}

function CompetitionCard({
  rounds,
  variant = "competition",
  onEditRound,
  onDeleteRound,
  onDeleteComp,
  onAddFinal,
  testId,
  routines,
  firstPracticedByRoutine,
}: {
  rounds: Score[];
  variant?: "competition" | "trial";
  onEditRound: (score: Score) => void;
  onDeleteRound: (id: number) => void;
  onDeleteComp: (ids: number[]) => void;
  onAddFinal: (prelims: Score) => void;
  testId?: string;
  routines?: Routine[];
  firstPracticedByRoutine?: Map<number, string>;
}) {
  const isTrial = variant === "trial";
  const theme = COMP_THEME[variant];
  const finalRound = rounds.find((r) => r.round === "final");
  const prelimsRound = rounds.find((r) => r.round !== "final") ?? rounds[0];
  const bigRankRound = finalRound ?? prelimsRound;
  const first = rounds[0];
  const hasName = !!first.competitionName;
  const compName = hasName ? first.competitionName! : isTrial ? "Trial" : "Competition";
  const displayDate = [...rounds].map((r) => r.date).sort()[0];

  return (
    <div className="relative card-3d rounded-2xl overflow-hidden" data-testid={testId}>
      <span className={cn("absolute left-0 top-0 bottom-0 w-1", theme.bar)} aria-hidden="true" />
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{format(new Date(displayDate), "EEE, d MMM yyyy")}</span>
            </div>
            <h3 className="font-bold text-lg mt-1.5 truncate" data-testid={`text-comp-name-${first.id}`}>{compName}</h3>
            <span className={cn("inline-block mt-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider", theme.badge)}>
              {variant}
            </span>
          </div>
          <div className="shrink-0 flex items-start gap-1">
            {bigRankRound?.rank != null && (
              <div className="text-right">
                <div className={cn("eyebrow !text-[10px]", theme.accentSoft)}>{finalRound ? "Final Rank" : "Rank"}</div>
                <div className={cn("font-display font-normal text-[2rem] sm:text-[2.5rem] leading-none", theme.accent)} data-testid={`text-final-rank-${bigRankRound.id}`}>
                  #{bigRankRound.rank}
                </div>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 text-muted-foreground/50 hover:text-foreground" data-testid={`btn-comp-actions-${first.id}`}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl">
                {!finalRound && (
                  <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => onAddFinal(prelimsRound)} data-testid={`btn-comp-add-final-${first.id}`}>
                    <Plus className="h-3.5 w-3.5" /> Add final round
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => onDeleteComp(rounds.map((r) => r.id))} data-testid={`btn-comp-delete-${first.id}`}>
                  <Trash2 className="h-3.5 w-3.5" /> {isTrial ? "Delete trial" : "Delete competition"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2 space-y-4">
          {rounds.map((r) => (
            <RoundBlock
              key={r.id}
              score={r}
              hideRank={r.id === bigRankRound?.id}
              accent={theme.accent}
              accentEyebrow={theme.accentEyebrow}
              onEdit={onEditRound}
              onDelete={onDeleteRound}
              routines={routines}
              firstPracticedByRoutine={firstPracticedByRoutine}
            />
          ))}
        </div>

      </div>
    </div>
  );
}

const GRAPH_SERIES = [
  { key: "total", name: "Total", color: "#f59e0b" },
  { key: "e", name: "E", color: "#60a5fa" },
  { key: "dd", name: "DD", color: "#a78bfa" },
  { key: "hd", name: "HD", color: "#34d399" },
  { key: "tof", name: "TOF", color: "#fb7185" },
] as const;

type GraphSeriesKey = (typeof GRAPH_SERIES)[number]["key"];

function ScoreGraph({ scores }: { scores: Score[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [hidden, setHidden] = useState<Set<GraphSeriesKey>>(new Set());

  const data = useMemo(() => {
    // One routine = one point. A "both" / "vol_vol" record holds two routines,
    // so it emits two points (each keeps Total = E + DD + HD + TOF coherent).
    const g1 = (s: Score) => ({
      total: s.total,
      e: effectiveE(s.execution, s.executionTwo, s.doubleExecution),
      dd: s.difficulty,
      hd: s.horizontal,
      tof: s.timeOfFlight,
    });
    const g2 = (s: Score) => ({
      total: s.totalVol ?? 0,
      e: effectiveE(s.executionVol ?? 0, s.executionTwoVol, s.doubleExecutionVol),
      dd: s.difficultyVol ?? 0,
      hd: s.horizontalVol ?? 0,
      tof: s.timeOfFlightVol ?? 0,
    });

    const sorted = (scores ?? [])
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    const points: { idx: number; date: string; label: string; total: number; e: number; dd: number; hd: number; tof: number }[] = [];
    for (const s of sorted) {
      if (s.category === "both") {
        points.push({ idx: points.length, date: s.date, label: "Set", ...g1(s) });
        points.push({ idx: points.length, date: s.date, label: "Vol", ...g2(s) });
      } else if (s.category === "vol_vol") {
        points.push({ idx: points.length, date: s.date, label: "Vol 1", ...g1(s) });
        points.push({ idx: points.length, date: s.date, label: "Vol 2", ...g2(s) });
      } else {
        points.push({ idx: points.length, date: s.date, label: s.category === "vol" ? "Vol" : "Set", ...g1(s) });
      }
    }
    return points;
  }, [scores, typeFilter]);

  const toggle = (k: GraphSeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="card-3d rounded-2xl p-5" data-testid="card-score-graph">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">Score Trend <span className="text-amber-400">/ Breakdown</span></div>
          <p className="text-xs text-muted-foreground">One point per routine — Total vs E, DD, HD &amp; TOF.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[124px] h-8 rounded-xl text-xs border-border/50 font-mono shrink-0" data-testid="select-graph-type"><SelectValue /></SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="competition">Competition</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="practice">Practice</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 rounded-xl text-xs font-mono border-border/50 gap-1.5 px-3" data-testid="button-graph-elements">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Elements
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono">
              <DropdownMenuLabel className="text-xs">Show Elements</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {GRAPH_SERIES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.key}
                  checked={!hidden.has(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                  data-testid={`filter-${s.key}`}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: s.color }} />
                  {s.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16" data-testid="empty-score-graph">
          <TrendingUp className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No scores to chart yet.</p>
        </div>
      ) : (
        <>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="idx"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono)' }}
                  dy={6}
                  minTickGap={24}
                  tickFormatter={(i: any) => { const p = data[Number(i)]; if (!p) return ""; try { return format(parseISO(p.date), "d MMM"); } catch { return p.date; } }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-mono)' }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                  labelFormatter={(i: any) => { const p = data[Number(i)]; if (!p) return ""; let d = p.date; try { d = format(parseISO(p.date), "EEE, d MMM yyyy"); } catch {} return `${d} · ${p.label}`; }}
                  formatter={(value: any, name: any) => [fmtScore(Number(value)), name]}
                  cursor={{ stroke: 'hsl(var(--primary) / 0.3)', strokeWidth: 1 }}
                />
                {GRAPH_SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="linear"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={s.key === "total" ? 2.5 : 1.5}
                    hide={hidden.has(s.key)}
                    dot={data.length > 30 ? false : { r: 2.5, fill: s.color, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: s.color, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {GRAPH_SERIES.map((s) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition-opacity", off ? "opacity-40 border-border/50" : "border-border")}
                  data-testid={`legend-${s.key}`}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function ScorePage() {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState("scores");
  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [deleteScoreId, setDeleteScoreId] = useState<number | null>(null);
  const [deleteCompIds, setDeleteCompIds] = useState<number[] | null>(null);
  const [customSkillIds, setCustomSkillIds] = useState<number[] | null>(null);
  const [customSkillIdsVol, setCustomSkillIdsVol] = useState<number[] | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<"set" | "vol" | null>(null);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();

  const { data: scores } = useQuery<Score[]>({
    queryKey: ["/api/scores"],
    enabled: !(offlineModeEnabled && !isOnline),
  });
  const queuedScores = useQueuedScores();
  const { data: routines } = useQuery<Routine[]>({ queryKey: ["/api/routines"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: notes } = useNotes();
  const firstPracticedByRoutine = useMemo(() => {
    const map = new Map<number, string>();
    for (const note of notes ?? []) {
      const ids = new Set<number>();
      for (const it of parseNoteSkills(note.skills)) {
        if (it.id === -2 && typeof it.routineId === "number") ids.add(it.routineId);
      }
      for (const rid of Array.from(ids)) {
        const existing = map.get(rid);
        if (!existing || note.date < existing) map.set(rid, note.date);
      }
    }
    return map;
  }, [notes]);

  type CreateScoreResult = OfflineQueuedResult | Score;
  const createMutation = useMutation<CreateScoreResult, Error, InsertScore>({
    mutationFn: async (values: InsertScore) => {
      return await tryNetworkOrEnqueue("score", values, async (signal) => {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
          signal,
        });
        if (!res.ok) {
          const text = (await res.text()) || res.statusText;
          throw new Error(`${res.status}: ${text}`);
        }
        return (await res.json()) as Score;
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) {
        queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      }
      setIsAdding(false);
      setCustomSkillIds(null);
      setCustomSkillIdsVol(null);
      form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] });
      toast({
        title: queued ? "Saved offline. Will sync when reconnected." : "Score saved!",
      });
    },
    onError: (err) => {
      toast({
        title: "Couldn't save score",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: any }) => {
      const res = await apiRequest("PUT", `/api/scores/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      setEditingScore(null);
      setIsAdding(false);
      setCustomSkillIds(null);
      setCustomSkillIdsVol(null);
      toast({ title: "Score updated!" });
    },
    onError: (err) => {
      toast({
        title: "Couldn't update score",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/scores/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      toast({ title: "Score deleted" });
    }
  });

  const deleteCompMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiRequest("DELETE", `/api/scores/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      toast({ title: "Competition deleted" });
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      toast({
        title: "Couldn't delete competition",
        description: err instanceof Error ? err.message : "Some rounds may not have been deleted. Please try again.",
        variant: "destructive",
      });
    },
  });

  const skipDDAutoFill = useRef(false);

  function startEdit(score: Score) {
    skipDDAutoFill.current = true;
    setEditingScore(score);
    setIsAdding(true);
    form.reset({
      date: score.date,
      routineId: score.routineId ?? undefined,
      routineIdVol: score.routineIdVol ?? undefined,
      attempt: null,
      attemptVol: null,
      type: score.type as any,
      category: score.category as any,
      competitionName: score.competitionName ?? "",
      competitionId: score.competitionId ?? null,
      round: score.round ?? null,
      rank: score.rank ?? undefined,
      execution: score.execution,
      executionTwo: score.executionTwo ?? 0,
      doubleExecution: score.doubleExecution ?? false,
      difficulty: score.difficulty,
      horizontal: score.horizontal,
      timeOfFlight: score.timeOfFlight,
      total: score.total,
      executionVol: score.executionVol ?? 0,
      executionTwoVol: score.executionTwoVol ?? 0,
      doubleExecutionVol: score.doubleExecutionVol ?? false,
      difficultyVol: score.difficultyVol ?? 0,
      horizontalVol: score.horizontalVol ?? 0,
      timeOfFlightVol: score.timeOfFlightVol ?? 0,
      totalVol: score.totalVol ?? 0,
    });
    const r = routines?.find(x => x.id === score.routineId);
    if (r) {
      const count = score.attempt ?? r.skillIds.length;
      setCustomSkillIds(r.skillIds.slice(0, count));
      setLastRoutineId(score.routineId ?? undefined);
    } else {
      setCustomSkillIds(null);
    }
    const rv = routines?.find(x => x.id === score.routineIdVol);
    if (rv) {
      const countV = score.attemptVol ?? rv.skillIds.length;
      setCustomSkillIdsVol(rv.skillIds.slice(0, countV));
      setLastRoutineIdVol(score.routineIdVol ?? undefined);
    } else {
      setCustomSkillIdsVol(null);
    }
  }

  async function startAddFinal(prelims: Score) {
    skipDDAutoFill.current = true;
    setEditingScore(null);
    setCustomSkillIds(null);
    setCustomSkillIdsVol(null);
    const compId = prelims.competitionId ?? newCompetitionId();
    if (!prelims.competitionId) {
      // Legacy prelims row has no competitionId — it MUST be backfilled before the final
      // is created, otherwise the final saves as its own standalone one-round group.
      try {
        await apiRequest("PUT", `/api/scores/${prelims.id}`, { competitionId: compId, round: prelims.round || "prelims" });
        queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      } catch {
        toast({ title: "Couldn't add a final round", description: "Please try again.", variant: "destructive" });
        return;
      }
    }
    setIsAdding(true);
    form.reset({
      ...scoreDefaults,
      date: prelims.date,
      type: prelims.type === "trial" ? "trial" : "competition",
      competitionName: prelims.competitionName ?? "",
      competitionId: compId,
      round: "final",
    });
  }

  const form = useForm({
    resolver: zodResolver(insertScoreSchema),
    defaultValues: scoreDefaults,
  });

  const [lastRoutineId, setLastRoutineId] = useState<number | undefined>();
  const [lastRoutineIdVol, setLastRoutineIdVol] = useState<number | undefined>();

  const watchFields = form.watch([
    "execution", "difficulty", "horizontal", "timeOfFlight",
    "routineId", "category",
    "executionVol", "difficultyVol", "horizontalVol", "timeOfFlightVol",
    "routineIdVol",
    "executionTwo", "doubleExecution",
    "executionTwoVol", "doubleExecutionVol",
  ]);

  useEffect(() => {
    const [e, d, h, t, rId, cat, e2, d2, h2, t2, rIdVol, eTwo, dblE, eTwoVol, dblEVol] = watchFields;

    const routineChanged = rId !== lastRoutineId;
    if (routineChanged) {
      setLastRoutineId(rId);
      if (rId && routines) {
        const routine = routines.find(r => r.id === Number(rId));
        if (routine) setCustomSkillIds([...routine.skillIds]);
      } else {
        setCustomSkillIds(null);
      }
    }

    const routineVolChanged = rIdVol !== lastRoutineIdVol;
    if (routineVolChanged) {
      setLastRoutineIdVol(rIdVol);
      if (rIdVol && routines) {
        const routineV = routines.find(r => r.id === Number(rIdVol));
        if (routineV) setCustomSkillIdsVol([...routineV.skillIds]);
      } else {
        setCustomSkillIdsVol(null);
      }
    }

    const eEff = dblE ? Number(e || 0) * 2 : Number(e || 0) + Number(eTwo || 0);
    const total = eEff + Number(d || 0) + Number(h || 0) + Number(t || 0);
    form.setValue("total", Number(total.toFixed(3)));

    if (cat === "both" || cat === "vol_vol") {
      const eEff2 = dblEVol ? Number(e2 || 0) * 2 : Number(e2 || 0) + Number(eTwoVol || 0);
      const total2 = eEff2 + Number(d2 || 0) + Number(h2 || 0) + Number(t2 || 0);
      form.setValue("totalVol", Number(total2.toFixed(3)));
    }
  }, [watchFields, routines, allSkills, form, lastRoutineId, lastRoutineIdVol]);

  useEffect(() => {
    if (!customSkillIds || !allSkills) return;
    if (skipDDAutoFill.current) {
      skipDDAutoFill.current = false;
      return;
    }
    const cat = form.getValues("category");
    const d = (cat === "set" || cat === "both") ? 0 : Number(calcDDFromSkillIds(customSkillIds, allSkills).toFixed(1));
    form.setValue("difficulty", d);
  }, [customSkillIds, allSkills]);

  useEffect(() => {
    if (!customSkillIdsVol || !allSkills) return;
    form.setValue("difficultyVol", Number(calcDDFromSkillIds(customSkillIdsVol, allSkills).toFixed(1)));
  }, [customSkillIdsVol, allSkills]);

  // Personal bests from COMPETITION rows only, split per routine type (Set vs Vol).
  // Single "vol" and the two routines of "vol_vol" store voluntary stats in the
  // primary/set fields, so those feed the Vol bests; only "set"/"both" rows feed the
  // Set bests. Set has no DD of its own, so it's omitted from the Set breakdown.
  const compScores = (scores ?? []).filter((s) => s.type === "competition");
  const pb = compScores.reduce(
    (acc, s) => {
      const e1 = effectiveE(s.execution, s.executionTwo, s.doubleExecution);
      const e2 = effectiveE(s.executionVol ?? 0, s.executionTwoVol, s.doubleExecutionVol);
      if (s.category === "set" || s.category === "both") {
        acc.set.score = Math.max(acc.set.score, s.total);
        acc.set.e = Math.max(acc.set.e, e1);
        acc.set.h = Math.max(acc.set.h, s.horizontal);
        acc.set.tof = Math.max(acc.set.tof, s.timeOfFlight);
      }
      if (s.category === "vol") {
        acc.vol.score = Math.max(acc.vol.score, s.total);
        acc.vol.e = Math.max(acc.vol.e, e1);
        acc.vol.dd = Math.max(acc.vol.dd, s.difficulty);
        acc.vol.h = Math.max(acc.vol.h, s.horizontal);
        acc.vol.tof = Math.max(acc.vol.tof, s.timeOfFlight);
      } else if (s.category === "both") {
        acc.vol.score = Math.max(acc.vol.score, s.totalVol ?? 0);
        acc.vol.e = Math.max(acc.vol.e, e2);
        acc.vol.dd = Math.max(acc.vol.dd, s.difficultyVol ?? 0);
        acc.vol.h = Math.max(acc.vol.h, s.horizontalVol ?? 0);
        acc.vol.tof = Math.max(acc.vol.tof, s.timeOfFlightVol ?? 0);
      } else if (s.category === "vol_vol") {
        acc.vol.score = Math.max(acc.vol.score, s.total, s.totalVol ?? 0);
        acc.vol.e = Math.max(acc.vol.e, e1, e2);
        acc.vol.dd = Math.max(acc.vol.dd, s.difficulty, s.difficultyVol ?? 0);
        acc.vol.h = Math.max(acc.vol.h, s.horizontal, s.horizontalVol ?? 0);
        acc.vol.tof = Math.max(acc.vol.tof, s.timeOfFlight, s.timeOfFlightVol ?? 0);
      }
      return acc;
    },
    {
      set: { score: 0, e: 0, h: 0, tof: 0 },
      vol: { score: 0, e: 0, dd: 0, h: 0, tof: 0 },
    },
  );
  const hasComps = compScores.length > 0;

  type RenderItem =
    | { kind: "comp"; key: string; sortDate: string; rounds: Score[] }
    | { kind: "single"; key: string; sortDate: string; score: Score };

  const renderItems = useMemo<RenderItem[]>(() => {
    const list = scores ?? [];
    const groups = new Map<string, Score[]>();
    const items: RenderItem[] = [];
    for (const s of list) {
      if ((s.type === "competition" || s.type === "trial") && s.competitionId) {
        const existing = groups.get(s.competitionId);
        if (existing) existing.push(s);
        else groups.set(s.competitionId, [s]);
      } else {
        items.push({ kind: "single", key: `s-${s.id}`, sortDate: s.date, score: s });
      }
    }
    for (const [compId, rounds] of Array.from(groups.entries())) {
      const sorted = [...rounds].sort((a, b) => roundOrder(a.round) - roundOrder(b.round) || a.date.localeCompare(b.date));
      const sortDate = sorted.map((r) => r.date).sort().reverse()[0] ?? sorted[0].date;
      items.push({ kind: "comp", key: `c-${compId}`, sortDate, rounds: sorted });
    }
    items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    return items;
  }, [scores]);

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Competition & Practice"
        title="Score Board"
        accent="Board"
        subtitle="Track execution, DD, and competition results."
        actions={
          <Button
            onClick={() => { setIsAdding(true); setEditingScore(null); setCustomSkillIds(null); setCustomSkillIdsVol(null); form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] }); }}
            className={primaryActionClass}
          >
            <Plus className="w-5 h-5" /> Add Score
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4 -mt-6">
        <div
          className="sticky z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-background/90 backdrop-blur-md border-b border-border/60"
          style={{ top: "var(--page-header-h, 96px)" }}
        >
          <TabsList className="inline-flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-secondary/40 p-1 shrink-0 self-start">
            <TabsTrigger value="scores" data-testid="tab-scores">Scores</TabsTrigger>
            <TabsTrigger value="graph" data-testid="tab-graph">Graph</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="scores" forceMount className="mt-0 data-[state=inactive]:hidden">

      {hasComps && (
        <div className="relative card-3d rounded-2xl overflow-hidden mb-6">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" aria-hidden="true" />
          <div className="p-6 pl-7">
            <div className="eyebrow text-amber-400/70">Competition Personal Best</div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="font-display font-normal text-5xl sm:text-6xl text-amber-400 leading-none tracking-tight" data-testid="text-pb-set">
                  {pb.set.score > 0 ? fmtScore(pb.set.score) : "—"}
                </div>
                <div className="eyebrow !text-[10px] mt-1.5 text-muted-foreground/70">Set Score</div>
                <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: "E", id: "e", v: pb.set.e.toFixed(1) },
                    { k: "HD", id: "h", v: pb.set.h.toFixed(1) },
                    { k: "TOF", id: "tof", v: fmtScore(pb.set.tof) },
                  ].map((c) => (
                    <div key={c.k}>
                      <div className="font-mono text-[15px] font-semibold tabular-nums tracking-tight" data-testid={`text-pb-set-${c.id}`}>{c.v}</div>
                      <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">{c.k}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-display font-normal text-5xl sm:text-6xl text-amber-400 leading-none tracking-tight" data-testid="text-pb-vol">
                  {pb.vol.score > 0 ? fmtScore(pb.vol.score) : "—"}
                </div>
                <div className="eyebrow !text-[10px] mt-1.5 text-muted-foreground/70">Vol Score</div>
                <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-4 gap-2 text-center">
                  {[
                    { k: "E", id: "e", v: pb.vol.e.toFixed(1) },
                    { k: "DD", id: "dd", v: pb.vol.dd.toFixed(1) },
                    { k: "HD", id: "h", v: pb.vol.h.toFixed(1) },
                    { k: "TOF", id: "tof", v: fmtScore(pb.vol.tof) },
                  ].map((c) => (
                    <div key={c.k}>
                      <div className="font-mono text-[15px] font-semibold tabular-nums tracking-tight" data-testid={`text-pb-vol-${c.id}`}>{c.v}</div>
                      <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">{c.k}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isAdding} onOpenChange={(o) => { if (!o) { setIsAdding(false); setEditingScore(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScore ? "Edit Score" : "Add New Score"}</DialogTitle>
          </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => {
                const round3 = (n: number | null | undefined) =>
                  n == null || !Number.isFinite(n) ? n : Math.round(n * 1000) / 1000;
                data = { ...data, timeOfFlight: round3(data.timeOfFlight) ?? 0, timeOfFlightVol: round3(data.timeOfFlightVol) ?? 0 };
                const values =
                  data.type === "competition" || data.type === "trial"
                    ? { ...data, round: data.round || "prelims", competitionId: data.competitionId || newCompetitionId() }
                    : { ...data, round: null, competitionId: null, competitionName: "", rank: null };
                if (editingScore) {
                  updateMutation.mutate({ id: editingScore.id, values });
                } else {
                  createMutation.mutate(values);
                }
              }, (errors) => {
                const first = Object.values(errors).find(
                  (e: any) => e && typeof e.message === "string" && e.message,
                ) as { message?: string } | undefined;
                toast({
                  title: "Couldn't save score",
                  description: first?.message ?? "Please check the highlighted fields and try again.",
                  variant: "destructive",
                });
              })} className="space-y-6">
                <div className="space-y-4">
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full text-left font-normal rounded-xl h-11 font-mono", !field.value && "text-muted-foreground")}>
                              {field.value ? format(parseISO(field.value), "EEE, d MMMM yyyy") : "Pick a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? parseISO(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                            disabled={(date) => date > new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={(val) => {
                          field.onChange(val);
                          if (val === "competition" || val === "trial") {
                            if (!form.getValues("round")) form.setValue("round", editingScore?.round ?? "prelims");
                            if (!form.getValues("competitionId") && editingScore?.competitionId) form.setValue("competitionId", editingScore.competitionId);
                          } else {
                            form.setValue("round", null);
                            form.setValue("competitionId", null);
                          }
                        }} value={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="practice">Practice</SelectItem>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="competition">Competition</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="set">Set Only</SelectItem>
                            <SelectItem value="vol">Vol Only</SelectItem>
                            <SelectItem value="both">Set and Vol</SelectItem>
                            <SelectItem value="vol_vol">Vol and Vol</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {(form.watch("type") === "competition" || form.watch("type") === "trial") && (
                  <div className="space-y-4">
                    <FormField control={form.control} name="competitionName" render={({ field }) => (
                      <FormItem><FormLabel>{form.watch("type") === "trial" ? "Name" : "Competition Name"}</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder={form.watch("type") === "trial" ? "e.g. Squad Trial" : "e.g. State Championships"} className="rounded-xl h-11" /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="round" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Round</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? "prelims"}>
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="prelims">Prelims</SelectItem>
                              <SelectItem value="final">Final</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="rank" render={({ field }) => (
                        <FormItem><FormLabel>{form.watch("round") === "final" ? "Final Rank" : "Prelims Rank"}</FormLabel><FormControl><Input type="number" {...field} value={field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(undefined); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} placeholder="e.g. 1" className="rounded-xl h-11 font-mono" /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>
                )}

                <div className="space-y-4 relative min-h-[280px]">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-primary/60">
                    {form.watch("category") === "both"
                      ? "Set Score"
                      : form.watch("category") === "vol_vol"
                        ? "Vol Score 1"
                        : "Score Details"}
                  </h3>
                  <div className="flex gap-2 items-end">
                    <FormField control={form.control} name="routineId" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>{form.watch("category") === "vol_vol" ? "Routine (Vol 1)" : "Routine"}</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                          <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select a routine" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {routines?.filter(r => r.archived !== 1 || r.id === field.value).map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {form.watch("routineId") && customSkillIds && (
                      <Button type="button" variant="outline" size="sm"
                        className="h-11 rounded-xl border-primary/20 text-xs gap-1.5 shrink-0"
                        onClick={() => setEditingRoutine("set")}>
                        <Pencil className="h-3 w-3" />
                        Skills ({customSkillIds.length})
                      </Button>
                    )}
                  </div>
                  {editingRoutine === "set" && customSkillIds && allSkills && (
                    <SkillEditorOverlay
                      title="Edit Skills"
                      skillIds={customSkillIds}
                      allSkills={allSkills}
                      onSkillIdsChange={setCustomSkillIds}
                      onClose={() => setEditingRoutine(null)}
                      filterSkills={(s) => s.isDrill !== 1}
                      uidPrefix="skill"
                      closeVariant="icon"
                      className="absolute inset-0 bg-background/97 backdrop-blur-sm z-10 rounded-xl shadow-lg shadow-black/5 p-4"
                    />
                  )}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                    <FormField control={form.control} name="execution" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E1</FormLabel><FormControl><Input type="number" step="0.1" placeholder="E1" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-execution-1" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="executionTwo" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-1">
                          <FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E2</FormLabel>
                          <button type="button" aria-pressed={!!form.watch("doubleExecution")} onClick={() => form.setValue("doubleExecution", !form.watch("doubleExecution"))} className={cn("rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none border transition-colors", form.watch("doubleExecution") ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:text-foreground")} data-testid="button-double-execution">E1×2</button>
                        </div>
                        <FormControl><Input type="number" step="0.1" placeholder="E2" disabled={!!form.watch("doubleExecution")} value={form.watch("doubleExecution") ? (form.watch("execution") || "") : (field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value)} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono disabled:opacity-60" data-testid="input-execution-2" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="horizontal" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="timeOfFlight" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">T</FormLabel><FormControl><Input type="number" step="0.001" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="total" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono bg-background font-bold text-primary" /></FormControl></FormItem>
                    )} />
                  </div>
                </div>

                {(form.watch("category") === "both" || form.watch("category") === "vol_vol") && (
                  <div className="space-y-4 pt-4 border-t border-primary/10 relative min-h-[280px]">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-primary/60">
                      {form.watch("category") === "vol_vol" ? "Vol Score 2" : "Vol Score"}
                    </h3>
                    <div className="flex gap-2 items-end">
                      <FormField control={form.control} name="routineIdVol" render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{form.watch("category") === "vol_vol" ? "Routine (Vol 2)" : "Routine (Vol)"}</FormLabel>
                          <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select a routine" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {routines?.filter(r => r.archived !== 1 || r.id === field.value).map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      {form.watch("routineIdVol") && customSkillIdsVol && (
                        <Button type="button" variant="outline" size="sm"
                          className="h-11 rounded-xl border-primary/20 text-xs gap-1.5 shrink-0"
                          onClick={() => setEditingRoutine("vol")}>
                          <Pencil className="h-3 w-3" />
                          Skills ({customSkillIdsVol.length})
                        </Button>
                      )}
                    </div>
                    {editingRoutine === "vol" && customSkillIdsVol && allSkills && (
                      <SkillEditorOverlay
                        title="Edit Skills (Vol)"
                        skillIds={customSkillIdsVol}
                        allSkills={allSkills}
                        onSkillIdsChange={setCustomSkillIdsVol}
                        onClose={() => setEditingRoutine(null)}
                        filterSkills={(s) => s.isDrill !== 1}
                        uidPrefix="vskill"
                        closeVariant="icon"
                        className="absolute inset-0 bg-background/97 backdrop-blur-sm z-10 rounded-xl shadow-lg shadow-black/5 p-4"
                      />
                    )}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                      <FormField control={form.control} name="executionVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E1</FormLabel><FormControl><Input type="number" step="0.1" placeholder="E1" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-execution-vol-1" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="executionTwoVol" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-1">
                            <FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E2</FormLabel>
                            <button type="button" aria-pressed={!!form.watch("doubleExecutionVol")} onClick={() => form.setValue("doubleExecutionVol", !form.watch("doubleExecutionVol"))} className={cn("rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none border transition-colors", form.watch("doubleExecutionVol") ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:text-foreground")} data-testid="button-double-execution-vol">E1×2</button>
                          </div>
                          <FormControl><Input type="number" step="0.1" placeholder="E2" disabled={!!form.watch("doubleExecutionVol")} value={form.watch("doubleExecutionVol") ? (form.watch("executionVol") || "") : (field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value)} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono disabled:opacity-60" data-testid="input-execution-vol-2" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="difficultyVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="horizontalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="timeOfFlightVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">T</FormLabel><FormControl><Input type="number" step="0.001" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="totalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono bg-background font-bold text-primary" /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full h-11 rounded-xl" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingScore ? "Save Changes" : "Save Score"}
                </Button>
              </form>
            </Form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {queuedScores.map((score) => (
          <ScoreCard
            key={`pending-${score.id}`}
            score={score}
            routines={routines}
            firstPracticedByRoutine={firstPracticedByRoutine}
            testId={`card-score-pending-${score.id}`}
            pending
            pendingBadge={<PendingSyncBadge testId={`badge-pending-score-${score.id}`} />}
            actions={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 text-muted-foreground/50 hover:text-foreground" data-testid={`btn-score-actions-${score.id}`}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={async () => {
                      const ok = await deleteQueuedByTempId(score.id);
                      if (ok) toast({ title: "Pending score discarded" });
                    }}
                    data-testid={`btn-score-discard-${score.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Discard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
        {offlineModeEnabled && !isOnline ? (
          <div className="md:col-span-2">
            <OfflinePlaceholder
              testId="card-offline-scores"
              hint={
                queuedScores.length > 0
                  ? "Synced scores aren't available offline. They'll be back when you reconnect."
                  : "Previous scores aren't available offline. They'll be back when you reconnect."
              }
            />
          </div>
        ) : null}
        {(!offlineModeEnabled || isOnline) && renderItems.map((item) => (
          item.kind === "comp" ? (
            <CompetitionCard
              key={item.key}
              variant={item.rounds[0].type === "trial" ? "trial" : "competition"}
              rounds={item.rounds}
              testId={`card-${item.rounds[0].type === "trial" ? "trial" : "competition"}-${item.rounds[0].id}`}
              onEditRound={startEdit}
              onDeleteRound={setDeleteScoreId}
              onDeleteComp={setDeleteCompIds}
              onAddFinal={startAddFinal}
              routines={routines}
              firstPracticedByRoutine={firstPracticedByRoutine}
            />
          ) : item.score.type === "trial" ? (
            <CompetitionCard
              key={item.key}
              variant="trial"
              rounds={[item.score]}
              testId={`card-trial-${item.score.id}`}
              onEditRound={startEdit}
              onDeleteRound={setDeleteScoreId}
              onDeleteComp={setDeleteCompIds}
              onAddFinal={startAddFinal}
              routines={routines}
              firstPracticedByRoutine={firstPracticedByRoutine}
            />
          ) : (
            <ScoreCard
              key={item.key}
              score={item.score}
              routines={routines}
              firstPracticedByRoutine={firstPracticedByRoutine}
              testId={`card-score-${item.score.id}`}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 text-muted-foreground/50 hover:text-foreground" data-testid={`btn-score-actions-${item.score.id}`}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32 rounded-xl">
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEdit(item.score)} data-testid={`btn-score-edit-${item.score.id}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteScoreId(item.score.id)} data-testid={`btn-score-delete-${item.score.id}`}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          )
        ))}
        {(!offlineModeEnabled || isOnline) && scores?.length === 0 && queuedScores.length === 0 && (
          <div className="text-center py-20 card-3d rounded-2xl md:col-span-2">
            <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No scores recorded yet.</p>
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="graph" className="mt-0">
          <ScoreGraph scores={(!offlineModeEnabled || isOnline) ? (scores ?? []) : []} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteScoreId !== null}
        onOpenChange={(open) => { if (!open) setDeleteScoreId(null); }}
        title="Delete this score?"
        description="This action cannot be undone."
        onConfirm={() => { if (deleteScoreId !== null) { deleteMutation.mutate(deleteScoreId); setDeleteScoreId(null); } }}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={deleteCompIds !== null}
        onOpenChange={(open) => { if (!open) setDeleteCompIds(null); }}
        title="Delete this entry?"
        description="All rounds in this entry will be permanently deleted. This action cannot be undone."
        onConfirm={() => { if (deleteCompIds !== null) { deleteCompMutation.mutate(deleteCompIds); setDeleteCompIds(null); } }}
        confirmLabel="Delete"
      />
    </PageLayout>
  );
}
