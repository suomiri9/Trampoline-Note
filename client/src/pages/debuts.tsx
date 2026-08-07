import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { SafeUser } from "@shared/models/auth";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
import { useNotes } from "@/hooks/use-notes";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { parseNoteSkills, skillDisplayCode } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Medal, Repeat, Loader2, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveHidden, saveHiddenLocal, type HiddenMap } from "@/lib/debuts-hidden";
import { enqueueDebutsHiddenUpdate } from "@/lib/offline-queue";
import { getOfflineModeEnabled } from "@/lib/offline-mode";
import type { Score, Skill, RoutineWithVersions } from "@shared/schema";
import { lineupOnDate, versionBoundaries } from "@shared/routine-versions";

interface DebutRow {
  key: string;
  label: string;
  sub?: string;
  firstTrained: string | null; // ISO date
  firstComp: string | null; // ISO date
  compName?: string | null;
  days: number | null; // first trained -> first comp
  // Color overrides for routine lineup versions — the dot shows the current
  // version's color; barSegments splits the debut bar at each change day so
  // the color only switches from the day the routine changed.
  barClass?: string;
  badgeClass?: string;
  dotClass?: string;
  barSegments?: { frac: number; cls: string }[];
  // Day counts per lineup era within the debut span, e.g. 37 (amber) + 1
  // (blue) = 38 days — shown in the badge when a change falls in the span.
  daySplits?: { days: number; textCls: string }[];
}

