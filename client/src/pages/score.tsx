import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertScoreSchema, type Score, type Routine, type Skill, type InsertScore, type ExecutionSession, type InsertExecutionSession } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calcDDFromSkillIds, parseNoteSkills } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { pageAccentStyle } from "@/lib/page-accent";
import { DialogHero } from "@/components/dialog-hero";
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useOnline } from "@/hooks/use-online";
import { useNotes } from "@/hooks/use-notes";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useQueuedScores } from "@/hooks/use-queued-scores";
import { deleteQueuedByTempId, isQueuedOfflineResult, tryNetworkOrEnqueue, tryNetworkOrEnqueueChange, type OfflineQueuedResult } from "@/lib/offline-queue";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Trash2, Plus, Trophy, CalendarIcon, Pencil, MoreVertical, TrendingUp, SlidersHorizontal, Users, ImageUp, Loader2, RotateCcw, X, Medal } from "lucide-react";
import { useLocation } from "wouter";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { fileToDataUrl } from "@/lib/image-file";
import { SheetPhotoPreview } from "@/components/sheet-photo-preview";
import { emptyTenths, parseTenthsRow, tenthsRowToInsert, TenthsGrid, TenthsRowSummary } from "@/components/execution-tenths";
import { EXECUTION_SKILL_COUNT } from "@shared/execution";
import { api } from "@shared/routes";

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
  synchro: false,
  execution: 0,
  executionTwo: 0,
  doubleExecution: false,
  difficulty: 0,
  horizontal: 0,
  horizontalTwo: 0,
  timeOfFlight: 0,
  total: 0,
  executionVol: 0,
  executionTwoVol: 0,
  doubleExecutionVol: false,
  difficultyVol: 0,
  horizontalVol: 0,
  horizontalTwoVol: 0,
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

