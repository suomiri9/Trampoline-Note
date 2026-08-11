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
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Plus, Pencil, Trash2, MoreVertical, ImageUp, Loader2, TrendingDown, RotateCcw, X, Link2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useQueuedExecutionSessions } from "@/hooks/use-queued-execution-sessions";
import { tryNetworkOrEnqueue, tryNetworkOrEnqueueChange, isQueuedOfflineResult, deleteQueuedByTempId, type OfflineQueuedResult } from "@/lib/offline-queue";
import type { ExecutionSession, InsertExecutionSession } from "@shared/schema";
import { fileToDataUrl } from "@/lib/image-file";
import { SheetPhotoPreview } from "@/components/sheet-photo-preview";
import {
  EXECUTION_SKILL_COUNT,
  tenthsToPoints,
  pointsToTenths,
  totalDeductionPoints,
  impliedEScore,
} from "@shared/execution";
import {
  emptyTenths,
  parseTenthsRow,
  tenthsRowToInsert,
  TenthsGrid,
  TenthsRowSummary,
  type ParsedRow,
} from "@/components/execution-tenths";
import { StatStrip } from "@/components/stat-strip";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// Tenths-row helpers (emptyTenths/parseTenthsRow/tenthsRowToInsert) and the
// entry grid live in @/components/execution-tenths, shared with the Score
// page's "add the deductions too" step.

// Deduction severity colouring (points): 0.5+ is a big break, 0.3+ notable.
function deductionClass(points: number): string {
  if (points >= 0.5) return "text-red-500";
  if (points >= 0.3) return "text-amber-500 dark:text-amber-400";
  return "text-foreground";
}

interface PhotoRow {
  key: number;
  label: string;
  tenths: string[];
  kept: boolean;
  /** Encoded target: "r:<routineId>" | "s:<skillId>" | "" while unpicked. */
  target: string;
  category: "set" | "vol";
}