// Palette keyed by how many lineup changes a routine has had — the row keeps
// one line and its dot/bar recolors to the current version's color.
// Deliberately distinct from the amber bars / violet badges used elsewhere.
const VERSION_SEGMENT_COLORS = [
  { bar: "bg-sky-500/70", badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400", dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  { bar: "bg-emerald-500/70", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { bar: "bg-fuchsia-500/70", badge: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400", dot: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400" },
];

// Original-lineup color for the pre-change part of the day-count split.
const ORIGINAL_TEXT = "text-amber-600 dark:text-amber-400";

function fmtD(iso: string | null): string {
  return iso ? format(parseISO(iso), "dd-MM-yyyy") : "—";
}

function minDate(a: string | null | undefined, b: string): string {
  return a == null || b < a ? b : a;
}

function DebutList({
  rows,
  accent,
  testPrefix,
  hidden,
  onHiddenChange,
}: {
  rows: DebutRow[];
  accent: string;
  testPrefix: string;
  hidden: string[];
  onHiddenChange: (keys: string[]) => void;
}) {
  const toggleRow = (key: string, on: boolean) =>
    onHiddenChange(on ? hidden.filter(k => k !== key) : [...hidden, key]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = rows.filter(r => !hidden.includes(r.key));
  const hiddenCount = rows.length - visible.length;
  const debuted = visible.filter(r => r.days != null).sort((a, b) => a.days! - b.days!);
  const pending = visible.filter(r => r.days == null && r.firstTrained != null).sort((a, b) => a.firstTrained!.localeCompare(b.firstTrained!));
  const maxDays = Math.max(1, ...debuted.map(r => r.days!));

  const allSorted = [...rows].sort((a, b) => a.label.localeCompare(b.label));

  const picker = (
    <>
      <div className="flex justify-end -mt-1 mb-1">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary transition-colors"
          data-testid={`button-choose-${testPrefix}`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          Choose{hiddenCount > 0 ? ` · ${hiddenCount} off` : ""}
        </button>
      </div>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[420px] w-[calc(100vw-32px)] rounded-2xl max-h-[80dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Show in debuts</DialogTitle>
            <DialogDescription className="text-xs">
              Toggle which ones appear in the list. Choices are saved to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1">
            {allSorted.map(r => {
              const on = !hidden.includes(r.key);
              return (
                <label
                  key={r.key}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-secondary/50 cursor-pointer"
                  data-testid={`toggle-${testPrefix}-${r.key}`}
                >
                  <span className={cn("flex-1 min-w-0 truncate text-xs font-mono font-bold", on ? "text-foreground" : "text-muted-foreground/60")}>
                    {r.dotClass && <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", r.dotClass)} aria-hidden="true" />}
                    {r.label}
                    {r.sub && <span className="font-normal text-muted-foreground/70 ml-1.5">{r.sub}</span>}
                  </span>
                  <Switch checked={on} onCheckedChange={(v) => toggleRow(r.key, v)} />
                </label>
              );
            })}
            {allSorted.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nothing here yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (debuted.length === 0 && pending.length === 0) {
    return (
      <div>
        {picker}
        <p className="text-sm text-muted-foreground py-4 text-center">Nothing to show yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {picker}
      {debuted.map(r => (
        <div key={r.key} className="rounded-lg bg-secondary/30 border border-border/50 px-3 py-2" data-testid={`row-${testPrefix}-${r.key}`}>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="font-bold text-foreground flex-1 truncate">
              {r.dotClass && <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", r.dotClass)} aria-hidden="true" />}
              {r.label}
              {r.sub && <span className="font-normal text-muted-foreground/70 ml-1.5">{r.sub}</span>}
            </span>
            <Badge variant="outline" className={cn("text-[10px] font-mono px-1.5 py-0 h-4 border-transparent shrink-0", r.days! < 0 ? "bg-muted text-muted-foreground" : (r.badgeClass ?? accent))}>
              {r.days! < 0 ? (
                "comped before first log"
              ) : r.days === 0 ? (
                "same day"
              ) : r.daySplits ? (
                <>
                  {r.daySplits.map((p, i) => (
                    <span key={i}>
                      {i > 0 && <span className="opacity-60">+</span>}
                      <span className={p.textCls}>{p.days}</span>
                    </span>
                  ))}
                  <span className="opacity-60">=</span>
                  {r.days} day{r.days === 1 ? "" : "s"}
                </>
              ) : (
                `${r.days} day${r.days === 1 ? "" : "s"}`
              )}
            </Badge>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-border/40 overflow-hidden">
            {r.barSegments ? (
              <div className="h-full rounded-full overflow-hidden flex" style={{ width: `${Math.max(2, (Math.max(0, r.days!) / maxDays) * 100)}%` }}>
                {r.barSegments.map((s, i) => (
                  <div key={i} className={cn("h-full shrink-0", s.cls)} style={{ width: `${s.frac * 100}%` }} />
                ))}
              </div>
            ) : (
              <div className={cn("h-full rounded-full", r.barClass ?? "bg-amber-500/70")} style={{ width: `${Math.max(2, (Math.max(0, r.days!) / maxDays) * 100)}%` }} />
            )}
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-muted-foreground">
            <span>trained {fmtD(r.firstTrained)}</span>
            <span className="truncate ml-2 text-right">
              comp {fmtD(r.firstComp)}
              {r.compName ? ` · ${r.compName}` : ""}
            </span>
          </div>
        </div>
      ))}
      {pending.length > 0 && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 pt-3 pb-1">Not competed yet</div>
          {pending.map(r => (
            <div key={r.key} className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/10 border border-dashed border-border/50 px-3 py-2" data-testid={`row-${testPrefix}-pending-${r.key}`}>
              <span className="font-bold text-foreground/80 flex-1 truncate">
                {r.dotClass && <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", r.dotClass)} aria-hidden="true" />}
                {r.label}
                {r.sub && <span className="font-normal text-muted-foreground/70 ml-1.5">{r.sub}</span>}
              </span>
              <span className="text-muted-foreground/70 shrink-0">
                training {differenceInCalendarDays(new Date(), parseISO(r.firstTrained!))}d · since {fmtD(r.firstTrained)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function DebutsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Hidden keys per section. Server value (user.debutsHidden) is the source
  // of truth; the localStorage fallback is namespaced by user id, so choices
  // never leak between accounts on a shared device. Until the user loads,
  // show everything (empty map) rather than any device-local blob.
  const safeUser = user as SafeUser | null | undefined;
  const userId = safeUser?.id ?? null;
  const serverRaw = safeUser?.debutsHidden;
  const [hiddenAll, setHiddenAll] = useState<HiddenMap>(() =>
    userId ? resolveHidden(userId, serverRaw) : {},
  );
  // Once the user toggles something this session, don't let a late/refetched
  // server value clobber their newer local edits (last write wins).
  const editedRef = useRef(false);
  useEffect(() => {
    if (editedRef.current || !userId) return;
    setHiddenAll(resolveHidden(userId, serverRaw));
  }, [userId, serverRaw]);

  const setSectionHidden = (testPrefix: string, keys: string[]) => {
    editedRef.current = true;
    const next = { ...hiddenAll, [testPrefix]: keys };
    setHiddenAll(next);
    saveHiddenLocal(userId, next);
    const payload = JSON.stringify(next);
    // Fire-and-forget server sync (last write wins). When clearly offline,
    // queue the whole map (collapsing prior queued updates) so it ships
    // automatically once connectivity returns; localStorage remains the
    // on-device fallback either way.
    if (getOfflineModeEnabled() && typeof navigator !== "undefined" && !navigator.onLine) {
      void enqueueDebutsHiddenUpdate(payload);
      return;
    }
    fetch("/api/auth/debuts-hidden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ debutsHidden: payload }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const updated = (await res.json()) as SafeUser;
        queryClient.setQueryData(["/api/auth/user"], updated);
      })
      .catch(() => {
        // Network failure — only queue when offline mode is on (queue
        // draining is gated on offline mode, so queuing otherwise could
        // leave a stale payload that later overwrites newer server state).
        // Otherwise the localStorage fallback already keeps the choice on
        // this device, matching the pre-existing behavior.
        if (getOfflineModeEnabled()) void enqueueDebutsHiddenUpdate(payload);
      });
  };

  const { data: notes, isLoading: notesLoading } = useNotes();
  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: scores, isLoading: scoresLoading } = useQuery<Score[]>({ queryKey: [api.scores.list.path] });

  const isLoading = notesLoading || routinesLoading || skillsLoading || scoresLoading;

  const { skillRows, routineRows } = useMemo(() => {
    const skillById = new Map<number, Skill>((allSkills ?? []).map(s => [s.id, s]));
    const routineById = new Map<number, RoutineWithVersions>((routines ?? []).map(r => [r.id, r]));
    // Lineup in effect on a given day — past entries expand to the skills
    // that were actually in the routine then, not today's lineup.
    const routineLineupOn = (rid: number, date: string): number[] => {
      const r = routineById.get(rid);
      return r ? lineupOnDate(r.skillIds, r.versions, date) : [];
    };

    // ---- First time each skill / routine appears in a training note ----
    const skillFirstTrained = new Map<number, string>();
    // All trained dates per routine (sorted later); the row uses the earliest.
    const routineTrainedDates = new Map<number, string[]>();

    const markSkill = (id: number, date: string) => {
      const sk = skillById.get(id);
      if (!sk) return;
      // Connections in the library expand to their component skills too.
      if (sk.isDrill === 2 || sk.isDrill === 3) {
        for (const cid of sk.skillIds ?? []) {
          if (skillById.has(cid)) skillFirstTrained.set(cid, minDate(skillFirstTrained.get(cid), date));
        }
        return;
      }
      skillFirstTrained.set(id, minDate(skillFirstTrained.get(id), date));
    };

    for (const n of notes ?? []) {
      const date = n.date;
      for (const item of parseNoteSkills(n.skills)) {
        if (item.id === -1) continue;
        if (item.id === -2) {
          if (item.routineId != null) {
            const list = routineTrainedDates.get(item.routineId);
            if (list) list.push(date);
            else routineTrainedDates.set(item.routineId, [date]);
          }
          let ids = item.customSkillIds ?? (item.routineId != null ? routineLineupOn(item.routineId, date) : []);
          // A partial attempt (no custom list) only performed the first `attempt` skills.
          if (item.customSkillIds == null && item.attempt != null) ids = ids.slice(0, item.attempt);
          for (const id of ids) markSkill(id, date);
        } else if (item.id === -3) {
          const fc = item.fcId != null ? skillById.get(item.fcId) : undefined;
          const ids = item.customSkillIds ?? fc?.skillIds ?? [];
          for (const id of ids) markSkill(id, date);
        } else if (item.id > 0) {
          markSkill(item.id, date);
        }
      }
    }

    // ---- First competition appearance ----
    const compScores = (scores ?? [])
      .filter(s => s.type === "competition")
      .sort((a, b) => a.date.localeCompare(b.date));

    const skillFirstComp = new Map<number, { date: string; compName: string | null }>();
    // All comp appearances per routine (compScores already date-ascending);
    // the row uses the earliest.
    const routineCompDates = new Map<number, { date: string; compName: string | null }[]>();

    for (const sc of compScores) {
      for (const rid of [sc.routineId, sc.routineIdVol]) {
        if (rid == null) continue;
        const list = routineCompDates.get(rid);
        if (list) list.push({ date: sc.date, compName: sc.competitionName });
        else routineCompDates.set(rid, [{ date: sc.date, compName: sc.competitionName }]);
        for (const id of routineLineupOn(rid, sc.date)) {
          const sk = skillById.get(id);
          if (!sk) continue;
          const targets = sk.isDrill === 2 || sk.isDrill === 3 ? (sk.skillIds ?? []) : [id];
          for (const t of targets) {
            if (skillById.has(t) && !skillFirstComp.has(t)) skillFirstComp.set(t, { date: sc.date, compName: sc.competitionName });
          }
        }
      }
    }

    // ---- Build rows ----
    const skillRows: DebutRow[] = [];
    const skillIds = new Set<number>([...Array.from(skillFirstTrained.keys()), ...Array.from(skillFirstComp.keys())]);
    for (const id of Array.from(skillIds)) {
      const sk = skillById.get(id);
      if (!sk) continue;
      if (sk.isDrill === 1) continue; // drills aren't competition skills — no debut
      const trained = skillFirstTrained.get(id) ?? null;
      const comp = skillFirstComp.get(id) ?? null;
      skillRows.push({
        key: String(id),
        label: skillDisplayCode(sk, allSkills),
        sub: sk.name || undefined,
        firstTrained: trained,
        firstComp: comp?.date ?? null,
        compName: comp?.compName,
        days: trained && comp ? differenceInCalendarDays(parseISO(comp.date), parseISO(trained)) : null,
      });
    }

    const routineRows: DebutRow[] = [];
    const routineIds = new Set<number>([...Array.from(routineTrainedDates.keys()), ...Array.from(routineCompDates.keys())]);
    for (const id of Array.from(routineIds)) {
      const r = routineById.get(id);
      if (!r) continue;
      const trainedDates = (routineTrainedDates.get(id) ?? []).slice().sort();
      const comps = routineCompDates.get(id) ?? [];
      const bounds = versionBoundaries(r.versions);

      // One row per routine — a lineup change never adds a second row. The
      // dot shows the CURRENT version's color, and the debut bar switches
      // color exactly at each change day (amber before the first change) —
      // user preference: "change the color only from the day the routine
      // changed". Days run first-ever training → first-ever comp; the
      // stable String(id) key keeps hidden prefs valid.
      const trained = trainedDates[0] ?? null;
      const comp = comps[0] ?? null;
      // Palette of the lineup version in effect on a day (null = original/amber).
      const colorAt = (d: string) => {
        const v = bounds.filter(b => b <= d).length;
        return v === 0 ? null : VERSION_SEGMENT_COLORS[(v - 1) % VERSION_SEGMENT_COLORS.length];
      };
      const days =
        trained && comp ? differenceInCalendarDays(parseISO(comp.date), parseISO(trained)) : null;
      let barSegments: { frac: number; cls: string }[] | undefined;
      let daySplits: { days: number; textCls: string }[] | undefined;
      if (trained && comp && days != null && days > 0) {
        const cuts = [trained, ...bounds.filter(b => b > trained && b < comp.date), comp.date];
        if (cuts.length > 2) {
          barSegments = cuts.slice(0, -1).map((from, i) => ({
            frac: differenceInCalendarDays(parseISO(cuts[i + 1]), parseISO(from)) / days,
            cls: colorAt(from)?.bar ?? "bg-amber-500/70",
          }));
          daySplits = cuts.slice(0, -1).map((from, i) => ({
            days: differenceInCalendarDays(parseISO(cuts[i + 1]), parseISO(from)),
            textCls: colorAt(from)?.text ?? ORIGINAL_TEXT,
          }));
        }
      }
      const current =
        bounds.length === 0
          ? null
          : VERSION_SEGMENT_COLORS[(bounds.length - 1) % VERSION_SEGMENT_COLORS.length];
      routineRows.push({
        key: String(id),
        label: r.name,
        firstTrained: trained,
        firstComp: comp?.date ?? null,
        compName: comp?.compName,
        days,
        dotClass: current?.dot,
        barClass: trained ? colorAt(trained)?.bar : undefined,
        badgeClass: comp ? colorAt(comp.date)?.badge : undefined,
        barSegments,
      });
    }

    return { skillRows, routineRows };
  }, [notes, routines, allSkills, scores]);

  return (
    <PageLayout>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => navigate("/score")}
        data-testid="button-back-score"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Score Board
      </Button>

      <PageHeader
        className="static !mt-0"
        eyebrow="Competition readiness"
        title="Comp Debuts"
        accent="Debuts"
        subtitle="How long it took each skill and routine to go from first training to first competition — shorter bar = faster debut."
      />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Medal className="w-4 h-4 text-amber-500" /> Skill debuts
              </CardTitle>
              <p className="text-[10px] font-mono text-muted-foreground">
                First comp = first competition score using a routine that contains the skill.
              </p>
            </CardHeader>
            <CardContent>
              <DebutList
                rows={skillRows}
                accent="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                testPrefix="debut-skill"
                hidden={hiddenAll["debut-skill"] ?? []}
                onHiddenChange={(keys) => setSectionHidden("debut-skill", keys)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Repeat className="w-4 h-4 text-violet-500" /> Routine debuts
              </CardTitle>
              <p className="text-[10px] font-mono text-muted-foreground">
                First comp = first competition score logged with the routine.
              </p>
            </CardHeader>
            <CardContent>
              <DebutList
                rows={routineRows}
                accent="bg-violet-500/15 text-violet-600 dark:text-violet-400"
                testPrefix="debut-routine"
                hidden={hiddenAll["debut-routine"] ?? []}
                onHiddenChange={(keys) => setSectionHidden("debut-routine", keys)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