function ScoreBreakdown({ e, d, h, t, label, routineName, total, totalColor, totalTestId, synchro }: { e: number; d: number; h: number; t: number; label?: string; routineName?: string | null; total?: number; totalColor?: string; totalTestId?: string; synchro?: boolean | null }) {
  const cols: { k: string; v: string; accent?: boolean }[] = [
    { k: "E", v: e.toFixed(1) },
    { k: "DD", v: d.toFixed(1) },
    { k: "H", v: h.toFixed(1) },
    { k: synchro ? "Sync" : "TOF", v: fmtScore(t) },
    ...(total != null ? [{ k: "TOTAL", v: fmtScore(total), accent: true }] : []),
  ];
  return (
    <div>
      {(label || routineName) && (
        <div className="flex items-baseline gap-2 mb-2 min-w-0">
          {label && <span className="eyebrow text-[0.6rem] tracking-[0.2em] text-muted-foreground/80 shrink-0">{label}</span>}
          {routineName && (
            <span className="inline-block max-w-full truncate rounded-lg border border-white/[0.09] px-2 py-0.5 font-mono text-[11px] text-muted-foreground align-middle">
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

// Shown on the score card only for a partial routine (anything other than a full 10).
function attemptSuffix(n: number | null | undefined): string {
  return n != null && n !== 10 ? ` · ${n} skill${n === 1 ? "" : "s"}` : "";
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
        e={effectiveE(score.execution, score.executionTwo, score.doubleExecution, score.synchro)}
        d={score.difficulty}
        h={effectiveH(score.horizontal, score.horizontalTwo, score.synchro)}
        t={score.timeOfFlight}
        synchro={score.synchro}
        label={`${group1Label}${attemptSuffix(score.attempt)}`}
        routineName={routineName(score.routineId)}
        total={score.total}
        totalColor={totalColor}
        totalTestId={`text-group1-total-${score.id}`}
      />
      {isMulti && (
        <ScoreBreakdown
          e={effectiveE(score.executionVol ?? 0, score.executionTwoVol, score.doubleExecutionVol, score.synchro)}
          d={score.difficultyVol ?? 0}
          h={effectiveH(score.horizontalVol ?? 0, score.horizontalTwoVol, score.synchro)}
          t={score.timeOfFlightVol ?? 0}
          synchro={score.synchro}
          label={`${group2Label}${attemptSuffix(score.attemptVol)}`}
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
      className={cn(
        "relative rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025] transition-colors hover:border-white/[0.12]",
        pending && "border-amber-500/40",
      )}
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
            {score.synchro && (
              <span className="inline-block mt-1.5 ml-1.5 px-2.5 py-0.5 rounded-md border border-primary/40 text-primary text-[10px] font-mono font-semibold uppercase tracking-wider" data-testid={`badge-synchro-${score.id}`}>
                Synchro
              </span>
            )}
            {isComp && (score.competitionName || score.rank != null) && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {score.competitionName}
                {score.rank != null ? ` · #${score.rank}` : ""}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-start gap-1">
            <div className="text-right">
              <div className={cn("font-black text-5xl sm:text-6xl leading-none tracking-[-0.03em] tabular-nums", totalColor)} data-testid={`text-score-total-${score.id}`}>
                {fmtScore(grandTotal)}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-[0.15em] mt-1 text-muted-foreground/50">Score</div>
            </div>
            {actions}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.08]">
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

// One extracted routine line from a competition scoresheet photo. Values stay
// as editable strings during review; blank = not printed on the sheet.
type SheetRow = {
  key: number;
  label: string;
  execution: string;
  difficulty: string;
  horizontal: string;
  timeOfFlight: string;
  total: string;
  kept: boolean;
  routineId: string; // "" = unset, "none" = explicitly no routine
};

// A deduction row read from the same photo by the judges'-sheet parser.
type ParsedExecRow = { label: string; deductions: number[]; landing: number | null };

// Draft execution session offered after the score saves (step 3).
type ExecDraft = {
  key: number;
  label: string;
  tenths: string[];
  kept: boolean;
  routineId: string; // "" = unset — a routine is required before saving
  category: "set" | "vol";
};

const sheetNum = (s: string): number => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : 0;
};

function sheetRowValues(r: SheetRow) {
  const e = sheetNum(r.execution);
  const d = sheetNum(r.difficulty);
  const h = sheetNum(r.horizontal);
  const t = sheetNum(r.timeOfFlight);
  const sum = Math.round((e + d + h + t) * 1000) / 1000;
  const total = r.total.trim() === "" ? sum : sheetNum(r.total);
  return { e, d, h, t, sum, total, mismatch: r.total.trim() !== "" && Math.abs(total - sum) > 0.005 };
}

function sheetFieldInvalid(s: string): boolean {
  if (s.trim() === "") return false;
  const n = Number(s);
  return !Number.isFinite(n) || n < 0;
}

function sheetRowValid(r: SheetRow): boolean {
  return (
    r.execution.trim() !== "" &&
    ![r.execution, r.difficulty, r.horizontal, r.timeOfFlight, r.total].some(sheetFieldInvalid)
  );
}

// Overall score for a row: vol_vol counts the BEST of the two voluntary routines,
// "both" sums set + vol, everything else is the single total.
function effectiveTotal(score: Pick<Score, "category" | "total" | "totalVol">): number {
  if (score.category === "vol_vol") return Math.max(score.total, score.totalVol ?? 0);
  if (score.category === "both") return score.total + (score.totalVol ?? 0);
  return score.total;
}

// Average only the values that were actually entered. Empty boxes are stored as 0,
// so treat 0 as "absent": one value alone is used as-is, two values are averaged.
function avgPresent(a: number, b: number): number {
  const present = [a, b].filter((v) => v > 0);
  if (present.length === 0) return 0;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

// Combined execution: two judges summed (E1 + E2), or the first judge doubled (E1 * 2).
// In synchro mode the two boxes are the two athletes' scores, AVERAGED (only when both entered).
function effectiveE(e: number, eTwo: number | null | undefined, dbl: boolean | null | undefined, synchro?: boolean | null): number {
  if (synchro) return avgPresent(e ?? 0, eTwo ?? 0);
  return dbl ? e * 2 : e + (eTwo ?? 0);
}

// Horizontal displacement: single value, or the AVERAGE of two athletes when synchro (only when both entered).
function effectiveH(h: number, hTwo: number | null | undefined, synchro?: boolean | null): number {
  if (synchro) return avgPresent(h ?? 0, hTwo ?? 0);
  return h ?? 0;
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
    <div className="pt-4 border-t border-white/[0.08] first:border-t-0 first:pt-0" data-testid={`round-${score.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {score.round && (
            <div className={cn("eyebrow !text-[10px]", accentEyebrow)}>{roundLabel(score.round)}</div>
          )}
          {score.synchro && (
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md border border-primary/40 text-primary text-[9px] font-mono font-semibold uppercase tracking-wider" data-testid={`badge-synchro-round-${score.id}`}>
              Synchro
            </span>
          )}
          {!hideRank && score.rank != null && (
            <div className="font-mono text-xs text-muted-foreground mt-0.5" data-testid={`text-round-rank-${score.id}`}>Rank #{score.rank}</div>
          )}
        </div>
        <div className="shrink-0 flex items-start gap-1">
          <div className="text-right">
            <div className={cn("font-black text-4xl sm:text-5xl leading-none tracking-[-0.03em] tabular-nums", accent)} data-testid={`text-round-total-${score.id}`}>
              {fmtScore(grandTotal)}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-[0.15em] mt-1 text-muted-foreground/50">Score</div>
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
  onAddFinalPhoto,
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
  onAddFinalPhoto: (prelims: Score) => void;
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
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025] transition-colors hover:border-white/[0.12]" data-testid={testId}>
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
                <div className={cn("text-[9px] font-mono uppercase tracking-[0.15em]", theme.accentSoft)}>{finalRound ? "Final Rank" : "Rank"}</div>
                <div className={cn("font-black text-[2rem] sm:text-[2.5rem] leading-none tracking-[-0.03em] tabular-nums", theme.accent)} data-testid={`text-final-rank-${bigRankRound.id}`}>
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
                  <>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => onAddFinal(prelimsRound)} data-testid={`btn-comp-add-final-${first.id}`}>
                      <Plus className="h-3.5 w-3.5" /> Add final round
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => onAddFinalPhoto(prelimsRound)} data-testid={`btn-comp-add-final-photo-${first.id}`}>
                      <ImageUp className="h-3.5 w-3.5" /> Final from photo
                    </DropdownMenuItem>
                  </>
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
  { key: "total", name: "Total", color: "hsl(var(--chart-3))" },
  { key: "e", name: "E", color: "hsl(var(--chart-1))" },
  { key: "dd", name: "DD", color: "hsl(var(--chart-4))" },
  { key: "hd", name: "HD", color: "hsl(var(--chart-2))" },
  { key: "tof", name: "TOF", color: "hsl(var(--chart-5))" },
] as const;

type GraphSeriesKey = (typeof GRAPH_SERIES)[number]["key"];

function ScoreGraph({
  scores,
  idSuffix = "",
  eyebrow = "Score Trend",
  eyebrowAccent = "/ Breakdown",
  subtitle = "One point per routine — Total vs E, DD, HD & TOF.",
  synchroLabels = false,
}: {
  scores: Score[];
  idSuffix?: string;
  eyebrow?: string;
  eyebrowAccent?: string;
  subtitle?: string;
  synchroLabels?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [hidden, setHidden] = useState<Set<GraphSeriesKey>>(new Set());
  const series = useMemo(
    () => (synchroLabels ? GRAPH_SERIES.map((s) => (s.key === "tof" ? { ...s, name: "Sync" } : s)) : GRAPH_SERIES),
    [synchroLabels],
  );

  const data = useMemo(() => {
    // One routine = one point. A "both" / "vol_vol" record holds two routines,
    // so it emits two points (each keeps Total = E + DD + HD + TOF coherent).
    const g1 = (s: Score) => ({
      total: s.total,
      e: effectiveE(s.execution, s.executionTwo, s.doubleExecution, s.synchro),
      dd: s.difficulty,
      hd: effectiveH(s.horizontal, s.horizontalTwo, s.synchro),
      tof: s.timeOfFlight,
    });
    const g2 = (s: Score) => ({
      total: s.totalVol ?? 0,
      e: effectiveE(s.executionVol ?? 0, s.executionTwoVol, s.doubleExecutionVol, s.synchro),
      dd: s.difficultyVol ?? 0,
      hd: effectiveH(s.horizontalVol ?? 0, s.horizontalTwoVol, s.synchro),
      tof: s.timeOfFlightVol ?? 0,
    });

    const sorted = (scores ?? [])
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    const matchCat = (cat: "set" | "vol") => catFilter === "all" || catFilter === cat;

    const points: { idx: number; date: string; label: string; total: number; e: number; dd: number; hd: number; tof: number }[] = [];
    for (const s of sorted) {
      if (s.category === "both") {
        if (matchCat("set")) points.push({ idx: points.length, date: s.date, label: "Set", ...g1(s) });
        if (matchCat("vol")) points.push({ idx: points.length, date: s.date, label: "Vol", ...g2(s) });
      } else if (s.category === "vol_vol") {
        if (matchCat("vol")) {
          points.push({ idx: points.length, date: s.date, label: "Vol 1", ...g1(s) });
          points.push({ idx: points.length, date: s.date, label: "Vol 2", ...g2(s) });
        }
      } else {
        const cat = s.category === "vol" ? "vol" : "set";
        if (matchCat(cat)) points.push({ idx: points.length, date: s.date, label: cat === "vol" ? "Vol" : "Set", ...g1(s) });
      }
    }
    return points;
  }, [scores, typeFilter, catFilter]);

  const toggle = (k: GraphSeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Hero figure: latest point that actually has a total (0-total rows are
  // partial entries and would make the delta meaningless).
  const totalPoints = data.filter(p => p.total > 0);
  const latestPoint = totalPoints.length > 0 ? totalPoints[totalPoints.length - 1] : null;
  const prevPoint = totalPoints.length > 1 ? totalPoints[totalPoints.length - 2] : null;
  const latestDelta = latestPoint && prevPoint ? latestPoint.total - prevPoint.total : null;

  return (
    <div className="rounded-2xl p-5 border border-white/[0.07] bg-white/[0.025]" data-testid={`card-score-graph${idSuffix}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">{eyebrow} <span className="text-amber-400">{eyebrowAccent}</span></div>
          {latestPoint ? (
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-4xl sm:text-5xl font-extrabold tracking-[-0.05em] tabular-nums leading-none" data-testid={`text-graph-latest${idSuffix}`}>
                {latestPoint.total.toFixed(1)}
              </div>
              {latestDelta != null && Math.abs(latestDelta) > 1e-9 && (
                <span
                  className={cn("font-mono text-xs tabular-nums", latestDelta > 0 ? "text-emerald-400" : "text-rose-400")}
                  data-testid={`text-graph-delta${idSuffix}`}
                >
                  {latestDelta > 0 ? "▲" : "▼"} {Math.abs(latestDelta).toFixed(1)}
                </span>
              )}
              <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground/60">Latest {latestPoint.label}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center sm:justify-end gap-2 sm:shrink-0">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-[110px] h-8 rounded-xl text-xs border-white/[0.07] font-mono shrink-0" data-testid={`select-graph-category${idSuffix}`}><SelectValue /></SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="all">Set &amp; Vol</SelectItem>
              <SelectItem value="set">Set only</SelectItem>
              <SelectItem value="vol">Vol only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[124px] h-8 rounded-xl text-xs border-white/[0.07] font-mono shrink-0" data-testid={`select-graph-type${idSuffix}`}><SelectValue /></SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="competition">Competition</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="practice">Practice</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 rounded-xl text-xs font-mono border-white/[0.07] gap-1.5 px-3" data-testid={`button-graph-elements${idSuffix}`}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Elements
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono">
              <DropdownMenuLabel className="text-xs">Show Elements</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {series.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.key}
                  checked={!hidden.has(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                  data-testid={`filter-${s.key}${idSuffix}`}
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
        <div className="text-center py-16" data-testid={`empty-score-graph${idSuffix}`}>
          <TrendingUp className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No scores to chart yet.</p>
        </div>
      ) : (
        <>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.key} id={`scoreFill-${s.key}${idSuffix}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={s.key === "total" ? 0.22 : 0.1} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
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
                {series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={s.key === "total" ? 2.5 : 1.5}
                    fill={`url(#scoreFill-${s.key}${idSuffix})`}
                    hide={hidden.has(s.key)}
                    dot={false}
                    activeDot={{ r: 5, fill: s.color, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {series.map((s) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition-opacity", off ? "opacity-40 border-white/[0.07]" : "border-border")}
                  data-testid={`legend-${s.key}${idSuffix}`}
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [deleteScoreId, setDeleteScoreId] = useState<number | null>(null);
  const [deleteCompIds, setDeleteCompIds] = useState<number[] | null>(null);
  const [customSkillIds, setCustomSkillIds] = useState<number[] | null>(null);
  const [customSkillIdsVol, setCustomSkillIdsVol] = useState<number[] | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<"set" | "vol" | null>(null);
  const [offlineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();

  // ---- Scoresheet photo flow (parse → review → details → save) ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<"review" | "details" | "executions">("review");
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [sheetPhotoUrl, setSheetPhotoUrl] = useState<string | null>(null);
  // Full uploaded photo (before area selection) shown in the crop step.
  const [sheetPhotoOriginal, setSheetPhotoOriginal] = useState<string | null>(null);
  // Draft execution sessions parsed from the same photo, offered after the
  // score saves ("add the deductions too" step).
  const [execDrafts, setExecDrafts] = useState<ExecDraft[]>([]);
  const [savingExecDrafts, setSavingExecDrafts] = useState(false);
  const [sheetFinishing, setSheetFinishing] = useState(false);
  const execParseRef = useRef<Promise<ParsedExecRow[] | null> | null>(null);
  const [sheetDate, setSheetDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [sheetType, setSheetType] = useState<string>("competition");
  const [sheetCompName, setSheetCompName] = useState("");
  const [sheetRound, setSheetRound] = useState<string>("prelims");
  const [sheetCategory, setSheetCategory] = useState<"set" | "vol">("vol");
  // Two-row sheets: are the two routines set+vol (qualification) or vol+vol (e.g. a final)?
  const [sheetPairCategory, setSheetPairCategory] = useState<"both" | "vol_vol">("both");
  const [parsingSheet, setParsingSheet] = useState(false);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  // "Final from photo": the prelims score the scanned sheet attaches a final to.
  const [sheetFinalFor, setSheetFinalFor] = useState<Score | null>(null);
  // Carries the target across the native file picker (the input's onChange).
  const pendingFinalForRef = useRef<Score | null>(null);

  const { data: scores } = useQuery<Score[]>({
    queryKey: ["/api/scores"],
    enabled: !(offlineModeEnabled && !isOnline),
  });
  const queuedScores = useQueuedScores();
  const { data: routines } = useQuery<Routine[]>({ queryKey: ["/api/routines"] });
  // Routine pickers hide archived routines unless toggled on (an already-linked
  // archived routine always stays visible so edits display correctly).
  const [showArchivedRoutines, setShowArchivedRoutines] = useState(false);
  const archivedRoutineCount = (routines ?? []).filter(r => r.archived === 1).length;
  const routineOptions = (selected?: number | string | null) => {
    const sel = selected == null || selected === "" || selected === "none" ? null : Number(selected);
    const opts = (routines ?? []).filter(r => r.archived !== 1 || showArchivedRoutines || r.id === sel);
    return [...opts.filter(r => r.archived !== 1), ...opts.filter(r => r.archived === 1)];
  };
  // Rendered at the bottom of each routine SelectContent (only one is mounted at a time).
  const archivedToggleRow = archivedRoutineCount > 0 ? (
    <button
      type="button"
      className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowArchivedRoutines(v => !v); }}
      data-testid="button-toggle-archived-routines"
    >
      {showArchivedRoutines ? "Hide archived routines" : `Show archived routines (${archivedRoutineCount})`}
    </button>
  ) : null;
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
      return await tryNetworkOrEnqueueChange("score", id, "PUT", values, async (signal) => {
        const res = await fetch(`/api/scores/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
          signal,
        });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        return res.json();
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      setEditingScore(null);
      setIsAdding(false);
      setCustomSkillIds(null);
      setCustomSkillIdsVol(null);
      toast({ title: queued ? "Saved offline. Will sync when reconnected." : "Score updated!" });
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
      return await tryNetworkOrEnqueueChange("score", id, "DELETE", undefined, async (signal) => {
        const res = await fetch(`/api/scores/${id}`, { method: "DELETE", credentials: "include", signal });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      toast({ title: queued ? "Deleted offline. Will sync when reconnected." : "Score deleted" });
    }
  });

  const deleteCompMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      let anyQueued = false;
      for (const id of ids) {
        const result = await tryNetworkOrEnqueueChange("score", id, "DELETE", undefined, async (signal) => {
          const res = await fetch(`/api/scores/${id}`, { method: "DELETE", credentials: "include", signal });
          // 404 = already deleted (e.g. by a previously drained queued delete) — treat as success.
          if (!res.ok && res.status !== 404) throw new Error((await res.text()) || res.statusText);
        });
        if (isQueuedOfflineResult(result)) anyQueued = true;
      }
      return anyQueued;
    },
    onSuccess: (anyQueued) => {
      if (!anyQueued) queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      toast({ title: anyQueued ? "Deleted offline. Will sync when reconnected." : "Competition deleted" });
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

  const closeSheet = () => {
    setSheetOpen(false);
    setSheetStep("review");
    setSheetRows([]);
    setSheetPhotoUrl(null);
    setSheetPhotoOriginal(null);
    setSheetFinalFor(null);
    setExecDrafts([]);
    setSavingExecDrafts(false);
    setSheetFinishing(false);
    execParseRef.current = null;
    setSheetCompName("");
    setSheetRound("prelims");
    setSheetType("competition");
    setSheetCategory("vol");
    setSheetPairCategory("both");
    setSheetDate(new Date().toISOString().split("T")[0]);
  };

  // Step 0: photo picked → open the dialog on the area-select step (no AI call yet).
  // Read the whole sheet photo straight away — no crop/selection step.
  const openSheetPhoto = async (file: File) => {
    if (parsingSheet) return;
    setParsingSheet(true);
    // Consume the pending "final for this comp" target set by the card menu.
    const finalFor = pendingFinalForRef.current;
    pendingFinalForRef.current = null;
    try {
      const dataUrl = await fileToDataUrl(file);
      closeSheet(); // reset any leftover state from a previous sheet
      // In parallel, try reading per-skill deduction rows from the same photo —
      // offered as Execution-tracker drafts after the score is saved.
      execParseRef.current = apiRequest("POST", "/api/execution-sessions/parse-photo", { images: [dataUrl] })
        .then(res => res.json())
        .then((p: { rows: ParsedExecRow[] }) => (p.rows && p.rows.length > 0 ? p.rows : null))
        .catch(() => null);
      const res = await apiRequest("POST", "/api/scores/parse-photo", { images: [dataUrl] });
      const parsed = (await res.json()) as {
        routines: { label: string; execution: number | null; difficulty: number | null; horizontal: number | null; timeOfFlight: number | null; total: number | null }[];
        competitionName: string | null;
        round: string | null;
        date: string | null;
      };
      if (!parsed.routines || parsed.routines.length === 0) {
        execParseRef.current = null;
        toast({
          title: "No routine scores found",
          description: "Couldn't read E/D/H/T lines in that photo. Try a closer photo of the score lines, or enter the score manually.",
          variant: "destructive",
        });
        return;
      }
      const rows: SheetRow[] = parsed.routines.map((r, idx) => ({
        key: idx,
        label: r.label,
        execution: r.execution != null ? String(r.execution) : "",
        difficulty: r.difficulty != null ? String(r.difficulty) : "",
        horizontal: r.horizontal != null ? String(r.horizontal) : "",
        timeOfFlight: r.timeOfFlight != null ? String(r.timeOfFlight) : "",
        total: r.total != null ? String(r.total) : "",
        kept: true,
        routineId: "",
      }));
      setSheetFinalFor(finalFor);
      setSheetPhotoOriginal(dataUrl);
      setSheetRows(rows);
      setSheetPhotoUrl(dataUrl);
      if (finalFor) {
        // Attaching a final to an existing competition — details come from it.
        setSheetDate(parsed.date ?? finalFor.date);
        setSheetCompName(finalFor.competitionName ?? "");
        setSheetRound("final");
        setSheetType(finalFor.type === "trial" ? "trial" : "competition");
        // Finals are voluntary routines (two rows = e.g. semi + final voluntary).
        setSheetCategory("vol");
        setSheetPairCategory(rows.length === 2 ? "vol_vol" : "both");
      } else {
        setSheetDate(parsed.date ?? new Date().toISOString().split("T")[0]);
        setSheetCompName(parsed.competitionName ?? "");
        setSheetRound(parsed.round === "final" ? "final" : "prelims");
        setSheetType(parsed.competitionName || parsed.round ? "competition" : "practice");
        // Single-routine sheet: a blank DD line usually means the set routine.
        const first = parsed.routines[0];
        setSheetCategory(rows.length === 1 && (first.difficulty == null || first.difficulty === 0) ? "set" : "vol");
        // Two-routine sheet: a printed DD on the first routine suggests two voluntaries
        // (e.g. a final); a blank/0 DD on R1 means the classic set + voluntary pair.
        setSheetPairCategory(rows.length === 2 && first.difficulty != null && first.difficulty > 0 ? "vol_vol" : "both");
      }
      setSheetStep("review");
      // The photo path replaces the manual form — close it if it was open.
      setIsAdding(false);
      setEditingScore(null);
      setSheetOpen(true);
    } catch (e) {
      toast({
        title: "Photo reading failed",
        description: e instanceof Error ? e.message : "Try again or enter the score manually.",
        variant: "destructive",
      });
    } finally {
      setParsingSheet(false);
      if (sheetInputRef.current) sheetInputRef.current.value = "";
    }
  };

  const keptSheetRows = sheetRows.filter(r => r.kept);
  const sheetReviewValid = keptSheetRows.length > 0 && keptSheetRows.length <= 2 && keptSheetRows.every(sheetRowValid);
  const isSheetComp = sheetType === "competition" || sheetType === "trial";
  // In "final from photo" mode the name comes from the existing comp (may be blank on legacy rows).
  const sheetDetailsValid = !!sheetDate && (!isSheetComp || sheetFinalFor != null || sheetCompName.trim() !== "");

  const routineIdOrUndef = (v: string) => (v && v !== "none" ? Number(v) : undefined);

  const saveSheetScore = async () => {
    if (!sheetReviewValid || !sheetDetailsValid || createMutation.isPending || sheetFinishing) return;
    const base = { ...scoreDefaults, date: sheetDate, type: sheetType };
    let values: InsertScore;
    if (keptSheetRows.length === 2) {
      // Two routines on the sheet → one entry: set + vol, or vol 1 + vol 2.
      const [r1, r2] = keptSheetRows;
      const v1 = sheetRowValues(r1);
      const v2 = sheetRowValues(r2);
      values = {
        ...base,
        category: sheetPairCategory,
        routineId: routineIdOrUndef(r1.routineId),
        routineIdVol: routineIdOrUndef(r2.routineId),
        execution: v1.e, difficulty: v1.d, horizontal: v1.h, timeOfFlight: v1.t, total: v1.total,
        executionVol: v2.e, difficultyVol: v2.d, horizontalVol: v2.h, timeOfFlightVol: v2.t, totalVol: v2.total,
      };
    } else {
      const r1 = keptSheetRows[0];
      const v1 = sheetRowValues(r1);
      values = {
        ...base,
        category: sheetCategory,
        routineId: routineIdOrUndef(r1.routineId),
        execution: v1.e, difficulty: v1.d, horizontal: v1.h, timeOfFlight: v1.t, total: v1.total,
      };
    }
    values = isSheetComp
      ? { ...values, competitionName: sheetCompName.trim(), round: sheetRound || "prelims", competitionId: sheetFinalFor?.competitionId ?? newCompetitionId() }
      : { ...values, round: null, competitionId: null, competitionName: "", rank: null };
    setSheetFinishing(true);
    try {
      if (isSheetComp && sheetFinalFor && !sheetFinalFor.competitionId) {
        // Legacy prelims row without a competitionId — backfill it first so the
        // final lands in the same comp group.
        const compId = await ensureCompetitionId(sheetFinalFor);
        if (!compId) return; // toast already shown; dialog stays open for retry
        values = { ...values, competitionId: compId };
      }
      await createMutation.mutateAsync(values);
      // Score saved — if the same photo also carries per-skill deduction rows
      // (competition sheets usually do), offer them as Execution-tracker
      // drafts instead of closing.
      const parsedExec = execParseRef.current ? await execParseRef.current : null;
      const drafts = buildExecDrafts(parsedExec);
      if (drafts.length > 0) {
        setExecDrafts(drafts);
        setSheetStep("executions");
      } else {
        closeSheet();
      }
    } catch {
      // createMutation.onError already showed a toast; keep the dialog open.
    } finally {
      setSheetFinishing(false);
    }
  };

  // ---- "Add the deductions too" step (execution drafts from the same photo) ----

  const buildExecDrafts = (rows: ParsedExecRow[] | null): ExecDraft[] => {
    if (!rows) return [];
    return rows
      .filter(r => r.deductions.length > 0 || r.landing != null)
      .slice(0, 2)
      .map((r, idx) => {
        const cells = emptyTenths();
        r.deductions.forEach((v, i) => { if (i < EXECUTION_SKILL_COUNT) cells[i] = String(v); });
        if (r.landing != null) cells[EXECUTION_SKILL_COUNT] = String(r.landing);
        // Prefill routine + category from what the user picked for the score.
        const scoreRow = keptSheetRows.find(k => k.label === r.label) ?? keptSheetRows[idx];
        const scoreIdx = scoreRow ? keptSheetRows.indexOf(scoreRow) : idx;
        const category: "set" | "vol" =
          keptSheetRows.length === 2
            ? (sheetPairCategory === "vol_vol" ? "vol" : scoreIdx === 0 ? "set" : "vol")
            : sheetCategory;
        return {
          key: idx,
          label: r.label,
          tenths: cells,
          kept: true,
          routineId: scoreRow && scoreRow.routineId && scoreRow.routineId !== "none" ? scoreRow.routineId : "",
          category,
        };
      });
  };

  const keptExecDrafts = execDrafts.filter(d => d.kept);
  const execDraftsValid =
    keptExecDrafts.length > 0 &&
    keptExecDrafts.every(d => {
      const p = parseTenthsRow(d.tenths);
      return p.skills.length >= 1 && !p.trailing && !p.landingInvalid && d.routineId !== "";
    });

  const saveExecDrafts = async () => {
    if (!execDraftsValid || savingExecDrafts) return;
    setSavingExecDrafts(true);
    let saved = 0;
    let queued = 0;
    const doneKeys = new Set<number>();
    try {
      for (const d of keptExecDrafts) {
        const body = tenthsRowToInsert(d.tenths, {
          date: sheetDate,
          routineId: Number(d.routineId),
          skillId: null, // score-sheet drafts are always whole-routine attempts
          category: d.category,
          note: null,
        });
        const result = await tryNetworkOrEnqueue("executionSession", body, async (signal) => {
          const res = await fetch(api.executionSessions.create.path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "include",
            signal,
          });
          if (!res.ok) {
            const text = (await res.text()) || res.statusText;
            throw new Error(`${res.status}: ${text}`);
          }
          return (await res.json()) as ExecutionSession;
        });
        if (isQueuedOfflineResult(result)) queued += 1;
        else saved += 1;
        doneKeys.add(d.key);
      }
      if (saved > 0) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      const n = saved + queued;
      toast({
        title: queued > 0
          ? `${n} execution session${n === 1 ? "" : "s"} saved offline. Will sync when reconnected.`
          : `${n} execution session${n === 1 ? "" : "s"} added to the Execution tracker`,
      });
      closeSheet();
    } catch (e) {
      if (saved > 0) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      // Keep only the rows that didn't make it, so retrying can't duplicate.
      setExecDrafts(prev => prev.filter(d => !doneKeys.has(d.key)));
      toast({
        title: "Failed to save execution session",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingExecDrafts(false);
    }
  };

  const skipDDAutoFill = useRef(false);

  function startEdit(score: Score) {
    skipDDAutoFill.current = true;
    setEditingScore(score);
    setIsAdding(true);
    form.reset({
      date: score.date,
      routineId: score.routineId ?? undefined,
      routineIdVol: score.routineIdVol ?? undefined,
      attempt: score.attempt ?? null,
      attemptVol: score.attemptVol ?? null,
      type: score.type as any,
      category: score.category as any,
      competitionName: score.competitionName ?? "",
      competitionId: score.competitionId ?? null,
      round: score.round ?? null,
      rank: score.rank ?? undefined,
      synchro: score.synchro ?? false,
      execution: score.execution,
      executionTwo: score.executionTwo ?? 0,
      doubleExecution: score.doubleExecution ?? false,
      difficulty: score.difficulty,
      horizontal: score.horizontal,
      horizontalTwo: score.horizontalTwo ?? 0,
      timeOfFlight: score.timeOfFlight,
      total: score.total,
      executionVol: score.executionVol ?? 0,
      executionTwoVol: score.executionTwoVol ?? 0,
      doubleExecutionVol: score.doubleExecutionVol ?? false,
      difficultyVol: score.difficultyVol ?? 0,
      horizontalVol: score.horizontalVol ?? 0,
      horizontalTwoVol: score.horizontalTwoVol ?? 0,
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

  // Returns the competition id, backfilling legacy prelims rows that lack one —
  // it MUST be set before the final is created, otherwise the final saves as
  // its own standalone one-round group.
  async function ensureCompetitionId(prelims: Score): Promise<string | null> {
    if (prelims.competitionId) return prelims.competitionId;
    const compId = newCompetitionId();
    try {
      await apiRequest("PUT", `/api/scores/${prelims.id}`, { competitionId: compId, round: prelims.round || "prelims" });
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      return compId;
    } catch {
      toast({ title: "Couldn't add a final round", description: "Please try again.", variant: "destructive" });
      return null;
    }
  }

  // "Final from photo" on a comp card: run the sheet-photo flow attached to that comp.
  // Must stay synchronous — iOS only opens the file picker inside the tap gesture.
  function startAddFinalPhoto(prelims: Score) {
    pendingFinalForRef.current = prelims;
    sheetInputRef.current?.click();
  }

  async function startAddFinal(prelims: Score) {
    skipDDAutoFill.current = true;
    setEditingScore(null);
    setCustomSkillIds(null);
    setCustomSkillIdsVol(null);
    const compId = await ensureCompetitionId(prelims);
    if (!compId) return;
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
    "horizontalTwo", "horizontalTwoVol", "synchro",
  ]);

  useEffect(() => {
    const [e, d, h, t, rId, cat, e2, d2, h2, t2, rIdVol, eTwo, dblE, eTwoVol, dblEVol, hTwo, hTwoVol, sync] = watchFields;

    const routineChanged = rId !== lastRoutineId;
    if (routineChanged) {
      setLastRoutineId(rId);
      if (rId && routines) {
        const routine = routines.find(r => r.id === Number(rId));
        if (routine) setCustomSkillIds([...routine.skillIds]);
        form.setValue("attempt", null);
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
        form.setValue("attemptVol", null);
      } else {
        setCustomSkillIdsVol(null);
      }
    }

    const eEff = effectiveE(Number(e || 0), Number(eTwo || 0), !!dblE, !!sync);
    const hEff = effectiveH(Number(h || 0), Number(hTwo || 0), !!sync);
    const total = eEff + Number(d || 0) + hEff + Number(t || 0);
    form.setValue("total", Number(total.toFixed(3)));

    if (cat === "both" || cat === "vol_vol") {
      const eEff2 = effectiveE(Number(e2 || 0), Number(eTwoVol || 0), !!dblEVol, !!sync);
      const hEff2 = effectiveH(Number(h2 || 0), Number(hTwoVol || 0), !!sync);
      const total2 = eEff2 + Number(d2 || 0) + hEff2 + Number(t2 || 0);
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
  const compScores = (scores ?? []).filter((s) => s.type === "competition" && !s.synchro);
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

  const synchroOn = !!form.watch("synchro");
  const scoreGridCols = synchroOn ? "md:grid-cols-7" : "md:grid-cols-6";

  const openAddScore = () => {
    setIsAdding(true);
    setEditingScore(null);
    setCustomSkillIds(null);
    setCustomSkillIdsVol(null);
    form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] });
  };

  const totalScoreCount = renderItems.length + queuedScores.length;

  return (
    <PageLayout accent="score">
      <PageHeader
        kicker="Score Board"
        title="Every tenth counts."
        accent="counts."
        subtitle="Track execution, DD, and competition results."
        actions={
          <>
            <input
              ref={sheetInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) openSheetPhoto(f); }}
              data-testid="input-scoresheet-photo"
            />
            <Button
              variant="outline"
              className={headerActionClass}
              onClick={() => navigate("/score/debuts")}
              data-testid="button-comp-debuts"
            >
              <Medal className="w-4 h-4" /> Debuts
            </Button>
            <Button
              onClick={() => { setIsAdding(true); setEditingScore(null); setCustomSkillIds(null); setCustomSkillIdsVol(null); form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] }); }}
              className={primaryActionClass}
              data-testid="button-add-score"
            >
              <Plus className="w-5 h-5" /> Add Score
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 pt-2">
        <div className="mt-0 order-2">

      {hasComps && (
        <div className="-mx-4 sm:-mx-6 border-y border-border/20 py-5 px-4 sm:px-6 mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-400/80">Competition Personal Best</div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
            <div className="min-w-0">
              <div className="font-extrabold tracking-[-0.05em] tabular-nums text-5xl sm:text-6xl leading-none text-gradient-gold" data-testid="text-pb-set">
                {pb.set.score > 0 ? fmtScore(pb.set.score) : "—"}
              </div>
              <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 mt-2">Set Score</div>
              <div className="mt-4 pt-3 border-t border-border/10 grid grid-cols-3 gap-2">
                {[
                  { k: "E", id: "e", v: pb.set.e.toFixed(1) },
                  { k: "HD", id: "h", v: pb.set.h.toFixed(1) },
                  { k: "TOF", id: "tof", v: fmtScore(pb.set.tof) },
                ].map((c) => (
                  <div key={c.k} className="min-w-0">
                    <div className="font-mono text-[15px] font-semibold tabular-nums tracking-tight" data-testid={`text-pb-set-${c.id}`}>{c.v}</div>
                    <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 mt-1">{c.k}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 sm:border-l sm:border-border/20 sm:pl-10">
              <div className="font-extrabold tracking-[-0.05em] tabular-nums text-5xl sm:text-6xl leading-none text-gradient-gold" data-testid="text-pb-vol">
                {pb.vol.score > 0 ? fmtScore(pb.vol.score) : "—"}
              </div>
              <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 mt-2">Vol Score</div>
              <div className="mt-4 pt-3 border-t border-border/10 grid grid-cols-4 gap-2">
                {[
                  { k: "E", id: "e", v: pb.vol.e.toFixed(1) },
                  { k: "DD", id: "dd", v: pb.vol.dd.toFixed(1) },
                  { k: "HD", id: "h", v: pb.vol.h.toFixed(1) },
                  { k: "TOF", id: "tof", v: fmtScore(pb.vol.tof) },
                ].map((c) => (
                  <div key={c.k} className="min-w-0">
                    <div className="font-mono text-[15px] font-semibold tabular-nums tracking-tight" data-testid={`text-pb-vol-${c.id}`}>{c.v}</div>
                    <div className="font-mono text-[8px] sm:text-[10px] uppercase tracking-[0.13em] text-muted-foreground/60 mt-1">{c.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isAdding} onOpenChange={(o) => { if (!o) { setIsAdding(false); setEditingScore(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-[24px] border-white/[0.07]" style={pageAccentStyle("score")}>
          <DialogHero
            icon={Trophy}
            eyebrow="Score board"
            title={editingScore ? "Edit score" : "Add score"}
            description={editingScore ? "Update the details of this score." : "Enter it yourself or read it off a photo."}
            action={!editingScore && (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-2.5 text-xs font-semibold gap-1.5 shrink-0 pressable"
                disabled={parsingSheet}
                onClick={() => { pendingFinalForRef.current = null; sheetInputRef.current?.click(); }}
                data-testid="button-upload-scoresheet"
              >
                {parsingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
                {parsingSheet ? "Reading..." : "From photo"}
              </Button>
            )}
          />
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => {
                const round3 = (n: number | null | undefined) =>
                  n == null || !Number.isFinite(n) ? n : Math.round(n * 1000) / 1000;
                data = { ...data, timeOfFlight: round3(data.timeOfFlight) ?? 0, timeOfFlightVol: round3(data.timeOfFlightVol) ?? 0 };
                if (data.synchro) {
                  data = { ...data, doubleExecution: false, doubleExecutionVol: false };
                }
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
                  <FormField control={form.control} name="synchro" render={({ field }) => (
                    <FormItem>
                      <button
                        type="button"
                        aria-pressed={!!field.value}
                        onClick={() => {
                          const next = !field.value;
                          field.onChange(next);
                          if (next) {
                            form.setValue("doubleExecution", false);
                            form.setValue("doubleExecutionVol", false);
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg h-8 px-3 border text-xs font-medium transition-colors",
                          field.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        data-testid="toggle-synchro"
                      >
                        <Users className="h-3.5 w-3.5" /> Synchro
                      </button>
                    </FormItem>
                  )} />
                </div>

                {(form.watch("type") === "competition" ||
                  (form.watch("type") === "trial" && !!editingScore &&
                    !!(editingScore.competitionName || editingScore.rank != null || editingScore.round))) && (
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
                  <h3 className="font-bold text-sm uppercase tracking-wider text-[hsl(var(--page-accent)/0.7)]">
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
                            {routineOptions(field.value).map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.archived === 1 ? `${r.name} · archived` : r.name}</SelectItem>)}
                            {archivedToggleRow}
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
                    {!form.watch("routineId") && (
                      <FormField control={form.control} name="attempt" render={({ field }) => (
                        <FormItem className="shrink-0">
                          <FormControl>
                            <div className="flex items-center gap-1.5 h-11 rounded-xl border border-primary/20 px-3 text-xs">
                              <Pencil className="h-3 w-3" />
                              <span>Skills</span>
                              <Input type="number" min={0} max={10} step={1} inputMode="numeric" placeholder="10" aria-label="Skills done"
                                value={field.value == null || Number.isNaN(field.value) ? "" : field.value}
                                onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(null); return; } const n = Math.trunc(Number(raw)); if (Number.isFinite(n) && n >= 0) field.onChange(Math.min(n, 10)); }}
                                className="w-12 h-7 border-0 bg-transparent px-0 text-sm font-mono text-center shadow-none focus-visible:ring-0" data-testid="input-attempt" />
                            </div>
                          </FormControl>
                        </FormItem>
                      )} />
                    )}
                  </div>
                  {editingRoutine === "set" && customSkillIds && allSkills && (
                    <div className="absolute inset-0 z-20 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingRoutine(null); }}>
                      <div className="flex flex-col w-full max-w-md max-h-full bg-background rounded-2xl border border-border shadow-black/30 p-4" onClick={(e) => e.stopPropagation()}>
                        <SkillEditorOverlay
                          title="Edit Skills"
                          skillIds={customSkillIds}
                          allSkills={allSkills}
                          onSkillIdsChange={(ids) => { setCustomSkillIds(ids); form.setValue("attempt", ids.length); }}
                          onClose={() => setEditingRoutine(null)}
                          filterSkills={(s) => s.isDrill !== 1}
                          uidPrefix="skill"
                          className="flex-1 min-h-0"
                        />
                      </div>
                    </div>
                  )}
                  <div className={cn("grid grid-cols-3 gap-2 sm:gap-3", scoreGridCols)}>
                    <FormField control={form.control} name="execution" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E1</FormLabel><FormControl><Input type="number" step="0.1" placeholder="E1" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-execution-1" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="executionTwo" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-1">
                          <FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E2</FormLabel>
                          {!synchroOn && (form.watch("type") === "competition" || !!form.watch("doubleExecution")) && <button type="button" aria-pressed={!!form.watch("doubleExecution")} onClick={() => form.setValue("doubleExecution", !form.watch("doubleExecution"))} className={cn("rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none border transition-colors", form.watch("doubleExecution") ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:text-foreground")} data-testid="button-double-execution">E1×2</button>}
                        </div>
                        <FormControl><Input type="number" step="0.1" placeholder="E2" disabled={!synchroOn && !!form.watch("doubleExecution")} value={(!synchroOn && form.watch("doubleExecution")) ? (form.watch("execution") || "") : (field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value)} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono disabled:opacity-60" data-testid="input-execution-2" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="horizontal" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">{synchroOn ? "H1" : "H"}</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-horizontal-1" /></FormControl></FormItem>
                    )} />
                    {synchroOn && (
                      <FormField control={form.control} name="horizontalTwo" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">H2</FormLabel><FormControl><Input type="number" step="0.1" placeholder="H2" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-horizontal-2" /></FormControl></FormItem>
                      )} />
                    )}
                    <FormField control={form.control} name="timeOfFlight" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">{synchroOn ? "Sync" : "T"}</FormLabel><FormControl><Input type="number" step="0.001" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-tof" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="total" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono bg-background font-bold text-primary" /></FormControl></FormItem>
                    )} />
                  </div>
                </div>

                {(form.watch("category") === "both" || form.watch("category") === "vol_vol") && (
                  <div className="space-y-4 pt-4 border-t border-primary/10 relative min-h-[280px]">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-[hsl(var(--page-accent)/0.7)]">
                      {form.watch("category") === "vol_vol" ? "Vol Score 2" : "Vol Score"}
                    </h3>
                    <div className="flex gap-2 items-end">
                      <FormField control={form.control} name="routineIdVol" render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{form.watch("category") === "vol_vol" ? "Routine (Vol 2)" : "Routine (Vol)"}</FormLabel>
                          <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select a routine" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {routineOptions(field.value).map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.archived === 1 ? `${r.name} · archived` : r.name}</SelectItem>)}
                            {archivedToggleRow}
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
                      {!form.watch("routineIdVol") && (
                        <FormField control={form.control} name="attemptVol" render={({ field }) => (
                          <FormItem className="shrink-0">
                            <FormControl>
                              <div className="flex items-center gap-1.5 h-11 rounded-xl border border-primary/20 px-3 text-xs">
                                <Pencil className="h-3 w-3" />
                                <span>Skills</span>
                                <Input type="number" min={0} max={10} step={1} inputMode="numeric" placeholder="10" aria-label="Skills done"
                                  value={field.value == null || Number.isNaN(field.value) ? "" : field.value}
                                  onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(null); return; } const n = Math.trunc(Number(raw)); if (Number.isFinite(n) && n >= 0) field.onChange(Math.min(n, 10)); }}
                                  className="w-12 h-7 border-0 bg-transparent px-0 text-sm font-mono text-center shadow-none focus-visible:ring-0" data-testid="input-attempt-vol" />
                              </div>
                            </FormControl>
                          </FormItem>
                        )} />
                      )}
                    </div>
                    {editingRoutine === "vol" && customSkillIdsVol && allSkills && (
                      <div className="absolute inset-0 z-20 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingRoutine(null); }}>
                        <div className="flex flex-col w-full max-w-md max-h-full bg-background rounded-2xl border border-border shadow-black/30 p-4" onClick={(e) => e.stopPropagation()}>
                          <SkillEditorOverlay
                            title="Edit Skills (Vol)"
                            skillIds={customSkillIdsVol}
                            allSkills={allSkills}
                            onSkillIdsChange={(ids) => { setCustomSkillIdsVol(ids); form.setValue("attemptVol", ids.length); }}
                            onClose={() => setEditingRoutine(null)}
                            filterSkills={(s) => s.isDrill !== 1}
                            uidPrefix="vskill"
                            className="flex-1 min-h-0"
                          />
                        </div>
                      </div>
                    )}
                    <div className={cn("grid grid-cols-3 gap-2 sm:gap-3", scoreGridCols)}>
                      <FormField control={form.control} name="executionVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E1</FormLabel><FormControl><Input type="number" step="0.1" placeholder="E1" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-execution-vol-1" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="executionTwoVol" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-1">
                            <FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">E2</FormLabel>
                            {!synchroOn && (form.watch("type") === "competition" || !!form.watch("doubleExecutionVol")) && <button type="button" aria-pressed={!!form.watch("doubleExecutionVol")} onClick={() => form.setValue("doubleExecutionVol", !form.watch("doubleExecutionVol"))} className={cn("rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none border transition-colors", form.watch("doubleExecutionVol") ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:text-foreground")} data-testid="button-double-execution-vol">E1×2</button>}
                          </div>
                          <FormControl><Input type="number" step="0.1" placeholder="E2" disabled={!synchroOn && !!form.watch("doubleExecutionVol")} value={(!synchroOn && form.watch("doubleExecutionVol")) ? (form.watch("executionVol") || "") : (field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value)} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono disabled:opacity-60" data-testid="input-execution-vol-2" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="difficultyVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="horizontalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">{synchroOn ? "H1" : "H"}</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-horizontal-vol-1" /></FormControl></FormItem>
                      )} />
                      {synchroOn && (
                        <FormField control={form.control} name="horizontalTwoVol" render={({ field }) => (
                          <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">H2</FormLabel><FormControl><Input type="number" step="0.1" placeholder="H2" value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-horizontal-vol-2" /></FormControl></FormItem>
                        )} />
                      )}
                      <FormField control={form.control} name="timeOfFlightVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs h-5 flex items-center">{synchroOn ? "Sync" : "T"}</FormLabel><FormControl><Input type="number" step="0.001" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" data-testid="input-tof-vol" /></FormControl></FormItem>
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

      {/* ---- Scoresheet photo confirmation (review → details) ---- */}
      <Dialog open={sheetOpen} onOpenChange={(o) => { if (!o && !createMutation.isPending && !sheetFinishing && !savingExecDrafts && !parsingSheet) closeSheet(); }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg max-h-[90dvh] overflow-y-auto" style={pageAccentStyle("score")}>
          <DialogHero
            icon={Trophy}
            eyebrow="Score board"
            noPeriod
            title={<>
              {sheetStep === "review" ? "Check the scores" : sheetStep === "details" ? "Score details" : "Add the deductions too?"}
              {(sheetStep === "review" || sheetStep === "details") && (
                <span className="ml-2 text-xs font-mono font-normal text-muted-foreground">{sheetStep === "review" ? "1/2" : "2/2"}</span>
              )}
            </>}
          />
          {sheetStep === "review" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                These are the values read from the scoresheet — fix anything that's wrong before continuing. A blank DD usually means a set routine.
              </p>
              {sheetPhotoUrl && <SheetPhotoPreview src={sheetPhotoUrl} testId="img-sheet-photo" />}
              {sheetRows.map((row) => {
                const v = sheetRowValues(row);
                return (
                  <div key={row.key} className={cn("rounded-xl border border-white/[0.08] p-3", !row.kept && "opacity-60 bg-white/[0.015]")} data-testid={`review-sheet-row-${row.key}`}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{row.label}</Badge>
                      {row.kept ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1" onClick={() => setSheetRows(prev => prev.map(r => r.key === row.key ? { ...r, kept: false } : r))} data-testid={`button-sheet-row-discard-${row.key}`}>
                          <X className="h-3.5 w-3.5" /> Discard row
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setSheetRows(prev => prev.map(r => r.key === row.key ? { ...r, kept: true } : r))} data-testid={`button-sheet-row-restore-${row.key}`}>
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      )}
                    </div>
                    {row.kept && (
                      <>
                        <div className="grid grid-cols-5 gap-1.5">
                          {([
                            ["E", "execution"],
                            ["DD", "difficulty"],
                            ["HD", "horizontal"],
                            ["TOF", "timeOfFlight"],
                            ["Total", "total"],
                          ] as const).map(([label, field]) => (
                            <div key={field} className="space-y-0.5">
                              <div className="text-[9px] font-mono text-muted-foreground text-center">{label}</div>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.001"
                                min="0"
                                placeholder="—"
                                value={row[field]}
                                onChange={(e) => setSheetRows(prev => prev.map(r => r.key === row.key ? { ...r, [field]: e.target.value } : r))}
                                className="h-9 px-1 text-center font-mono text-xs"
                                data-testid={`input-sheet-${field}-${row.key}`}
                              />
                            </div>
                          ))}
                        </div>
                        {!sheetRowValid(row) && (
                          <p className="text-[10px] text-red-500 mt-1">E is required and values can't be negative.</p>
                        )}
                        {v.mismatch && (
                          <p className="text-[10px] text-amber-500 mt-1" data-testid={`text-sheet-mismatch-${row.key}`}>
                            E + DD + HD + TOF = {fmtScore(v.sum)} but the sheet total says {fmtScore(v.total)} — double-check the numbers.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {keptSheetRows.length > 2 && (
                <p className="text-[10px] text-red-500">Keep at most two routines — one score entry holds at most two routines.</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeSheet} data-testid="button-sheet-review-cancel">Cancel</Button>
                <Button className="flex-1" disabled={!sheetReviewValid} onClick={() => setSheetStep("details")} data-testid="button-sheet-review-continue">Continue</Button>
              </div>
            </div>
          ) : sheetStep === "executions" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground" data-testid="text-exec-offer">
                Score saved. The sheet also shows per-skill execution deductions — add them to the Execution tracker for {sheetDate ? format(parseISO(sheetDate), "d MMM yyyy") : "this date"} too? Values are in tenths (2 = 0.2; landing 20 = 2.0; a final 0 is a clean landing).
              </p>
              {sheetPhotoUrl && <SheetPhotoPreview src={sheetPhotoUrl} testId="img-sheet-photo-exec" />}
              {execDrafts.map(d => {
                const p = parseTenthsRow(d.tenths);
                return (
                  <div key={d.key} className={cn("rounded-xl border border-white/[0.08] p-3", !d.kept && "opacity-60 bg-white/[0.015]")} data-testid={`exec-draft-row-${d.key}`}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{d.label}</Badge>
                      {d.kept ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
                          onClick={() => setExecDrafts(prev => prev.map(r => r.key === d.key ? { ...r, kept: false } : r))}
                          data-testid={`button-exec-draft-discard-${d.key}`}
                        >
                          <X className="h-3.5 w-3.5" /> Don't add
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setExecDrafts(prev => prev.map(r => r.key === d.key ? { ...r, kept: true } : r))}
                          data-testid={`button-exec-draft-restore-${d.key}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      )}
                    </div>
                    {d.kept && (
                      <div className="space-y-2">
                        <TenthsGrid
                          cells={d.tenths}
                          onChange={(i, val) => setExecDrafts(prev => prev.map(r => r.key === d.key ? { ...r, tenths: r.tenths.map((t, j) => (j === i ? val : t)) } : r))}
                          testPrefix={`input-exec-draft-${d.key}`}
                        />
                        {(p.trailing || p.landingInvalid || p.skills.length === 0) && (
                          <p className="text-[10px] text-red-500">Values must run from skill 1 without gaps (0-30 tenths).</p>
                        )}
                        <TenthsRowSummary p={p} testId={`text-exec-draft-total-${d.key}`} />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Routine</label>
                            <Select value={d.routineId} onValueChange={val => setExecDrafts(prev => prev.map(r => r.key === d.key ? { ...r, routineId: val } : r))}>
                              <SelectTrigger data-testid={`select-exec-draft-routine-${d.key}`}><SelectValue placeholder="Pick a routine" /></SelectTrigger>
                              <SelectContent>
                                {routineOptions(d.routineId).map(r => (
                                  <SelectItem key={r.id} value={String(r.id)}>{r.archived === 1 ? `${r.name} · archived` : r.name}</SelectItem>
                                ))}
                                {archivedToggleRow}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-36">
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                            <Select value={d.category} onValueChange={val => setExecDrafts(prev => prev.map(r => r.key === d.key ? { ...r, category: val === "set" ? "set" : "vol" } : r))}>
                              <SelectTrigger data-testid={`select-exec-draft-category-${d.key}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="set">Set routine</SelectItem>
                                <SelectItem value="vol">Voluntary</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {keptExecDrafts.some(d => d.routineId === "") && (
                <p className="text-[10px] text-muted-foreground">Each kept row needs a routine from your library.</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeSheet} disabled={savingExecDrafts} data-testid="button-exec-draft-skip">Skip</Button>
                <Button
                  className="flex-1"
                  disabled={!execDraftsValid || savingExecDrafts}
                  onClick={saveExecDrafts}
                  data-testid="button-exec-draft-save"
                >
                  {savingExecDrafts
                    ? "Saving..."
                    : keptExecDrafts.length === 0
                      ? "Nothing to add"
                      : `Add ${keptExecDrafts.length} session${keptExecDrafts.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sheetPhotoUrl && <SheetPhotoPreview src={sheetPhotoUrl} testId="img-sheet-photo-details" />}
              {keptSheetRows.length === 2 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">What are the two routines?</label>
                  <Select value={sheetPairCategory} onValueChange={(val) => setSheetPairCategory(val === "vol_vol" ? "vol_vol" : "both")}>
                    <SelectTrigger data-testid="select-sheet-pair-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Set and Vol</SelectItem>
                      <SelectItem value="vol_vol">Vol and Vol</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-sheet-pair-hint">
                    {sheetPairCategory === "vol_vol"
                      ? `Saved as one entry with two voluntary routines (${keptSheetRows[0].label} = Vol 1, ${keptSheetRows[1].label} = Vol 2) — the best one counts.`
                      : `Saved as one entry: ${keptSheetRows[0].label} as the set routine, ${keptSheetRows[1].label} as the voluntary.`}
                  </p>
                </div>
              )}
              {sheetFinalFor ? (
                <>
                  <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs" data-testid="text-sheet-final-target">
                    Saving as the <span className="font-semibold">final round</span> of{" "}
                    <span className="font-semibold">{sheetFinalFor.competitionName || (sheetFinalFor.type === "trial" ? "this trial" : "this competition")}</span>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                    <Input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} data-testid="input-sheet-date" />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                      <Select value={sheetType} onValueChange={setSheetType}>
                        <SelectTrigger data-testid="select-sheet-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="practice">Practice</SelectItem>
                          <SelectItem value="competition">Competition</SelectItem>
                          <SelectItem value="trial">Trial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                      <Input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} data-testid="input-sheet-date" />
                    </div>
                  </div>
                  {isSheetComp && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Competition name</label>
                        <Input value={sheetCompName} onChange={(e) => setSheetCompName(e.target.value)} placeholder="e.g. Regional Cup" data-testid="input-sheet-comp-name" />
                      </div>
                      <div className="w-32">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Round</label>
                        <Select value={sheetRound} onValueChange={setSheetRound}>
                          <SelectTrigger data-testid="select-sheet-round"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prelims">Prelims</SelectItem>
                            <SelectItem value="final">Final</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </>
              )}
              {keptSheetRows.length === 1 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Set routine or voluntary?</label>
                  <Select value={sheetCategory} onValueChange={(val) => setSheetCategory(val === "set" ? "set" : "vol")}>
                    <SelectTrigger data-testid="select-sheet-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set">Set routine</SelectItem>
                      <SelectItem value="vol">Voluntary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {keptSheetRows.map((row, idx) => (
                <div key={row.key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {keptSheetRows.length === 2
                      ? sheetPairCategory === "vol_vol"
                        ? `Vol ${idx + 1} routine (${row.label})`
                        : idx === 0 ? `Set routine (${row.label})` : `Voluntary routine (${row.label})`
                      : "Routine (optional)"}
                  </label>
                  <Select value={row.routineId} onValueChange={(val) => setSheetRows(prev => prev.map(r => r.key === row.key ? { ...r, routineId: val } : r))}>
                    <SelectTrigger data-testid={`select-sheet-routine-${row.key}`}><SelectValue placeholder="No routine" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No routine</SelectItem>
                      {routineOptions(row.routineId).map(r => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.archived === 1 ? `${r.name} · archived` : r.name}</SelectItem>
                      ))}
                      {archivedToggleRow}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSheetStep("review")} disabled={createMutation.isPending || sheetFinishing} data-testid="button-sheet-back">Back</Button>
                <Button className="flex-1" disabled={!sheetDetailsValid || createMutation.isPending || sheetFinishing} onClick={saveSheetScore} data-testid="button-sheet-save">
                  {createMutation.isPending ? "Saving..." : "Save score"}
                </Button>
              </div>
            </div>
          )}
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
              onAddFinalPhoto={startAddFinalPhoto}
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
              onAddFinalPhoto={startAddFinalPhoto}
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
          <div className="md:col-span-2 py-20 px-6 flex flex-col items-center justify-center text-center rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <div className="w-14 h-14 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-amber-400" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">No scores yet</p>
            <h3 className="text-2xl font-black tracking-tight mb-2">Log your first score.</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-8 leading-relaxed">
              Record practice, trials and competitions — and watch your totals climb.
            </p>
            <button
              onClick={openAddScore}
              className="flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold bg-gradient-cta text-primary-foreground pressable"
              style={{ boxShadow: "0 0 22px hsl(var(--primary)/0.28)" }}
            >
              <Plus className="w-4 h-4" /> Add Score
            </button>
          </div>
        )}
      </div>
        </div>

        <div className="mt-2 space-y-5 order-1">
          {(() => {
            const graphScores = (!offlineModeEnabled || isOnline) ? (scores ?? []) : [];
            const individual = graphScores.filter((s) => !s.synchro);
            const synchroScores = graphScores.filter((s) => s.synchro);
            return (
              <>
                <ScoreGraph scores={individual} />
                {synchroScores.length > 0 && (
                  <ScoreGraph
                    scores={synchroScores}
                    idSuffix="-synchro"
                    eyebrow="Synchro Trend"
                    eyebrowAccent="/ Breakdown"
                    subtitle="Synchro scores — E, HD averaged across both athletes."
                    synchroLabels
                  />
                )}
              </>
            );
          })()}
        </div>
      </div>

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
