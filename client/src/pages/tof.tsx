import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import {
  resolveTarget,
  targetSkillIdAt,
  targetSeqLength,
  targetName,
  skillKindLabel,
  encodeTarget,
  decodeTarget,
  type TrackerTarget,
} from "@/lib/tracker-target";
import { TrackerTargetSelect } from "@/components/tracker-target-select";
import { AdhocSkillsBuilder } from "@/components/adhoc-skills-builder";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Timer, Plus, Pencil, Trash2, MoreVertical, ImageUp, Loader2, TrendingDown, ChevronRight, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useQueuedTofSessions } from "@/hooks/use-queued-tof-sessions";
import { tryNetworkOrEnqueue, tryNetworkOrEnqueueChange, isQueuedOfflineResult, deleteQueuedByTempId, type OfflineQueuedResult } from "@/lib/offline-queue";
import type { TofSession, InsertTofSession } from "@shared/schema";
import { fileToDataUrl } from "@/lib/image-file";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const emptyValues = () => Array.from({ length: 10 }, () => "");

export default function TofPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: routines } = useRoutines();
  const { data: allSkills } = useSkills();

  const { data: sessions, isLoading } = useQuery<TofSession[]>({
    queryKey: [api.tofSessions.list.path],
  });

  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);

  // ---- Form state ----
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TofSession | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [targetValue, setTargetValue] = useState<string>(""); // "r:<routineId>" | "s:<skillId>" | "adhoc"
  const [adhocIds, setAdhocIds] = useState<number[]>([]); // "connect skills" sequence when targetValue === "adhoc"
  const [values, setValues] = useState<string[]>(emptyValues());
  const [preJump, setPreJump] = useState("");
  const [note, setNote] = useState("");
  const [parsing, setParsing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TofSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditing(null);
    setDate(new Date().toISOString().substring(0, 10));
    setTargetValue("");
    setAdhocIds([]);
    setValues(emptyValues());
    setPreJump("");
    setNote("");
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const startEdit = (s: TofSession) => {
    setEditing(s);
    setDate(s.date);
    setTargetValue(s.routineId != null ? encodeTarget("routine", s.routineId) : s.skillId != null ? encodeTarget("skill", s.skillId) : s.skillIds && s.skillIds.length > 0 ? "adhoc" : "");
    setAdhocIds(s.skillIds ?? []);
    const vals = emptyValues();
    (s.tofValues ?? []).forEach((v, i) => { if (i < 10) vals[i] = String(v); });
    setValues(vals);
    setPreJump(s.preJumpTof != null ? String(s.preJumpTof) : "");
    setNote(s.note ?? "");
    setShowForm(true);
  };

  const closeForm = (open: boolean) => {
    if (!open) { setShowForm(false); resetForm(); }
  };

  const selectedTarget = useMemo<TrackerTarget | undefined>(() => {
    if (targetValue === "adhoc") {
      // Needs at least 2 connected skills before it counts as a valid target.
      return adhocIds.length >= 2 ? { kind: "adhoc", skillIds: adhocIds } : undefined;
    }
    return targetValue ? resolveTarget(decodeTarget(targetValue), routineById, allSkills) : undefined;
  }, [targetValue, adhocIds, routineById, allSkills]);
  const selectedSeqLen = targetSeqLength(selectedTarget);
  // How many value cells this target can take (its sequence length, or up to
  // 10 attempts for a single skill/drill). Cells beyond this are hidden and
  // ignored, so switching targets can't leave stale trailing values.
  const maxCells = Math.min(selectedSeqLen ?? 10, 10);
  // Single skill/drill target: every value is another attempt of that skill.
  const attemptMode = selectedTarget?.kind === "skill" && selectedSeqLen == null;

  // Entered values must be contiguous from jump 1 (partial attempts allowed).
  const parsedValues = useMemo(() => {
    const out: number[] = [];
    for (const v of values.slice(0, maxCells)) {
      const t = v.trim();
      if (t === "") break;
      const n = Number(t);
      if (!Number.isFinite(n) || n <= 0) break;
      out.push(n);
    }
    return out;
  }, [values, maxCells]);

  const trailingEntries = useMemo(() => {
    const inRange = values.slice(0, maxCells);
    const firstEmpty = inRange.findIndex(v => v.trim() === "");
    if (firstEmpty === -1) return false;
    return inRange.slice(firstEmpty).some(v => v.trim() !== "");
  }, [values, maxCells]);

  // Attempt mode starts with a single box for the skill and grows one box at
  // a time as attempts are entered (up to 10). Any filled cell stays visible
  // so gap warnings always point at something on screen.
  const visibleCells = useMemo(() => {
    if (!attemptMode) return maxCells;
    const lastFilled = values.slice(0, maxCells).reduce((acc, v, i) => (v.trim() !== "" ? i : acc), -1);
    return Math.min(maxCells, Math.max(parsedValues.length + 1, lastFilled + 1));
  }, [attemptMode, maxCells, values, parsedValues]);

  const totalTof = parsedValues.reduce((a, b) => a + b, 0);

  // Optional in-bounce jump before skill 1 (not part of the routine total).
  const parsedPreJump = useMemo(() => {
    const t = preJump.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [preJump]);

  // Keeps an archived/no-longer-pickable target visible in the picker while editing.
  const editingFallback = useMemo(() => {
    if (!editing) return null;
    if (editing.routineId != null) {
      const r = routineById.get(editing.routineId);
      if (r) return { value: encodeTarget("routine", r.id), label: r.archived === 1 ? `${r.name} (archived)` : r.name };
    } else if (editing.skillId != null) {
      const sk = (allSkills ?? []).find(x => x.id === editing.skillId);
      if (sk) return { value: encodeTarget("skill", sk.id), label: `${skillDisplayName(sk, allSkills)}${sk.archived === 1 ? " (archived)" : ""}` };
    }
    return null;
  }, [editing, routineById, allSkills]);

  const canSave = !!selectedTarget && !!date && parsedValues.length >= 1 && !trailingEntries;

  type CreateTofResult = OfflineQueuedResult | TofSession;
  const createMutation = useMutation<CreateTofResult, Error, InsertTofSession>({
    mutationFn: async (body: InsertTofSession) => {
      return await tryNetworkOrEnqueue("tofSession", body, async (signal) => {
        const res = await fetch(api.tofSessions.create.path, {
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
        return (await res.json()) as TofSession;
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) {
        queryClient.invalidateQueries({ queryKey: [api.tofSessions.list.path] });
      }
      toast({ title: queued ? "Saved offline. Will sync when reconnected." : "ToF session saved" });
      closeForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to save session", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Partial<InsertTofSession>) => {
      return await tryNetworkOrEnqueueChange("tofSession", id, "PUT", body, async (signal) => {
        const res = await fetch(buildUrl(api.tofSessions.update.path, { id }), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
          signal,
        });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        return res.json();
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) queryClient.invalidateQueries({ queryKey: [api.tofSessions.list.path] });
      toast({ title: queued ? "Saved offline. Will sync when reconnected." : "ToF session updated" });
      closeForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update session", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await tryNetworkOrEnqueueChange("tofSession", id, "DELETE", undefined, async (signal) => {
        const res = await fetch(buildUrl(api.tofSessions.delete.path, { id }), { method: "DELETE", credentials: "include", signal });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) queryClient.invalidateQueries({ queryKey: [api.tofSessions.list.path] });
      toast({ title: queued ? "Deleted offline. Will sync when reconnected." : "ToF session deleted" });
    },
  });

  const handleSave = () => {
    if (!canSave) return;
    const adhoc = targetValue === "adhoc";
    const decoded = decodeTarget(adhoc ? "" : targetValue);
    const body = {
      date,
      routineId: decoded.routineId,
      skillId: decoded.skillId,
      skillIds: adhoc ? adhocIds : null,
      tofValues: parsedValues,
      preJumpTof: parsedPreJump,
      note: note.trim() || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...body });
    else createMutation.mutate(body as InsertTofSession);
  };

  const handleScreenshot = async (file: File) => {
    setParsing(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await apiRequest("POST", "/api/tof-sessions/parse-screenshot", { images: [dataUrl] });
      const { tofValues, preJumpTof, date: parsedDate } = await res.json();
      if (!tofValues || tofValues.length === 0) {
        toast({ title: "No ToF values found", description: "Couldn't read per-jump values from that screenshot. Try a clearer crop or enter them manually.", variant: "destructive" });
        return;
      }
      const vals = emptyValues();
      (tofValues as number[]).forEach((v, i) => { if (i < 10) vals[i] = String(v); });
      setValues(vals);
      setPreJump(preJumpTof != null ? String(preJumpTof) : "");
      if (parsedDate) setDate(parsedDate);
      toast({ title: `Read ${tofValues.length} jump${tofValues.length === 1 ? "" : "s"} from screenshot`, description: "Review the values below before saving." });
    } catch (e) {
      toast({ title: "Screenshot reading failed", description: e instanceof Error ? e.message : "Try again or enter values manually.", variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- Per-skill analysis across all sessions ----
  const analysis = useMemo(() => {
    type Acc = { skillId: number; tofSum: number; tofCount: number; dropSum: number; dropCount: number };
    const bySkill = new Map<number, Acc>();
    for (const s of sessions ?? []) {
      const target = resolveTarget(s, routineById, allSkills);
      if (!target) continue;
      const vals = s.tofValues ?? [];
      for (let i = 0; i < vals.length; i++) {
        const skillId = targetSkillIdAt(target, i);
        if (skillId == null) continue;
        let acc = bySkill.get(skillId);
        if (!acc) { acc = { skillId, tofSum: 0, tofCount: 0, dropSum: 0, dropCount: 0 }; bySkill.set(skillId, acc); }
        acc.tofSum += vals[i];
        acc.tofCount += 1;
        // Drop vs the previous jump; for jump 1 the optional pre-jump
        // (in-bounce) value serves as "previous" when recorded.
        const prev = i > 0 ? vals[i - 1] : s.preJumpTof;
        if (prev != null) {
          acc.dropSum += prev - vals[i];
          acc.dropCount += 1;
        }
      }
    }
    return Array.from(bySkill.values())
      .map(a => ({
        skillId: a.skillId,
        avgTof: a.tofSum / a.tofCount,
        samples: a.tofCount,
        avgDrop: a.dropCount > 0 ? a.dropSum / a.dropCount : null,
        dropSamples: a.dropCount,
      }))
      .sort((a, b) => (b.avgDrop ?? -Infinity) - (a.avgDrop ?? -Infinity));
  }, [sessions, routineById, allSkills]);

  const skillOf = (id: number) => allSkills?.find(s => s.id === id);

  // ---- Per-routine analysis across all sessions ----
  const routineAnalysis = useMemo(() => {
    const byRoutine = new Map<number, { count: number; totalSum: number }>();
    for (const s of sessions ?? []) {
      if (s.routineId == null) continue;
      const vals = s.tofValues ?? [];
      if (vals.length === 0) continue;
      const acc = byRoutine.get(s.routineId) ?? { count: 0, totalSum: 0 };
      acc.count += 1;
      acc.totalSum += vals.reduce((a, b) => a + b, 0);
      byRoutine.set(s.routineId, acc);
    }
    return Array.from(byRoutine.entries())
      .map(([routineId, a]) => ({ routineId, sessions: a.count, avgTotal: a.totalSum / a.count }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  const queuedSessions = useQueuedTofSessions();

  // Display-only aggregates for the header stat band.
  const stripStats = useMemo(() => {
    const list = sessions ?? [];
    const totals = list
      .map(s => ({ date: s.date, total: (s.tofValues ?? []).reduce((a, b) => a + b, 0) }))
      .filter(t => t.total > 0);
    if (totals.length === 0) return null;
    const best = Math.max(...totals.map(t => t.total));
    const avg = totals.reduce((a, t) => a + t.total, 0) / totals.length;
    const last = [...totals].sort((a, b) => a.date.localeCompare(b.date))[totals.length - 1].total;
    return { count: list.length, best, avg, last };
  }, [sessions]);

  // ---- Top-line summary stats ----
  const summary = useMemo(() => {
    const list = sessions ?? [];
    const totals = list.map(s => (s.tofValues ?? []).reduce((a, b) => a + b, 0)).filter(t => t > 0);
    const bestTotal = totals.length ? Math.max(...totals) : 0;
    const jumps = list.reduce((acc, s) => acc + (s.tofValues ?? []).length, 0);
    return {
      sessions: list.length,
      bestTotal,
      jumps,
      skills: analysis.length,
    };
  }, [sessions, analysis]);

  const hasSessions = summary.sessions > 0 || queuedSessions.length > 0;


  const renderSessionCard = (s: TofSession, pending: boolean) => {
    const target = resolveTarget(s, routineById, allSkills);
    const seqLen = targetSeqLength(target);
    const name = targetName(target, allSkills) ?? (s.routineId != null ? "Deleted routine" : "Deleted item");
    const vals = s.tofValues ?? [];
    const total = vals.reduce((a, b) => a + b, 0);
    return (
      <div
        key={pending ? `pending-${s.id}` : s.id}
        className={cn(
          "relative rounded-2xl border p-5 pl-6 overflow-hidden transition-colors",
          pending ? "border-amber-500/40 bg-amber-500/[0.04]" : "border-white/[0.07] bg-white/[0.025] cursor-pointer hover:bg-white/[0.045]",
        )}
        onClick={pending ? undefined : () => navigate(`/tof/session/${s.id}`)}
        data-testid={pending ? `card-tof-pending-${s.id}` : `card-tof-session-${s.id}`}
      >
        <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">{fmtDate(s.date)}</div>
            {s.routineId != null ? (
              <h3
                className="font-bold text-base leading-tight truncate cursor-pointer hover:text-amber-400 hover:underline underline-offset-2 transition-colors mt-0.5"
                role="button"
                tabIndex={0}
                title="Open this routine's ToF graph"
                onClick={e => { e.stopPropagation(); navigate(`/tof/routine/${s.routineId}`); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); navigate(`/tof/routine/${s.routineId}`); } }}
                data-testid={`link-tof-routine-${s.id}`}
              >{name}</h3>
            ) : (
              <h3 className="font-bold text-base leading-tight truncate mt-0.5">{name}</h3>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {(target?.kind === "skill" || target?.kind === "adhoc") && (
                <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 h-4 border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400" data-testid={`badge-tof-kind-${s.id}`}>
                  {target.kind === "adhoc" ? "CUSTOM" : skillKindLabel(target.skill).toUpperCase()}
                </Badge>
              )}
              {seqLen != null && vals.length < seqLen && <Badge variant="secondary" className="text-[10px]">{vals.length}/{seqLen} jumps</Badge>}
              {seqLen == null && target?.kind === "skill" && (
                <Badge variant="secondary" className="text-[10px]">{vals.length} attempt{vals.length === 1 ? "" : "s"}</Badge>
              )}
              {pending && <PendingSyncBadge size="xs" testId={`badge-pending-tof-${s.id}`} />}
            </div>
          </div>
          <div className="flex items-start gap-1 shrink-0">
            <div className="text-right leading-none">
              <div
                className="text-3xl font-bold tracking-tight tabular-nums"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                data-testid={`text-tof-session-total-${s.id}`}
              >
                {total.toFixed(2)}
              </div>
              <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60 mt-1">Total s</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 text-muted-foreground/50 hover:text-foreground" onClick={e => e.stopPropagation()} data-testid={`button-actions-tof-${s.id}`}><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              {/* Clicks inside the portaled menu still bubble through the React tree
                  to the card's onClick — stop them here so Edit/Delete don't open the card. */}
              <DropdownMenuContent align="end" className="w-36 rounded-xl" onClick={e => e.stopPropagation()}>
                {pending ? (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={async () => {
                      const ok = await deleteQueuedByTempId(s.id);
                      if (ok) toast({ title: "Pending ToF session discarded" });
                    }}
                    data-testid={`button-discard-tof-${s.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Discard
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEdit(s)} data-testid={`button-edit-tof-${s.id}`}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-tof-${s.id}`}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mt-4">
          {s.preJumpTof != null && (
            <div className="text-center bg-white/[0.015] border border-dashed border-white/[0.09] rounded-lg px-1 py-1" title="In-bounce jump before the first skill" data-testid={`cell-tof-prejump-${s.id}`}>
              <div className="text-[9px] font-mono text-muted-foreground/50 truncate">pre</div>
              <div className="text-[11px] font-mono font-bold text-muted-foreground/70 tabular-nums">{s.preJumpTof.toFixed(2)}</div>
            </div>
          )}
          {vals.map((v, i) => {
            const skillId = targetSkillIdAt(target, i);
            const sk = skillId != null ? skillOf(skillId) : undefined;
            const prev = i > 0 ? vals[i - 1] : s.preJumpTof;
            const drop = prev != null ? prev - v : null;
            return (
              <div key={i} className="text-center bg-white/[0.03] border border-white/[0.07] rounded-lg px-1 py-1" title={sk ? skillDisplayName(sk, allSkills) : undefined}>
                <div className="text-[9px] font-mono text-muted-foreground/50 truncate">{seqLen == null ? `#${i + 1}` : sk ? skillDisplayCode(sk, allSkills) : `#${i + 1}`}</div>
                <div className="text-[11px] font-mono font-bold text-foreground tabular-nums">{v.toFixed(2)}</div>
                {drop != null && (
                  <div className={cn("text-[9px] font-mono tabular-nums", drop > 0 ? "text-red-500" : "text-emerald-500")}>
                    {drop > 0 ? "-" : "+"}{Math.abs(drop).toFixed(2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {s.note && <p className="text-xs text-muted-foreground/70 mt-3 whitespace-pre-wrap leading-relaxed" data-testid={`text-tof-note-${s.id}`}>{s.note}</p>}
      </div>
    );
  };

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Time of Flight"
        kicker="ToF Tracker"
        title="Own the air."
        accent="the air."
        subtitle="Log per-jump time-of-flight from Veriflite screenshots or by hand, and see which skills cost you the most height."
        actions={
          <Button onClick={openNew} className={primaryActionClass} data-testid="button-new-tof-session">
            <Plus className="w-5 h-5" /> New Session
          </Button>
        }
      />

      {stripStats && (
        <StatStrip
          className="mb-6"
          items={[
            { label: "Sessions", value: String(stripStats.count), testId: "stat-tof-sessions" },
            { label: "Best Total", value: `${stripStats.best.toFixed(2)}s`, testId: "stat-tof-best" },
            { label: "Avg Total", value: `${stripStats.avg.toFixed(2)}s`, testId: "stat-tof-avg" },
            { label: "Last", value: `${stripStats.last.toFixed(2)}s`, testId: "stat-tof-last" },
          ]}
        />
      )}

      {/* ---- Session form dialog ---- */}
      <Dialog open={showForm} onOpenChange={closeForm}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit ToF Session" : "New ToF Session"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-tof-date" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Routine / skill</label>
                <TrackerTargetSelect
                  value={targetValue}
                  onValueChange={setTargetValue}
                  routines={routines}
                  allSkills={allSkills}
                  currentFallback={editingFallback}
                  allowAdhoc
                  testId="select-tof-target"
                />
              </div>
            </div>

            {targetValue !== "adhoc" && (
              <button
                type="button"
                onClick={() => setTargetValue("adhoc")}
                className="w-full rounded-xl border border-dashed border-white/[0.09] bg-white/[0.015] px-3 py-2 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
                data-testid="button-tof-connect-skills"
              >
                <Link2 className="h-3.5 w-3.5" /> Connect skills — build a quick sequence instead
              </button>
            )}

            {targetValue === "adhoc" && (
              <AdhocSkillsBuilder skillIds={adhocIds} onChange={setAdhocIds} allSkills={allSkills} testPrefix="tof" />
            )}

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshot(f); }}
                data-testid="input-tof-screenshot"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 rounded-xl"
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-tof-screenshot"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {parsing ? "Reading screenshot..." : "Read from Veriflite screenshot"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">Values are filled in below for you to review — nothing is saved until you press Save.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Per-jump ToF (seconds, jump order)</label>
              <div className="grid grid-cols-5 gap-1.5">
                <div className="space-y-0.5">
                  <div className="text-[9px] font-mono text-muted-foreground text-center truncate" title="Optional: the in-bounce jump right before skill 1, so the first skill gets a drop value too. On a Veriflite screenshot it's jump 1's ToF minus its Difference.">
                    0 · pre
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="—"
                    value={preJump}
                    onChange={e => setPreJump(e.target.value)}
                    className="h-9 px-1 text-center font-mono text-xs border-dashed text-muted-foreground focus:text-foreground"
                    data-testid="input-tof-prejump"
                  />
                </div>
                {values.slice(0, visibleCells).map((v, i) => {
                  const skillId = targetSkillIdAt(selectedTarget, i);
                  const sk = skillId != null ? skillOf(skillId) : undefined;
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="text-[9px] font-mono text-muted-foreground text-center truncate" title={sk ? skillDisplayName(sk, allSkills) : undefined}>
                        {i + 1}{selectedSeqLen == null ? "" : sk ? ` · ${skillDisplayCode(sk, allSkills)}` : ""}
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        value={v}
                        onChange={e => setValues(prev => prev.map((p, j) => (j === i ? e.target.value : p)))}
                        className="h-9 px-1 text-center font-mono text-xs"
                        data-testid={`input-tof-value-${i}`}
                      />
                    </div>
                  );
                })}
              </div>
              {trailingEntries && (
                <p className="text-[10px] text-red-500 mt-1" data-testid="text-tof-gap-warning">Fill jumps in order without gaps — a partial routine stops at the last jump performed.</p>
              )}
              <div className="flex justify-between items-center mt-2 text-xs font-mono">
                <span className="text-muted-foreground">{parsedValues.length} {attemptMode ? "attempt" : "jump"}{parsedValues.length === 1 ? "" : "s"}</span>
                <span className="text-foreground font-bold" data-testid="text-tof-total">Total {totalTof.toFixed(2)}s</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. tight in the middle, opened early on 8" data-testid="input-tof-note" />
            </div>

            <Button
              className="w-full h-11"
              onClick={handleSave}
              disabled={!canSave || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-tof-session"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editing ? "Update Session" : "Save Session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Per-routine analysis ---- */}
      {routineAnalysis.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">Routine analysis</span>
            <span className="font-mono text-[9px] text-muted-foreground/55 ml-auto">tap for the graph</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
            {routineAnalysis.map(a => {
              const r = routineById.get(a.routineId);
              return (
                <div
                  key={a.routineId}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/tof/routine/${a.routineId}`)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/tof/routine/${a.routineId}`); } }}
                  className="flex items-center gap-3 text-xs font-mono bg-white/[0.015] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`row-tof-routine-analysis-${a.routineId}`}
                >
                  <span className="font-bold text-foreground flex-1 truncate">{r?.name ?? "Unknown routine"}</span>
                  <span className="text-muted-foreground/70 shrink-0 tabular-nums" title="Average total ToF per session">avg <span className="text-foreground font-bold">{a.avgTotal.toFixed(2)}s</span></span>
                  <span className="text-muted-foreground/60 shrink-0 w-10 text-right tabular-nums" title="Recorded sessions">n={a.sessions}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Per-skill analysis ---- */}
      {analysis.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">Skill analysis</span>
            <span className="font-mono text-[9px] text-muted-foreground/55 ml-auto">ranked by avg drop</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
            {analysis.map(a => {
              const sk = skillOf(a.skillId);
              return (
                <div
                  key={a.skillId}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/tof/skill/${a.skillId}`)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/tof/skill/${a.skillId}`); } }}
                  className="flex items-center gap-3 text-xs font-mono bg-white/[0.015] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`row-tof-analysis-${a.skillId}`}
                >
                  <span className="font-bold text-foreground w-16 truncate shrink-0">{sk ? skillDisplayCode(sk, allSkills) : "?"}</span>
                  <span className="text-muted-foreground/70 flex-1 truncate">{sk ? skillDisplayName(sk, allSkills) : "Unknown skill"}</span>
                  <span className="text-muted-foreground/70 shrink-0 tabular-nums" title="Average ToF on this skill">avg <span className="text-foreground font-bold">{a.avgTof.toFixed(2)}s</span></span>
                  <span
                    className={cn("shrink-0 w-24 text-right tabular-nums", a.avgDrop != null && a.avgDrop > 0 ? "text-red-500" : "text-emerald-500")}
                    title="Average change vs the previous jump (positive = losing height)"
                  >
                    {a.avgDrop == null ? "—" : `${a.avgDrop > 0 ? "-" : "+"}${Math.abs(a.avgDrop).toFixed(3)}s`}
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 w-10 text-right tabular-nums" title="Recorded jumps this is based on">n={a.samples}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Session list ---- */}
      {hasSessions && (
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55">Sessions</span>
          <span className="font-mono text-[9px] text-muted-foreground/60 tabular-nums">{summary.sessions + queuedSessions.length} total</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {queuedSessions.map(s => renderSessionCard(s, true))}
        {(sessions ?? []).map(s => renderSessionCard(s, false))}
        {isLoading && (sessions ?? []).length === 0 && queuedSessions.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-amber-400/60" />
            <p className="font-mono text-xs uppercase tracking-widest">Loading sessions...</p>
          </div>
        )}
        {!isLoading && (sessions ?? []).length === 0 && queuedSessions.length === 0 && (
          <div className="col-span-full py-24 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Timer className="w-7 h-7 text-amber-400" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">No sessions yet</p>
            <h3 className="text-2xl font-black tracking-tight mb-2">Log your first flight.</h3>
            <p className="text-sm text-muted-foreground/60 max-w-xs mb-8 leading-relaxed">
              Read a Veriflite screenshot or enter values by hand — then watch your height trend.
            </p>
            <Button
              onClick={openNew}
              className="bg-gradient-cta flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold text-primary-foreground"
              data-testid="button-new-tof-empty"
            >
              <Plus className="w-4 h-4" />
              New Session
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete this ToF session?`}
        description="This action cannot be undone."
        onConfirm={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}
        confirmLabel="Delete"
      />
    </PageLayout>
  );
}
