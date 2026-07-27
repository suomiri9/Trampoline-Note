import { useMemo, useRef, useState } from "react";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Plus, Pencil, Trash2, MoreVertical, ImageUp, Loader2, TrendingDown, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useQueuedExecutionSessions } from "@/hooks/use-queued-execution-sessions";
import { tryNetworkOrEnqueue, isQueuedOfflineResult, deleteQueuedByTempId, type OfflineQueuedResult } from "@/lib/offline-queue";
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
      const res = await apiRequest("PUT", buildUrl(api.executionSessions.update.path, { id }), body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      toast({ title: "Execution session updated" });
      closeForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to update session", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.executionSessions.delete.path, { id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.executionSessions.list.path] });
      toast({ title: "Execution session deleted" });
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
        className={cn("relative card-3d rounded-2xl p-5 pl-6 overflow-hidden", pending && "border-amber-500/40")}
        data-testid={pending ? `card-execution-pending-${s.id}` : `card-execution-session-${s.id}`}
      >
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 rounded-full" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground">{fmtDate(s.date)}</div>
            <h3 className="font-semibold text-base leading-tight truncate">{name}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {s.routineId != null ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0 h-4 border-transparent",
                    s.category === "set"
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                      : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
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
                className="text-3xl font-display font-normal text-rose-400 tracking-tight"
                data-testid={`text-execution-headline-${s.id}`}
              >
                {e != null ? e.toFixed(1) : `−${total.toFixed(1)}`}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">
                {e != null ? "E score" : "Deductions"}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 text-muted-foreground/50 hover:text-foreground" data-testid={`button-actions-execution-${s.id}`}><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 rounded-xl">
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
              <div key={i} className="text-center bg-secondary/40 border border-border/50 rounded-md px-1 py-1" title={sk ? skillDisplayName(sk, allSkills) : undefined}>
                <div className="text-[9px] font-mono text-muted-foreground truncate">{seqLen == null ? `#${i + 1}` : sk ? skillDisplayCode(sk, allSkills) : `#${i + 1}`}</div>
                <div className={cn("text-[11px] font-mono font-bold", deductionClass(v))}>{v.toFixed(1)}</div>
              </div>
            );
          })}
          {s.landingDeduction != null && (
            <div className="text-center bg-secondary/20 border border-dashed border-border/50 rounded-md px-1 py-1" title="Landing deduction (0 = clean landing)" data-testid={`cell-execution-landing-${s.id}`}>
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

  return (
    <PageLayout>
      <PageHeader
        eyebrow="Execution"
        title="Execution Tracker"
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
              className="rounded-xl h-12 px-4 font-semibold gap-2"
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
                    landingOn ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 bg-secondary/30 text-muted-foreground",
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
                  <div key={row.key} className={cn("rounded-xl border border-border/60 p-3", !row.kept && "opacity-60 bg-secondary/20")} data-testid={`review-execution-row-${row.key}`}>
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
                  <div key={row.key} className="rounded-xl border border-border/60 p-3 space-y-2" data-testid={`details-execution-row-${row.key}`}>
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

      {/* ---- Per-skill analysis ---- */}
      {(analysis.ranked.length > 0 || analysis.landingAvg != null) && (
        <div className="card-3d rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-rose-500" /> Skill analysis
            <span className="text-[10px] font-mono font-normal text-muted-foreground">ranked by avg deduction (worst first)</span>
          </h3>
          <div className="space-y-1.5">
            {analysis.ranked.map(a => {
              const sk = skillOf(a.skillId);
              return (
                <div
                  key={a.skillId}
                  className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/30 border border-border/50 px-3 py-2"
                  data-testid={`row-exec-analysis-${a.skillId}`}
                >
                  <span className="font-bold text-foreground w-16 truncate shrink-0">{sk ? skillDisplayCode(sk, allSkills) : "?"}</span>
                  <span className="text-muted-foreground flex-1 truncate">{sk ? skillDisplayName(sk, allSkills) : "Unknown skill"}</span>
                  <span className={cn("shrink-0 w-16 text-right font-bold", deductionClass(a.avg))} title="Average execution deduction on this skill">
                    −{a.avg.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 w-10 text-right" title="Judged attempts this is based on">n={a.samples}</span>
                </div>
              );
            })}
            {analysis.landingAvg != null && (
              <div
                className="flex items-center gap-3 text-xs font-mono rounded-lg bg-secondary/10 border border-dashed border-border/50 px-3 py-2"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {queuedSessions.map(s => renderSessionCard(s, true))}
        {(sessions ?? []).map(s => renderSessionCard(s, false))}
        {!isLoading && (sessions ?? []).length === 0 && queuedSessions.length === 0 && (
          <div className="col-span-full text-center py-20 card-3d rounded-2xl">
            <ClipboardCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No execution sessions yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Photograph a judges' sheet or enter deductions by hand.</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button onClick={() => photoInputRef.current?.click()} variant="outline" className="rounded-xl" disabled={parsingPhoto} data-testid="button-photo-execution-empty">
                <ImageUp className="w-4 h-4 mr-1" /> From photo
              </Button>
              <Button onClick={openNew} variant="outline" className="rounded-xl" data-testid="button-new-execution-empty">
                <Plus className="w-4 h-4 mr-1" /> New Session
              </Button>
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