export default function ExecutionPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: routines } = useRoutines();
  const { data: allSkills } = useSkills();

  const { data: sessions, isLoading } = useQuery<ExecutionSession[]>({
    queryKey: [api.executionSessions.list.path],
  });

  const routineById = useMemo(() => new Map((routines ?? []).map(r => [r.id, r])), [routines]);

  // ---- Manual form state ----
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExecutionSession | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [targetValue, setTargetValue] = useState<string>(""); // "r:<routineId>" | "s:<skillId>" | "adhoc"
  const [adhocIds, setAdhocIds] = useState<number[]>([]); // "connect skills" sequence when targetValue === "adhoc"
  const [category, setCategory] = useState<"set" | "vol">("vol");
  const [tenths, setTenths] = useState<string[]>(emptyTenths());
  const [landingOn, setLandingOn] = useState(false); // landing cell hidden & null until toggled on
  const [note, setNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ExecutionSession | null>(null);

  // ---- Photo flow state ----
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoStep, setPhotoStep] = useState<"review" | "details">("review");
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoDate, setPhotoDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [parsingPhoto, setParsingPhoto] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditing(null);
    setDate(new Date().toISOString().substring(0, 10));
    setTargetValue("");
    setAdhocIds([]);
    setCategory("vol");
    setTenths(emptyTenths());
    setLandingOn(false);
    setNote("");
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const startEdit = (s: ExecutionSession) => {
    setEditing(s);
    setDate(s.date);
    setTargetValue(s.routineId != null ? encodeTarget("routine", s.routineId) : s.skillId != null ? encodeTarget("skill", s.skillId) : s.skillIds && s.skillIds.length > 0 ? "adhoc" : "");
    setAdhocIds(s.skillIds ?? []);
    setCategory(s.category === "set" ? "set" : "vol");
    const cells = emptyTenths();
    (s.deductions ?? []).forEach((v, i) => {
      if (i < EXECUTION_SKILL_COUNT) cells[i] = String(pointsToTenths(v));
    });
    if (s.landingDeduction != null) cells[EXECUTION_SKILL_COUNT] = String(pointsToTenths(s.landingDeduction));
    setTenths(cells);
    setLandingOn(s.landingDeduction != null);
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
  // Skill cells this target can take (its sequence length, or up to 10
  // attempts for a single skill/drill). Cells beyond this are hidden and
  // ignored, so switching targets can't leave stale trailing values.
  const formMaxSkills = Math.min(targetSeqLength(selectedTarget) ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
  const formParsed = useMemo(() => parseTenthsRow(tenths, formMaxSkills), [tenths, formMaxSkills]);

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

  const canSave =
    !!selectedTarget && !!date &&
    formParsed.skills.length >= 1 &&
    !formParsed.trailing && !formParsed.landingInvalid;

  // Landing on/off: turning on prefills a clean landing (0), turning off
  // clears the cell so the session saves with no landing recorded.
  const toggleLanding = () => {
    const next = !landingOn;
    setLandingOn(next);
    setTenths(cells => cells.map((v, i) => {
      if (i !== EXECUTION_SKILL_COUNT) return v;
      if (!next) return "";
      return v.trim() === "" ? "0" : v;
    }));
  };

  type CreateResult = OfflineQueuedResult | ExecutionSession;
  const postSession = async (body: InsertExecutionSession) => {
    return await tryNetworkOrEnqueue("executionSession", body, async (signal) => {
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
  };

  const createMutation = useMutation<CreateResult, Error, InsertExecutionSession>({
    mutationFn: postSession,
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) {
        queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      }
      toast({ title: queued ? "Saved offline. Will sync when reconnected." : "Execution session saved" });
      closeForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to save session", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Partial<InsertExecutionSession>) => {
      return await tryNetworkOrEnqueueChange("executionSession", id, "PUT", body, async (signal) => {
        const res = await fetch(buildUrl(api.executionSessions.update.path, { id }), {
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
      if (!queued) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      toast({ title: queued ? "Saved offline. Will sync when reconnected." : "Execution session updated" });
      closeForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update session", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await tryNetworkOrEnqueueChange("executionSession", id, "DELETE", undefined, async (signal) => {
        const res = await fetch(buildUrl(api.executionSessions.delete.path, { id }), { method: "DELETE", credentials: "include", signal });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result);
      if (!queued) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      toast({ title: queued ? "Deleted offline. Will sync when reconnected." : "Execution session deleted" });
    },
  });

  const handleSave = () => {
    if (!canSave) return;
    const adhoc = targetValue === "adhoc";
    const decoded = decodeTarget(adhoc ? "" : targetValue);
    const body = tenthsRowToInsert(tenths, {
      date,
      routineId: decoded.routineId,
      skillId: decoded.skillId,
      skillIds: adhoc ? adhocIds : null,
      // Set/voluntary only applies to full routine attempts.
      category: decoded.routineId != null ? category : "vol",
      note: note.trim() || null,
    }, formMaxSkills);
    if (editing) updateMutation.mutate({ id: editing.id, ...body });
    else createMutation.mutate(body);
  };

  // ---- Photo flow ----
  const closePhoto = () => {
    setPhotoOpen(false);
    setPhotoStep("review");
    setPhotoRows([]);
    setPhotoUrl(null);
    setPhotoDate(new Date().toISOString().substring(0, 10));
  };

  const handlePhoto = async (file: File) => {
    setParsingPhoto(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await apiRequest("POST", "/api/execution-sessions/parse-photo", { images: [dataUrl] });
      const parsed = (await res.json()) as {
        rows: { label: string; deductions: number[]; landing: number | null }[];
        date: string | null;
      };
      if (!parsed.rows || parsed.rows.length === 0) {
        toast({
          title: "No deduction rows found",
          description: "Couldn't read R1/R2 deductions from that photo. Try a closer crop of your rows, or enter them manually.",
          variant: "destructive",
        });
        return;
      }
      const rows: PhotoRow[] = parsed.rows.map((r, idx) => {
        const cells = emptyTenths();
        r.deductions.forEach((v, i) => { if (i < EXECUTION_SKILL_COUNT) cells[i] = String(v); });
        if (r.landing != null) cells[EXECUTION_SKILL_COUNT] = String(r.landing);
        return {
          key: idx,
          label: r.label,
          tenths: cells,
          kept: true,
          target: "",
          // On a two-row sheet R1 is usually the set routine and R2 the
          // voluntary — prefill that; the details step asks to confirm.
          category: parsed.rows.length > 1 && idx === 0 ? "set" : "vol",
        };
      });
      setPhotoRows(rows);
      setPhotoUrl(dataUrl);
      setPhotoDate(parsed.date ?? new Date().toISOString().substring(0, 10));
      setPhotoStep("review");
      setPhotoOpen(true);
    } catch (e) {
      toast({
        title: "Photo reading failed",
        description: e instanceof Error ? e.message : "Try again or enter values manually.",
        variant: "destructive",
      });
    } finally {
      setParsingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const keptRows = photoRows.filter(r => r.kept);
  const reviewValid =
    keptRows.length > 0 &&
    keptRows.every(r => {
      const p = parseTenthsRow(r.tenths);
      return p.skills.length >= 1 && !p.trailing && !p.landingInvalid;
    });
  const detailsValid = keptRows.length > 0 && !!photoDate && keptRows.every(r => {
    if (r.target === "") return false;
    // A sheet row can't carry more deductions than the chosen target has skills.
    const t = resolveTarget(decodeTarget(r.target), routineById, allSkills);
    const cap = Math.min(targetSeqLength(t) ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
    return parseTenthsRow(r.tenths).skills.length <= cap;
  });

  const savePhotoSessions = async () => {
    if (!detailsValid || savingPhoto) return;
    setSavingPhoto(true);
    let saved = 0;
    let queued = 0;
    const doneKeys = new Set<number>();
    try {
      for (const row of keptRows) {
        const decoded = decodeTarget(row.target);
        const rowTarget = resolveTarget(decoded, routineById, allSkills);
        const rowMax = Math.min(targetSeqLength(rowTarget) ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
        const body = tenthsRowToInsert(row.tenths, {
          date: photoDate,
          routineId: decoded.routineId,
          skillId: decoded.skillId,
          category: decoded.routineId != null ? row.category : "vol",
          note: null,
        }, rowMax);
        const result = await postSession(body);
        if (isQueuedOfflineResult(result)) queued += 1;
        else saved += 1;
        doneKeys.add(row.key);
      }
      if (saved > 0) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      const n = saved + queued;
      toast({
        title: queued > 0
          ? `${n} session${n === 1 ? "" : "s"} saved offline. Will sync when reconnected.`
          : `${n} execution session${n === 1 ? "" : "s"} saved`,
      });
      closePhoto();
    } catch (e) {
      if (saved > 0) queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      // Keep only the rows that didn't make it, so retrying can't duplicate.
      setPhotoRows(prev => prev.filter(r => !doneKeys.has(r.key)));
      toast({
        title: "Failed to save session",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPhoto(false);
    }
  };

  // ---- Per-routine analysis across all sessions ----
  const routineAnalysis = useMemo(() => {
    const byRoutine = new Map<number, { count: number; totalSum: number }>();
    for (const s of sessions ?? []) {
      if (s.routineId == null) continue;
      const total = totalDeductionPoints(s.deductions ?? [], s.landingDeduction);
      const acc = byRoutine.get(s.routineId) ?? { count: 0, totalSum: 0 };
      acc.count += 1;
      acc.totalSum += total;
      byRoutine.set(s.routineId, acc);
    }
    return Array.from(byRoutine.entries())
      .map(([routineId, a]) => ({ routineId, sessions: a.count, avgTotal: a.totalSum / a.count }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  // ---- Per-skill analysis across all sessions (worst first) ----
  const analysis = useMemo(() => {
    type Acc = { skillId: number; sum: number; count: number };
    const bySkill = new Map<number, Acc>();
    let landingSum = 0;
    let landingCount = 0;
    for (const s of sessions ?? []) {
      if (s.landingDeduction != null) {
        landingSum += s.landingDeduction;
        landingCount += 1;
      }
      const target = resolveTarget(s, routineById, allSkills);
      if (!target) continue;
      const vals = s.deductions ?? [];
      for (let i = 0; i < vals.length; i++) {
        const skillId = targetSkillIdAt(target, i);
        if (skillId == null) continue;
        let acc = bySkill.get(skillId);
        if (!acc) { acc = { skillId, sum: 0, count: 0 }; bySkill.set(skillId, acc); }
        acc.sum += vals[i];
        acc.count += 1;
      }
    }
    return {
      ranked: Array.from(bySkill.values())
        .map(a => ({ skillId: a.skillId, avg: a.sum / a.count, samples: a.count }))
        .sort((a, b) => b.avg - a.avg),
      landingAvg: landingCount > 0 ? landingSum / landingCount : null,
      landingSamples: landingCount,
    };
  }, [sessions, routineById, allSkills]);

  const skillOf = (id: number) => allSkills?.find(s => s.id === id);

  const queuedSessions = useQueuedExecutionSessions();

  // Display-only aggregates for the header stat band.
  const stripStats = useMemo(() => {
    const list = sessions ?? [];
    if (list.length === 0) return null;
    const totals = list.map(s => totalDeductionPoints(s.deductions ?? [], s.landingDeduction));
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const best = Math.min(...totals);
    return { count: list.length, avg, best, skills: analysis.ranked.length };
  }, [sessions, analysis]);

  const renderSessionCard = (s: ExecutionSession, pending: boolean) => {
    const target = resolveTarget(s, routineById, allSkills);
    const seqLen = targetSeqLength(target);
    const name = targetName(target, allSkills) ?? (s.routineId != null ? "Deleted routine" : "Deleted item");
    const vals = s.deductions ?? [];
    const total = totalDeductionPoints(vals, s.landingDeduction);
    // An implied E score only makes sense for a full routine attempt.
    const e = s.routineId != null ? impliedEScore(vals, s.landingDeduction) : null;
    return (
      <div
        key={pending ? `pending-${s.id}` : s.id}
        className={cn(
          "relative rounded-2xl p-5 pl-6 overflow-hidden border bg-white/[0.025]",
          pending ? "border-amber-500/40" : "border-white/[0.07] cursor-pointer transition-colors hover:bg-white/[0.05]",
        )}
        onClick={pending ? undefined : () => navigate(`/execution/session/${s.id}`)}
        data-testid={pending ? `card-execution-pending-${s.id}` : `card-execution-session-${s.id}`}
      >
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground">{fmtDate(s.date)}</div>
            {s.routineId != null ? (
              <h3
                className="font-semibold text-base leading-tight truncate cursor-pointer hover:text-rose-500 hover:underline underline-offset-2 transition-colors"
                role="button"
                tabIndex={0}
                title="Open this routine's execution graph"
                onClick={e => { e.stopPropagation(); navigate(`/execution/routine/${s.routineId}`); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); navigate(`/execution/routine/${s.routineId}`); } }}
                data-testid={`link-exec-routine-${s.id}`}
              >{name}</h3>
            ) : (
              <h3 className="font-semibold text-base leading-tight truncate">{name}</h3>
            )}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {s.routineId != null ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0 h-4 border-transparent",
                    s.category === "set"
                      ? "bg-primary/15 text-primary"
                      : "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]",
                  )}
                  data-testid={`badge-execution-category-${s.id}`}
                >
                  {s.category === "set" ? "SET" : "VOL"}
                </Badge>
              ) : target?.kind === "skill" || target?.kind === "adhoc" ? (
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono px-1.5 py-0 h-4 border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  data-testid={`badge-execution-kind-${s.id}`}
                >
                  {target.kind === "adhoc" ? "CUSTOM" : skillKindLabel(target.skill).toUpperCase()}
                </Badge>
              ) : null}
              {e != null && (
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-execution-total-${s.id}`}>
                  −{total.toFixed(1)} total
                </Badge>
              )}
              {seqLen != null && vals.length < seqLen && (
                <Badge variant="secondary" className="text-[10px]">{vals.length}/{seqLen} skills</Badge>
              )}
              {seqLen == null && target?.kind === "skill" && (
                <Badge variant="secondary" className="text-[10px]">{vals.length} attempt{vals.length === 1 ? "" : "s"}</Badge>
              )}
              {pending && <PendingSyncBadge size="xs" testId={`badge-pending-execution-${s.id}`} />}
            </div>
          </div>
          <div className="flex items-start gap-1 shrink-0">
            <div className="text-right leading-none">
              <div
                className="text-3xl font-black text-rose-400 tracking-tight tabular-nums"
                data-testid={`text-execution-headline-${s.id}`}
              >
                {e != null ? e.toFixed(1) : `−${total.toFixed(1)}`}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mt-1">
                {e != null ? "E score" : "Deductions"}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 text-muted-foreground/50 hover:text-foreground" onClick={e => e.stopPropagation()} data-testid={`button-actions-execution-${s.id}`}><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              {/* Clicks inside the portaled menu still bubble through the React tree
                  to the card's onClick — stop them here so Edit/Delete don't open the card. */}
              <DropdownMenuContent align="end" className="w-36 rounded-xl" onClick={e => e.stopPropagation()}>
                {pending ? (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={async () => {
                      const ok = await deleteQueuedByTempId(s.id);
                      if (ok) toast({ title: "Pending execution session discarded" });
                    }}
                    data-testid={`button-discard-execution-${s.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Discard
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEdit(s)} data-testid={`button-edit-execution-${s.id}`}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-execution-${s.id}`}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5 mt-4">
          {vals.map((v, i) => {
            const skillId = targetSkillIdAt(target, i);
            const sk = skillId != null ? skillOf(skillId) : undefined;
            return (
              <div key={i} className="text-center bg-white/[0.03] border border-white/[0.07] rounded-md px-1 py-1" title={sk ? skillDisplayName(sk, allSkills) : undefined}>
                <div className="text-[9px] font-mono text-muted-foreground truncate">{seqLen == null ? `#${i + 1}` : sk ? skillDisplayCode(sk, allSkills) : `#${i + 1}`}</div>
                <div className={cn("text-[11px] font-mono font-bold", deductionClass(v))}>{v.toFixed(1)}</div>
              </div>
            );
          })}
          {s.landingDeduction != null && (
            <div className="text-center bg-white/[0.015] border border-dashed border-white/[0.07] rounded-md px-1 py-1" title="Landing deduction (0 = clean landing)" data-testid={`cell-execution-landing-${s.id}`}>
              <div className="text-[9px] font-mono text-muted-foreground truncate">land</div>
              <div className={cn("text-[11px] font-mono font-bold", s.landingDeduction === 0 ? "text-emerald-500" : deductionClass(s.landingDeduction))}>
                {s.landingDeduction.toFixed(1)}
              </div>
            </div>
          )}
        </div>
        {s.note && <p className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap" data-testid={`text-execution-note-${s.id}`}>{s.note}</p>}
      </div>
    );
  };

  // Editable 11-cell tenths grid, shared by the manual form and photo review.
  const renderTenthsGrid = (
    cells: string[],
    onChange: (idx: number, value: string) => void,
    target: TrackerTarget | undefined,
    testPrefix: string,
    showLanding: boolean = true,
  ) => {
    const seqLen = targetSeqLength(target);
    const maxSkills = Math.min(seqLen ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
    const labels = Array.from({ length: EXECUTION_SKILL_COUNT }, (_, i) => {
      if (seqLen == null) return undefined; // single skill/drill: cells are attempts, plain 1..10
      const skillId = targetSkillIdAt(target, i);
      const sk = skillId != null ? skillOf(skillId) : undefined;
      return sk ? `${i + 1} · ${skillDisplayCode(sk, allSkills)}` : undefined;
    });
    const titles = Array.from({ length: EXECUTION_SKILL_COUNT }, (_, i) => {
      const skillId = targetSkillIdAt(target, i);
      const sk = skillId != null ? skillOf(skillId) : undefined;
      return sk ? skillDisplayName(sk, allSkills) : undefined;
    });
    // Attempt mode (single skill/drill): start with one box for the skill and
    // grow as attempts are filled. Sheet-review rows (no target) keep all 10.
    const attemptMode = target?.kind === "skill" && seqLen == null;
    let visibleSkills = maxSkills;
    if (attemptMode) {
      const p = parseTenthsRow(cells, maxSkills);
      const lastFilled = cells.slice(0, maxSkills).reduce((acc, v, i) => ((v ?? "").trim() !== "" ? i : acc), -1);
      visibleSkills = Math.min(maxSkills, Math.max(p.skills.length + 1, lastFilled + 1));
    }
    return <TenthsGrid cells={cells} onChange={onChange} labels={labels} titles={titles} testPrefix={testPrefix} skillCount={visibleSkills} showLanding={showLanding} />;
  };

  const rowSummary = (p: ParsedRow, testId: string, target?: TrackerTarget) => {
    const seqLen = targetSeqLength(target);
    const maxSkills = Math.min(seqLen ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
    const attemptMode = target?.kind === "skill" && seqLen == null;
    return (
      <TenthsRowSummary
        p={p}
        testId={testId}
        skillCount={maxSkills}
        unitLabel={attemptMode ? (p.skills.length === 1 ? "attempt" : "attempts") : "skills"}
        showCap={!attemptMode}
        showE={target == null || target.kind === "routine"}
      />
    );
  };

  const totalSessions = (sessions ?? []).length;
  const allTotals = (sessions ?? []).map(s => totalDeductionPoints(s.deductions ?? [], s.landingDeduction));
  const avgTotal = allTotals.length > 0 ? allTotals.reduce((a, b) => a + b, 0) / allTotals.length : 0;
  const bestTotal = allTotals.length > 0 ? Math.min(...allTotals) : 0;

  const HERO_STATS = [
    { label: "Sessions", value: totalSessions > 0 ? String(totalSessions) : "—" },
    { label: "Avg ded.", value: allTotals.length > 0 ? `−${avgTotal.toFixed(1)}` : "—" },
    { label: "Best", value: allTotals.length > 0 ? `−${bestTotal.toFixed(1)}` : "—" },
    { label: "Skills", value: String(analysis.ranked.length) },
  ];

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Execution"
        kicker="Execution Tracker"
        title="Chase the clean."
        accent="the clean."
        subtitle="Log the judges' per-skill execution deductions — from a sheet photo or by hand — and see which skills cost you the most tenths."
        actions={
          <>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
              data-testid="input-execution-photo"
            />
            <Button
              variant="outline"
              className={headerActionClass}
              disabled={parsingPhoto}
              onClick={() => photoInputRef.current?.click()}
              data-testid="button-upload-execution-photo"
            >
              {parsingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />}
              {parsingPhoto ? "Reading..." : "From photo"}
            </Button>
            <Button onClick={openNew} className={primaryActionClass} data-testid="button-new-execution-session">
              <Plus className="w-5 h-5" /> New Session
            </Button>
          </>
        }
      />

      {stripStats && (
        <StatStrip
          className="mb-6"
          items={[
            { label: "Sessions", value: String(stripStats.count), testId: "stat-exec-sessions" },
            { label: "Avg Deductions", value: `−${stripStats.avg.toFixed(2)}`, testId: "stat-exec-avg" },
            { label: "Cleanest", value: `−${stripStats.best.toFixed(2)}`, testId: "stat-exec-best" },
            { label: "Skills Tracked", value: String(stripStats.skills), testId: "stat-exec-skills" },
          ]}
        />
      )}

      {/* ---- Manual session form dialog ---- */}
      <Dialog open={showForm} onOpenChange={closeForm}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Execution Session" : "New Execution Session"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-exec-date" />
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
                  testId="select-exec-target"
                />
              </div>
            </div>

            {targetValue !== "adhoc" && (
              <button
                type="button"
                onClick={() => setTargetValue("adhoc")}
                className="w-full rounded-xl border border-dashed border-white/[0.09] bg-white/[0.015] px-3 py-2 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
                data-testid="button-exec-connect-skills"
              >
                <Link2 className="h-3.5 w-3.5" /> Connect skills — build a quick sequence instead
              </button>
            )}

            {targetValue === "adhoc" && (
              <AdhocSkillsBuilder skillIds={adhocIds} onChange={setAdhocIds} allSkills={allSkills} testPrefix="exec" />
            )}

            {targetValue !== "adhoc" && (!selectedTarget || selectedTarget.kind === "routine") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Set routine or voluntary?</label>
                <Select value={category} onValueChange={v => setCategory(v === "set" ? "set" : "vol")}>
                  <SelectTrigger data-testid="select-exec-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set" data-testid="option-exec-category-set">Set routine</SelectItem>
                    <SelectItem value="vol" data-testid="option-exec-category-vol">Voluntary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <label className="text-xs font-medium text-muted-foreground">Deductions (tenths, as printed — 2 = 0.2)</label>
                <button
                  type="button"
                  onClick={toggleLanding}
                  aria-pressed={landingOn}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
                    landingOn ? "border-primary/60 bg-primary/15 text-primary" : "border-white/[0.08] bg-white/[0.025] text-muted-foreground",
                  )}
                  data-testid="button-exec-landing-toggle"
                >
                  Landing {landingOn ? "on" : "off"}
                </button>
              </div>
              {renderTenthsGrid(tenths, (i, val) => setTenths(prev => prev.map((p, j) => (j === i ? val : p))), selectedTarget, "input-exec-value", landingOn)}
              {formParsed.trailing && (
                <p className="text-[10px] text-red-500 mt-1" data-testid="text-exec-gap-warning">Fill skills in order without gaps (values 0-30) — an interrupted routine stops at the last skill judged.</p>
              )}
              {formParsed.landingInvalid && (
                <p className="text-[10px] text-red-500 mt-1" data-testid="text-exec-landing-warning">Landing must be 0-30 tenths (0 = clean landing, 20 = 2.0).</p>
              )}
              {rowSummary(formParsed, "text-exec-total", selectedTarget)}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. travelled on 5, short kickout on 8" data-testid="input-exec-note" />
            </div>

            <Button
              className="w-full h-11"
              onClick={handleSave}
              disabled={!canSave || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-execution-session"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editing ? "Update Session" : "Save Session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Photo confirmation dialog (review → details) ---- */}
      <Dialog open={photoOpen} onOpenChange={o => { if (!o && !savingPhoto) closePhoto(); }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {photoStep === "review" ? "Check the deductions" : "Session details"}
              <span className="ml-2 text-xs font-mono font-normal text-muted-foreground">{photoStep === "review" ? "1/2" : "2/2"}</span>
            </DialogTitle>
          </DialogHeader>

          {photoStep === "review" ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Values are in tenths, exactly as printed on the sheet — 2 = 0.2, landing 20 = 2.0, and a final 0 means a clean landing. Fix anything the photo reader got wrong.
              </p>
              {photoUrl && <SheetPhotoPreview src={photoUrl} testId="img-execution-photo" />}
              {photoRows.map(row => {
                const p = parseTenthsRow(row.tenths);
                return (
                  <div key={row.key} className={cn("rounded-xl border border-white/[0.08] p-3", !row.kept && "opacity-60 bg-white/[0.015]")} data-testid={`review-execution-row-${row.key}`}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{row.label}</Badge>
                      {row.kept ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
                          onClick={() => setPhotoRows(prev => prev.map(r => r.key === row.key ? { ...r, kept: false } : r))}
                          data-testid={`button-exec-row-discard-${row.key}`}
                        >
                          <X className="h-3.5 w-3.5" /> Discard row
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setPhotoRows(prev => prev.map(r => r.key === row.key ? { ...r, kept: true } : r))}
                          data-testid={`button-exec-row-restore-${row.key}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      )}
                    </div>
                    {row.kept && (
                      <>
                        {renderTenthsGrid(
                          row.tenths,
                          (i, val) => setPhotoRows(prev => prev.map(r => r.key === row.key ? { ...r, tenths: r.tenths.map((t, j) => (j === i ? val : t)) } : r)),
                          undefined,
                          `input-exec-review-${row.key}`,
                        )}
                        {(p.trailing || p.landingInvalid || p.skills.length === 0) && (
                          <p className="text-[10px] text-red-500 mt-1">Values must run from skill 1 without gaps (0-30 tenths).</p>
                        )}
                        {rowSummary(p, `text-exec-review-total-${row.key}`)}
                      </>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closePhoto} data-testid="button-exec-review-cancel">Cancel</Button>
                <Button
                  className="flex-1"
                  disabled={!reviewValid}
                  onClick={() => setPhotoStep("details")}
                  data-testid="button-exec-review-continue"
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {photoUrl && <SheetPhotoPreview src={photoUrl} testId="img-execution-photo-details" />}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                <Input type="date" value={photoDate} onChange={e => setPhotoDate(e.target.value)} data-testid="input-exec-photo-date" />
              </div>
              {keptRows.map(row => {
                const p = parseTenthsRow(row.tenths);
                const rowTarget = row.target ? resolveTarget(decodeTarget(row.target), routineById, allSkills) : undefined;
                const rowMax = Math.min(targetSeqLength(rowTarget) ?? EXECUTION_SKILL_COUNT, EXECUTION_SKILL_COUNT);
                const tooMany = p.skills.length > rowMax;
                const showRowE = rowTarget == null || rowTarget.kind === "routine";
                return (
                  <div key={row.key} className="rounded-xl border border-white/[0.08] p-3 space-y-2" data-testid={`details-execution-row-${row.key}`}>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <Badge variant="outline" className="font-mono text-[10px]">{row.label}</Badge>
                      <span>
                        <span className="text-muted-foreground">−{p.total.toFixed(1)}{showRowE ? " · E " : ""}</span>
                        {showRowE && (
                          <span className={cn("font-bold", p.e != null ? "text-rose-400" : "text-muted-foreground")}>{p.e != null ? p.e.toFixed(1) : "—"}</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Routine / skill</label>
                      <TrackerTargetSelect
                        value={row.target}
                        onValueChange={v => setPhotoRows(prev => prev.map(r => r.key === row.key ? { ...r, target: v } : r))}
                        routines={routines}
                        allSkills={allSkills}
                        testId={`select-exec-photo-target-${row.key}`}
                      />
                    </div>
                    {tooMany && (
                      <p className="text-[10px] text-red-500" data-testid={`text-exec-photo-too-many-${row.key}`}>
                        This row has {p.skills.length} deductions but the selected target only has {rowMax} skill{rowMax === 1 ? "" : "s"}. Pick a longer target, or go back and clear the extra cells.
                      </p>
                    )}
                    {decodeTarget(row.target).routineId != null && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Set routine or voluntary?</label>
                        <Select
                          value={row.category}
                          onValueChange={v => setPhotoRows(prev => prev.map(r => r.key === row.key ? { ...r, category: v === "set" ? "set" : "vol" } : r))}
                        >
                          <SelectTrigger data-testid={`select-exec-photo-category-${row.key}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="set">Set routine</SelectItem>
                            <SelectItem value="vol">Voluntary</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPhotoStep("review")} disabled={savingPhoto} data-testid="button-exec-photo-back">Back</Button>
                <Button
                  className="flex-1"
                  disabled={!detailsValid || savingPhoto}
                  onClick={savePhotoSessions}
                  data-testid="button-exec-photo-save"
                >
                  {savingPhoto ? "Saving..." : `Save ${keptRows.length} session${keptRows.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Per-routine analysis ---- */}
      {routineAnalysis.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Routine analysis</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">tap for graph</span>
          </div>
          <div className="space-y-1.5">
            {routineAnalysis.map(a => {
              const r = routineById.get(a.routineId);
              return (
                <div
                  key={a.routineId}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/execution/routine/${a.routineId}`)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/execution/routine/${a.routineId}`); } }}
                  className="flex items-center gap-3 text-xs font-mono rounded-lg bg-white/[0.025] border border-white/[0.07] px-3 py-2 cursor-pointer transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`row-exec-routine-analysis-${a.routineId}`}
                >
                  <span className="font-bold text-foreground flex-1 truncate">{r?.name ?? "Unknown routine"}</span>
                  <span className="text-muted-foreground shrink-0" title="Average total deductions per session">avg <span className="text-rose-500 font-bold">−{a.avgTotal.toFixed(1)}</span></span>
                  <span className="text-muted-foreground/60 shrink-0 w-10 text-right" title="Recorded sessions">n={a.sessions}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Per-skill analysis ---- */}
      {(analysis.ranked.length > 0 || analysis.landingAvg != null) && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">Skill analysis</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground/55">worst first</span>
          </div>
          <div className="space-y-1.5">
            {analysis.ranked.map(a => {
              const sk = skillOf(a.skillId);
              return (
                <div
                  key={a.skillId}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/execution/skill/${a.skillId}`)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/execution/skill/${a.skillId}`); } }}
                  className="flex items-center gap-3 text-xs font-mono rounded-lg bg-white/[0.025] border border-white/[0.07] px-3 py-2 cursor-pointer transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`row-exec-analysis-${a.skillId}`}
                >
                  <span className="font-bold text-foreground w-16 truncate shrink-0">{sk ? skillDisplayCode(sk, allSkills) : "?"}</span>
                  <span className="text-muted-foreground flex-1 truncate">{sk ? skillDisplayName(sk, allSkills) : "Unknown skill"}</span>
                  <span className={cn("shrink-0 w-16 text-right font-bold", deductionClass(a.avg))} title="Average execution deduction on this skill">
                    −{a.avg.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 w-10 text-right" title="Judged attempts this is based on">n={a.samples}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                </div>
              );
            })}
            {analysis.landingAvg != null && (
              <div
                className="flex items-center gap-3 text-xs font-mono rounded-lg bg-white/[0.01] border border-dashed border-white/[0.07] px-3 py-2"
                data-testid="row-exec-analysis-landing"
              >
                <span className="font-bold text-foreground w-16 truncate shrink-0">Landing</span>
                <span className="text-muted-foreground flex-1 truncate">Landing deduction</span>
                <span className={cn("shrink-0 w-16 text-right font-bold", deductionClass(analysis.landingAvg))}>
                  −{analysis.landingAvg.toFixed(2)}
                </span>
                <span className="text-muted-foreground/60 shrink-0 w-10 text-right">n={analysis.landingSamples}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Session list ---- */}
      {(queuedSessions.length > 0 || (sessions ?? []).length > 0) && (
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55">Sessions</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">{queuedSessions.length + (sessions ?? []).length} total</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {queuedSessions.map(s => renderSessionCard(s, true))}
        {(sessions ?? []).map(s => renderSessionCard(s, false))}
        {!isLoading && (sessions ?? []).length === 0 && queuedSessions.length === 0 && (
          <div className="col-span-full py-24 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ClipboardCheck className="w-7 h-7 text-primary" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 mb-2">No sessions yet</p>
            <h3 className="text-2xl font-black tracking-tight mb-2">Start counting.</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-8 leading-relaxed">
              Photograph a judges' sheet or enter deductions by hand.
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={parsingPhoto}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-white/[0.07] bg-white/[0.025] text-sm font-medium text-muted-foreground hover:bg-white/[0.06] pressable disabled:opacity-60"
                data-testid="button-photo-execution-empty"
              >
                <ImageUp className="w-4 h-4" /> From photo
              </button>
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold bg-gradient-cta text-primary-foreground pressable"
                data-testid="button-new-execution-empty"
              >
                <Plus className="w-4 h-4" /> New Session
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete this execution session?"
        description="This action cannot be undone."
        onConfirm={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}
        confirmLabel="Delete"
      />
    </PageLayout>
  );
}
