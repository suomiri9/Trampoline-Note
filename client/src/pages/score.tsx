import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertScoreSchema, type Score, type Routine, type Skill } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Trash2, Plus, Trophy, CalendarIcon, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function calcDD(routine: Routine, skills: Skill[], attempt: number | null | undefined) {
  const count = attempt ?? routine.skillIds.length;
  return routine.skillIds.slice(0, count).reduce((acc, sId) => {
    const sk = skills.find(s => s.id === sId);
    return acc + (sk?.difficulty || 0);
  }, 0);
}

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

export default function ScorePage() {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingScore, setEditingScore] = useState<Score | null>(null);

  const { data: scores } = useQuery<Score[]>({ queryKey: ["/api/scores"] });
  const { data: routines } = useQuery<Routine[]>({ queryKey: ["/api/routines"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await apiRequest("POST", "/api/scores", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      setIsAdding(false);
      form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] });
      toast({ title: "Score saved!" });
    }
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
      toast({ title: "Score updated!" });
    }
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

  function startEdit(score: Score) {
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
  }

  const form = useForm({
    resolver: zodResolver(insertScoreSchema),
    defaultValues: scoreDefaults,
  });

  const [lastRoutineId, setLastRoutineId] = useState<number | undefined>();
  const [lastRoutineIdVol, setLastRoutineIdVol] = useState<number | undefined>();
  const [lastAttempt, setLastAttempt] = useState<number | null | undefined>(null);
  const [lastAttemptVol, setLastAttemptVol] = useState<number | null | undefined>(null);

  const watchFields = form.watch([
    "execution", "difficulty", "horizontal", "timeOfFlight",
    "routineId", "category", "attempt",
    "executionVol", "difficultyVol", "horizontalVol", "timeOfFlightVol",
    "routineIdVol", "attemptVol"
  ]);

  useEffect(() => {
    const [e, d, h, t, rId, cat, attempt, e2, d2, h2, t2, rIdVol, attemptVol] = watchFields;

    const routineChanged = rId !== lastRoutineId;
    const attemptChanged = attempt !== lastAttempt;

    if (routineChanged) setLastRoutineId(rId);
    if (attemptChanged) setLastAttempt(attempt);

    if ((routineChanged || attemptChanged) && rId && routines && allSkills) {
      const routine = routines.find(r => r.id === Number(rId));
      if (routine) {
        const calculatedD = (cat === "set" || cat === "both")
          ? 0
          : Number(calcDD(routine, allSkills, attempt).toFixed(1));
        setTimeout(() => form.setValue("difficulty", calculatedD), 0);
      }
    }

    const routineVolChanged = rIdVol !== lastRoutineIdVol;
    const attemptVolChanged = attemptVol !== lastAttemptVol;

    if (routineVolChanged) setLastRoutineIdVol(rIdVol);
    if (attemptVolChanged) setLastAttemptVol(attemptVol);

    if (cat === "both" && (routineVolChanged || attemptVolChanged) && rIdVol && routines && allSkills) {
      const routineV = routines.find(r => r.id === Number(rIdVol));
      if (routineV) {
        const calculatedDVol = Number(calcDD(routineV, allSkills, attemptVol).toFixed(1));
        setTimeout(() => form.setValue("difficultyVol", calculatedDVol), 0);
      }
    }

    const total = Number(e || 0) + Number(d || 0) + Number(h || 0) + Number(t || 0);
    form.setValue("total", Number(total.toFixed(2)));

    if (cat === "both") {
      const total2 = Number(e2 || 0) + Number(d2 || 0) + Number(h2 || 0) + Number(t2 || 0);
      form.setValue("totalVol", Number(total2.toFixed(2)));
    }
  }, [watchFields, routines, allSkills, form, lastRoutineId, lastRoutineIdVol, lastAttempt, lastAttemptVol]);

  const attemptOptions = [
    { value: "full", label: "Full" },
    ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Scoring</h1>
          <p className="text-muted-foreground">Track your routine scores and competition results.</p>
        </div>
        <Button onClick={() => { setIsAdding(v => !v); setEditingScore(null); form.reset({ ...scoreDefaults, date: new Date().toISOString().split('T')[0] }); }} className="rounded-xl">
          {isAdding ? "Cancel" : <><Plus className="w-4 h-4 mr-2" /> New Score</>}
        </Button>
      </div>

      {isAdding && (
        <Card className="mb-8 rounded-2xl border-primary/20 bg-primary/5">
          <CardHeader><CardTitle>{editingScore ? "Edit Score" : "Add New Score"}</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => {
                if (editingScore) {
                  updateMutation.mutate({ id: editingScore.id, values: data });
                } else {
                  createMutation.mutate(data);
                }
              })} className="space-y-6">
                <div className="space-y-4">
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full text-left font-normal rounded-xl h-11", !field.value && "text-muted-foreground")}>
                              {field.value ? format(parseISO(field.value), "PPP") : "Pick a date"}
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
                      <FormItem><FormLabel>Rank</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} placeholder="e.g. 1" className="rounded-xl h-11" /></FormControl></FormItem>
                    )} />
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-primary/60">
                    {form.watch("category") === "both" ? "Set Score" : "Score Details"}
                  </h3>
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                    <FormField control={form.control} name="routineId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Routine</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                          <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select a routine" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {routines?.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="attempt" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Skill</FormLabel>
                        <Select
                          value={field.value == null ? "full" : String(field.value)}
                          onValueChange={(val) => field.onChange(val === "full" ? null : Number(val))}
                        >
                          <FormControl><SelectTrigger className="rounded-xl h-11 w-24"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {attemptOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                    <FormField control={form.control} name="execution" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">E</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="difficulty" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="horizontal" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="timeOfFlight" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">T</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="total" render={({ field }) => (
                      <FormItem><FormLabel className="text-[10px] sm:text-xs">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm bg-background font-bold text-primary" /></FormControl></FormItem>
                    )} />
                  </div>
                </div>

                {form.watch("category") === "both" && (
                  <div className="space-y-4 pt-4 border-t border-primary/10">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-primary/60">Vol Score</h3>
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                      <FormField control={form.control} name="routineIdVol" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Routine (Vol)</FormLabel>
                          <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select a routine" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {routines?.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="attemptVol" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Skill</FormLabel>
                          <Select
                            value={field.value == null ? "full" : String(field.value)}
                            onValueChange={(val) => field.onChange(val === "full" ? null : Number(val))}
                          >
                            <FormControl><SelectTrigger className="rounded-xl h-11 w-24"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {attemptOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                      <FormField control={form.control} name="executionVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">E</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="difficultyVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">D</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="horizontalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">H</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="timeOfFlightVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">T</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value === 0 ? "" : field.value} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="totalVol" render={({ field }) => (
                        <FormItem><FormLabel className="text-[10px] sm:text-xs">Total</FormLabel><FormControl><Input type="number" disabled {...field} className="rounded-xl h-9 sm:h-11 px-2 text-xs sm:text-sm bg-background font-bold text-primary" /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full h-11 rounded-xl" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingScore ? "Save Changes" : "Save Score"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {scores?.map((score) => {
          const routine = routines?.find(r => r.id === score.routineId);
          const routineVol = routines?.find(r => r.id === score.routineIdVol);
          return (
            <Card key={score.id} className="rounded-2xl border-border/50 overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg">{format(new Date(score.date), "MMM d, yyyy")}</span>
                    <Badge variant={score.type === "competition" ? "default" : "outline"} className="rounded-lg capitalize text-[10px]">
                      {score.type}
                    </Badge>
                    <Badge variant="secondary" className="rounded-lg capitalize text-[10px]">
                      {score.category === "both" ? "Set & Vol" : score.category}
                    </Badge>
                    {routine && (
                      <Badge variant="secondary" className="rounded-lg text-[10px]">
                        {routine.name} · {score.attempt != null ? `${score.attempt}/${routine.skillIds.length}` : `${routine.skillIds.length}/${routine.skillIds.length}`} skills
                      </Badge>
                    )}
                    {routineVol && score.category === "both" && (
                      <Badge variant="secondary" className="rounded-lg text-[10px]">
                        Vol: {routineVol.name} · {score.attemptVol != null ? `${score.attemptVol}/${routineVol.skillIds.length}` : `${routineVol.skillIds.length}/${routineVol.skillIds.length}`} skills
                      </Badge>
                    )}
                  </div>
                  {score.type === "competition" && (
                    <div className="text-sm font-medium text-primary flex items-center gap-2">
                      <span>{score.competitionName}</span>
                      {score.rank && <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20">#{score.rank}</Badge>}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="bg-secondary/5 p-2 rounded-lg">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                        {score.category === "both" ? "Set Score" : "Scores"}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono">
                        <span>E: {score.execution.toFixed(1)}</span>
                        <span>D: {score.difficulty.toFixed(1)}</span>
                        <span>H: {score.horizontal.toFixed(1)}</span>
                        <span>T: {score.timeOfFlight.toFixed(2)}</span>
                        <span className="font-bold text-primary">Total: {score.total.toFixed(2)}</span>
                      </div>
                    </div>
                    {score.category === "both" && (
                      <div className="bg-primary/5 p-2 rounded-lg">
                        <p className="text-[10px] font-bold text-primary/60 uppercase mb-1">Vol Score</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono">
                          <span>E: {score.executionVol?.toFixed(1)}</span>
                          <span>D: {score.difficultyVol?.toFixed(1)}</span>
                          <span>H: {score.horizontalVol?.toFixed(1)}</span>
                          <span>T: {score.timeOfFlightVol?.toFixed(2)}</span>
                          <span className="font-bold text-primary">Total: {score.totalVol?.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 sm:pl-4">
                  {score.category === "both" && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider leading-none mb-1">Grand Total</p>
                      <p className="text-2xl font-display font-black text-primary leading-none">
                        {(score.total + (score.totalVol || 0)).toFixed(2)}
                      </p>
                    </div>
                  )}
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => startEdit(score)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive h-9 w-9" onClick={() => deleteMutation.mutate(score.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {scores?.length === 0 && (
          <div className="text-center py-20 bg-secondary/5 rounded-3xl border-2 border-dashed border-border/50">
            <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No scores recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
