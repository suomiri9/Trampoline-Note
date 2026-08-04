import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ArrowLeft, Medal, Repeat, Loader2, X } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { Score, Skill, Routine } from "@shared/schema";

interface DebutRow {
  key: string;
  label: string;
  sub?: string;
  firstTrained: string | null; // ISO date
  firstComp: string | null; // ISO date
  compName?: string | null;
  days: number | null; // first trained -> first comp
}

function fmtD(iso: string | null): string {
  return iso ? format(parseISO(iso), "dd-MM-yyyy") : "—";
}

function minDate(a: string | null | undefined, b: string): string {
  return a == null || b < a ? b : a;
}

const HIDDEN_STORAGE_KEY = "debuts-hidden";

function loadHidden(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHidden(all: Record<string, string[]>) {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — hiding just won't persist
  }
}

function DebutList({ rows, accent, testPrefix }: { rows: DebutRow[]; accent: string; testPrefix: string }) {
  const [hidden, setHidden] = useState<string[]>(() => loadHidden()[testPrefix] ?? []);

  const setAndPersist = (keys: string[]) => {
    setHidden(keys);
    const all = loadHidden();
    all[testPrefix] = keys;
    saveHidden(all);
  };
  const hideRow = (key: string) => setAndPersist([...hidden, key]);
  const restoreAll = () => setAndPersist([]);

  const visible = rows.filter(r => !hidden.includes(r.key));
  const hiddenCount = rows.length - visible.length;
  const debuted = visible.filter(r => r.days != null).sort((a, b) => a.days! - b.days!);
  const pending = visible.filter(r => r.days == null && r.firstTrained != null).sort((a, b) => a.firstTrained!.localeCompare(b.firstTrained!));
  const maxDays = Math.max(1, ...debuted.map(r => r.days!));

  if (debuted.length === 0 && pending.length === 0 && hiddenCount === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nothing to show yet.</p>;
  }

  const removeButton = (key: string) => (
    <button
      type="button"
      onClick={() => hideRow(key)}
      className="shrink-0 -mr-1 p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors"
      aria-label="Remove from debuts"
      data-testid={`button-hide-${testPrefix}-${key}`}
    >
      <X className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-1.5">
      {debuted.map(r => (
        <div key={r.key} className="rounded-lg bg-secondary/30 border border-border/50 px-3 py-2" data-testid={`row-${testPrefix}-${r.key}`}>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="font-bold text-foreground flex-1 truncate">
              {r.label}
              {r.sub && <span className="font-normal text-muted-foreground/70 ml-1.5">{r.sub}</span>}
            </span>
            <Badge variant="outline" className={cn("text-[10px] font-mono px-1.5 py-0 h-4 border-transparent shrink-0", r.days! < 0 ? "bg-muted text-muted-foreground" : accent)}>
              {r.days! < 0 ? "comped before first log" : r.days === 0 ? "same day" : `${r.days} day${r.days === 1 ? "" : "s"}`}
            </Badge>
            {removeButton(r.key)}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-border/40 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${Math.max(2, (Math.max(0, r.days!) / maxDays) * 100)}%` }} />
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
                {r.label}
                {r.sub && <span className="font-normal text-muted-foreground/70 ml-1.5">{r.sub}</span>}
              </span>
              <span className="text-muted-foreground/70 shrink-0">
                training {differenceInCalendarDays(new Date(), parseISO(r.firstTrained!))}d · since {fmtD(r.firstTrained)}
              </span>
              {removeButton(r.key)}
            </div>
          ))}
        </>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={restoreAll}
          className="w-full text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground pt-2 transition-colors"
          data-testid={`button-restore-${testPrefix}`}
        >
          {hiddenCount} removed · restore
        </button>
      )}
    </div>
  );
}

export default function DebutsPage() {
  const [, navigate] = useLocation();
  const { data: notes, isLoading: notesLoading } = useNotes();
  const { data: routines, isLoading: routinesLoading } = useRoutines();
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: scores, isLoading: scoresLoading } = useQuery<Score[]>({ queryKey: [api.scores.list.path] });

  const isLoading = notesLoading || routinesLoading || skillsLoading || scoresLoading;

  const { skillRows, routineRows } = useMemo(() => {
    const skillById = new Map<number, Skill>((allSkills ?? []).map(s => [s.id, s]));
    const routineById = new Map<number, Routine>((routines ?? []).map(r => [r.id, r]));

    // ---- First time each skill / routine appears in a training note ----
    const skillFirstTrained = new Map<number, string>();
    const routineFirstTrained = new Map<number, string>();

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
          if (item.routineId != null) routineFirstTrained.set(item.routineId, minDate(routineFirstTrained.get(item.routineId), date));
          let ids = item.customSkillIds ?? (item.routineId != null ? routineById.get(item.routineId)?.skillIds : undefined) ?? [];
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
    const routineFirstComp = new Map<number, { date: string; compName: string | null }>();

    for (const sc of compScores) {
      for (const rid of [sc.routineId, sc.routineIdVol]) {
        if (rid == null) continue;
        if (!routineFirstComp.has(rid)) routineFirstComp.set(rid, { date: sc.date, compName: sc.competitionName });
        for (const id of routineById.get(rid)?.skillIds ?? []) {
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
    const routineIds = new Set<number>([...Array.from(routineFirstTrained.keys()), ...Array.from(routineFirstComp.keys())]);
    for (const id of Array.from(routineIds)) {
      const r = routineById.get(id);
      if (!r) continue;
      const trained = routineFirstTrained.get(id) ?? null;
      const comp = routineFirstComp.get(id) ?? null;
      routineRows.push({
        key: String(id),
        label: r.name,
        firstTrained: trained,
        firstComp: comp?.date ?? null,
        compName: comp?.compName,
        days: trained && comp ? differenceInCalendarDays(parseISO(comp.date), parseISO(trained)) : null,
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
              <DebutList rows={skillRows} accent="bg-amber-500/15 text-amber-600 dark:text-amber-400" testPrefix="debut-skill" />
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
              <DebutList rows={routineRows} accent="bg-violet-500/15 text-violet-600 dark:text-violet-400" testPrefix="debut-routine" />
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
