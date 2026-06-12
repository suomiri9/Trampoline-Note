import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertScoreSchema, type Score, type Routine, type Skill, type InsertScore } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";
import { OfflinePlaceholder } from "@/components/offline-placeholder";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { useOnline } from "@/hooks/use-online";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useQueuedScores } from "@/hooks/use-queued-scores";
import { deleteQueuedByTempId, isQueuedOfflineResult, tryNetworkOrEnqueue, type OfflineQueuedResult } from "@/lib/offline-queue";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Trash2, Plus, Trophy, CalendarIcon, Pencil, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const scoreDefaults = {
  date: new Date().toISOString().split('T')[0],
  routineId: undefined as number | undefined,
  routineIdVol: undefined as number | undefined,
  attempt: null as number | null,
  attemptVol: null as number | null,
  type: "practice" as const,
  category: "vol" as const,
  competitionName: "",
  rank: undefined as number | undefined,
  execution: 0,
  difficulty: 0,
  horizontal: 0,
  timeOfFlight: 0,
  total: 0,
  executionVol: 0,
  difficultyVol: 0,
  horizontalVol: 0,
  timeOfFlightVol: 0,
  totalVol: 0,
};

function ScoreBreakdown({ e, d, h, t, label }: { e: number; d: number; h: number; t: number; label?: string }) {
  const cols = [
    { k: "E", v: e.toFixed(1) },
    { k: "DD", v: d.toFixed(1) },
    { k: "H", v: h.toFixed(1) },
    { k: "TOF", v: t.toFixed(2) },
  ];
  return (
    <div>
      {label && (
        <div className="eyebrow text-[0.6rem] tracking-[0.2em] mb-2 text-muted-foreground/80">{label}</div>
      )}
      <div className="grid grid-cols-4 gap-2 text-center">
        {cols.map((c) => (
          <div key={c.k}>
            <div className="font-mono text-[14px] font-semibold tabular-nums tracking-tight">{c.v}</div>
            <div className="eyebrow !text-[10px] mt-1 text-muted-foreground/70">{c.k}</div>
          </div>
        ))}
      </div>
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
}: {
  score: Score;
  routines?: Routine[];
  actions?: ReactNode;
  pendingBadge?: ReactNode;
  testId?: string;
  pending?: boolean;
}) {
  const routine = routines?.find((r) => r.id === score.routineId);
  const routineVol = routines?.find((r) => r.id === score.routineIdVol);
  const isComp = score.type === "competition";
  const isMulti = score.category === "both" || score.category === "vol_vol";
  const grandTotal = isMulti ? score.total + (score.totalVol || 0) : score.total;

  const totalColor = isComp ? "text-amber-400" : "text-primary";
  const accentBar = isComp ? "bg-amber-500" : "bg-primary";
  const pillClass = isComp
    ? "border-amber-500/40 text-amber-400"
    : "border-primary/40 text-primary";

  const title = routine?.name ?? (isMulti ? "Set & Vol" : "Score");
  const group1Label = score.category === "vol_vol" ? "VOL 1" : "SET";
  const group2Label = score.category === "vol_vol" ? "VOL 2" : "VOL";

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
            <h3 className="font-bold text-lg mt-1.5 truncate" data-testid={`text-score-name-${score.id}`}>{title}</h3>
            {isComp && (score.competitionName || score.rank != null) && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {score.competitionName}
                {score.rank != null ? ` · #${score.rank}` : ""}
              </p>
            )}
            {isMulti && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="outline" className="rounded-md text-[10px] font-mono">
                  {score.category === "both" ? "Set & Vol" : "Vol & Vol"}
                </Badge>
                {routineVol && (
                  <Badge variant="outline" className="rounded-md text-[10px] font-mono">{routineVol.name}</Badge>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-start gap-1">
            <div className="text-right">
              <div className={cn("font-display font-normal text-4xl sm:text-5xl leading-none", totalColor)} data-testid={`text-score-total-${score.id}`}>
                {grandTotal.toFixed(1)}
              </div>
              <span className={cn("inline-block mt-2 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider", pillClass)}>
                {score.type}
              </span>
            </div>
            {actions}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
          <ScoreBreakdown
            e={score.execution}
            d={score.difficulty}
            h={score.horizontal}
            t={score.timeOfFlight}
            label={isMulti ? `${group1Label}${score.attempt != null ? ` · attempt ${score.attempt}` : ""}` : undefined}
          />
          {isMulti && (
            <ScoreBreakdown
              e={score.executionVol ?? 0}
              d={score.difficultyVol ?? 0}
              h={score.horizontalVol ?? 0}
              t={score.timeOfFlightVol ?? 0}
              label={`${group2Label}${score.attemptVol != null ? ` · attempt ${score.attemptVol}` : ""}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScorePage() {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingScore, setEditingScore] = useState<Score | null>(null);
  const [deleteScoreId, setDeleteScoreId] = useState<number | null>(null);
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
      rank: score.rank ?? undefined,
      execution: score.execution,
      difficulty: score.difficulty,
      horizontal: score.horizontal,
      timeOfFlight: score.timeOfFlight,
      total: score.total,
      executionVol: score.executionVol ?? 0,
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
  ]);

  useEffect(() => {
    const [e, d, h, t, rId, cat, e2, d2, h2, t2, rIdVol] = watchFields;

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

    const total = Number(e || 0) + Number(d || 0) + Number(h || 0) + Number(t || 0);
    form.setValue("total", Number(total.toFixed(2)));

    if (cat === "both" || cat === "vol_vol") {
      const total2 = Number(e2 || 0) + Number(d2 || 0) + Number(h2 || 0) + Number(t2 || 0);
      form.setValue("totalVol", Number(total2.toFixed(2)));
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

  const personalBest = (scores ?? []).reduce((max, s) => {
    const t = (s.category === "both" || s.category === "vol_vol") ? s.total + (s.totalVol || 0) : s.total;
    return t > max ? t : max;
  }, 0);

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

      {personalBest > 0 && (
        <div className="relative card-3d rounded-2xl overflow-hidden mb-6">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" aria-hidden="true" />
          <div className="p-6 pl-7">
            <div className="eyebrow text-amber-400/70">Personal Best</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-display font-normal text-6xl sm:text-7xl text-amber-400 leading-none tracking-tight" data-testid="text-personal-best">
                {personalBest.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">total score</span>
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
                if (editingScore) {
                  updateMutation.mutate({ id: editingScore.id, values: data });
                } else {
                  createMutation.mutate(data);
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
                        <Select onValueChange={field.onChange} value={field.value}>
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

                {form.watch("type") === "competition" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="competitionName" render={({ field }) => (
                      <FormItem><FormLabel>Competition Name</FormLabel><FormControl><Input {...field} placeholder="e.g. State Championships" className="rounded-xl h-11" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="rank" render={({ field }) => (
                      <FormItem><FormLabel>Rank</FormLabel><FormControl><Input type="number" {...field} value={field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(undefined); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} placeholder="e.g. 1" className="rounded-xl h-11 font-mono" /></FormControl></FormItem>
                    )} />
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                    <FormField control={form.control} name="execution" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">E</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="horizontal" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="timeOfFlight" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">T</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="total" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono bg-background font-bold text-primary" /></FormControl></FormItem>
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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                      <FormField control={form.control} name="executionVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">E</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="difficultyVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="horizontalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="timeOfFlightVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">T</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value === 0 || field.value == null || Number.isNaN(field.value) ? "" : field.value} onChange={e => { const raw = e.target.value; if (raw === "") { field.onChange(0); return; } const n = Number(raw); if (Number.isFinite(n)) field.onChange(n); }} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="totalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm font-mono bg-background font-bold text-primary" /></FormControl></FormItem>
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
        {(!offlineModeEnabled || isOnline) && scores?.map((score) => (
          <ScoreCard
            key={score.id}
            score={score}
            routines={routines}
            testId={`card-score-${score.id}`}
            actions={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 text-muted-foreground/50 hover:text-foreground" data-testid={`btn-score-actions-${score.id}`}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32 rounded-xl">
                  <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEdit(score)} data-testid={`btn-score-edit-${score.id}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteScoreId(score.id)} data-testid={`btn-score-delete-${score.id}`}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
        {(!offlineModeEnabled || isOnline) && scores?.length === 0 && queuedScores.length === 0 && (
          <div className="text-center py-20 card-3d rounded-2xl md:col-span-2">
            <Trophy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No scores recorded yet.</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteScoreId !== null}
        onOpenChange={(open) => { if (!open) setDeleteScoreId(null); }}
        title="Delete this score?"
        description="This action cannot be undone."
        onConfirm={() => { if (deleteScoreId !== null) { deleteMutation.mutate(deleteScoreId); setDeleteScoreId(null); } }}
        confirmLabel="Delete"
      />
    </PageLayout>
  );
}
