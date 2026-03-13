import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, GripVertical, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Note, type Skill } from "@shared/schema";
import { useCreateNote, useUpdateNote } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./star-rating";

const formSchema = z.object({
  date: z.date({
    required_error: "A date is required.",
  }),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  content: z.string().optional().default(""),
  skills: z.string().optional().nullable(), // Store as comma-separated IDs
  rating: z.number().min(1).max(5).optional().nullable(),
  sleepScore: z.number().min(0).max(100).optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteToEdit?: Note | null;
}

type SkillItem = { id: number; reps?: number; routineId?: number; routineName?: string; attempt?: number; customSkillIds?: number[] };

function SortablePracticeGroup({ gId, isConnected, children }: { gId: string; isConnected: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: gId });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn("flex items-stretch border-b border-border/30 last:border-0", isConnected ? "border-l-[3px] border-l-red-400 bg-red-50/60 dark:bg-red-900/10" : "border-l-[3px] border-transparent")}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing flex items-center justify-center w-5 shrink-0 text-muted-foreground/30 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SortableRoutineSkill({ uid, code, name, onRemove }: { uid: string; code?: string; name?: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1 py-0.5 touch-none"
    >
      <button type="button" className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Badge variant="outline" className="font-mono text-[10px] border-primary/30 text-primary shrink-0">{code}</Badge>
        <span className="text-xs truncate">{name}</span>
      </div>
      <button type="button" onClick={onRemove} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function NoteDialog({ open, onOpenChange, noteToEdit }: NoteDialogProps) {
  const { toast } = useToast();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [isConnectMode, setIsConnectMode] = useState(false);
  const [editingRoutineIdx, setEditingRoutineIdx] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const buildGroups = (skills: SkillItem[]) => {
    const groups: Array<{ items: SkillItem[] }> = [];
    let cur: SkillItem[] = [];
    skills.forEach(item => {
      if (item.id === -1) { groups.push({ items: cur }); cur = []; }
      else cur.push(item);
    });
    groups.push({ items: cur });
    return groups.filter(g => g.items.length > 0);
  };

  const handlePracticeListDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const groups = buildGroups(selectedSkills);
    const oldIdx = groups.findIndex((_, i) => `group-${i}` === active.id);
    const newIdx = groups.findIndex((_, i) => `group-${i}` === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(groups, oldIdx, newIdx);
    const newSkills: SkillItem[] = [];
    reordered.forEach((g, i) => { if (i > 0) newSkills.push({ id: -1 }); newSkills.push(...g.items); });
    setSelectedSkills(newSkills);
    form.setValue('skills', JSON.stringify(newSkills));
  };

  const isEditing = !!noteToEdit;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      endTime: "",
      content: "",
      skills: "",
      rating: null,
      sleepScore: null,
    },
  });

  useEffect(() => {
    if (open) {
      if (noteToEdit) {
        let skills: SkillItem[] = [];
        try {
          skills = noteToEdit.skills ? JSON.parse(noteToEdit.skills) : [];
          if (!Array.isArray(skills)) {
            // Migration for old comma-separated string
            skills = noteToEdit.skills.split(',').map(s => ({ id: parseInt(s) }));
          }
        } catch (e) {
          skills = noteToEdit.skills ? noteToEdit.skills.split(',').map(s => ({ id: parseInt(s) })) : [];
        }
        setSelectedSkills(skills);
        form.reset({
          date: new Date(noteToEdit.date),
          startTime: noteToEdit.startTime || "",
          endTime: noteToEdit.endTime || "",
          content: noteToEdit.content,
          skills: noteToEdit.skills || "",
          rating: noteToEdit.rating || null,
          sleepScore: noteToEdit.sleepScore || null,
        });
      } else {
        setSelectedSkills([]);
        setIsConnectMode(false);
        form.reset({
          date: new Date(),
          startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          endTime: "",
          content: "",
          skills: "",
          rating: null,
          sleepScore: null,
        });
      }
    }
  }, [open, noteToEdit, form]);

  const addSkill = (idStr: string) => {
    const id = parseInt(idStr);
    setSelectedSkills(prev => {
      let newSkills = [...prev];
      if (isConnectMode && newSkills.length > 0) {
        if (newSkills[newSkills.length - 1].id === -1) {
          newSkills.pop();
        }
        const lastSkill = [...newSkills].reverse().find(s => s.id !== -1);
        const reps = lastSkill?.reps || 1;
        newSkills.push({ id, reps });
      } else {
        if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
          newSkills.push({ id: -1 });
        }
        newSkills.push({ id, reps: 1 });
      }
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  const addRoutine = (idStr: string) => {
    const routineId = parseInt(idStr);
    const routine = routines?.find(r => r.id === routineId);
    if (!routine) return;

    setSelectedSkills(prev => {
      let newSkills = [...prev];
      if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
        newSkills.push({ id: -1 });
      }
      newSkills.push({ id: -2, routineId, routineName: routine.name });
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  const removeSkill = (index: number) => {
    setSelectedSkills(prev => {
      const newSkills = [...prev];
      newSkills.splice(index, 1);
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  const updateReps = (indices: number[], reps: number) => {
    const val = Math.max(1, reps);
    setSelectedSkills(prev => {
      const newSkills = prev.map((item, idx) => {
        if (indices.includes(idx) && item.id !== -1) {
          return { ...item, reps: val };
        }
        return item;
      });
      setTimeout(() => {
        form.setValue('skills', JSON.stringify(newSkills));
      }, 0);
      return newSkills;
    });
  };

  const totalDifficulty = (() => {
    let total = 0;
    let currentGroupDD = 0;
    let currentGroupReps = 1;

    selectedSkills.forEach((item) => {
      if (item.id === -1) {
        total += currentGroupDD * currentGroupReps;
        currentGroupDD = 0;
        currentGroupReps = 1;
      } else if (item.id === -2) {
        total += currentGroupDD * currentGroupReps;
        currentGroupDD = 0;
        currentGroupReps = 1;
        const routine = routines?.find(r => r.id === item.routineId);
        const skillIds = item.customSkillIds ?? routine?.skillIds ?? [];
        total += skillIds.reduce((acc, sId) => {
          const skill = allItems?.find(s => s.id === sId);
          return acc + (skill?.difficulty || 0);
        }, 0);
      } else {
        const skill = allItems?.find(s => s.id === item.id);
        currentGroupDD += (skill?.difficulty || 0);
        currentGroupReps = item.reps || 1;
      }
    });
    total += currentGroupDD * currentGroupReps;
    return total;
  })();

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      date: format(values.date, "yyyy-MM-dd"),
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      skills: JSON.stringify(selectedSkills) || null,
      rating: values.rating || null,
      sleepScore: values.sleepScore || null,
    };

    if (isEditing && noteToEdit) {
      updateNote.mutate({ id: noteToEdit.id, ...payload }, {
        onSuccess: () => { 
          onOpenChange(false); 
          toast({ title: "Session updated" }); 
        }
      });
    } else {
      createNote.mutate(payload as any, {
        onSuccess: () => { onOpenChange(false); toast({ title: "Session logged!" }); }
      });
    }
  };

  const [showDiscardAlert, setShowDiscardAlert] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      const v = form.getValues();
      const hasContent = !!(v.content || selectedSkills.length > 0 || v.startTime || v.endTime || v.rating || v.sleepScore);
      if (hasContent || form.formState.isDirty) {
        setShowDiscardAlert(true);
        return;
      }
    }
    onOpenChange(newOpen);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-32px)] p-0 overflow-hidden rounded-[24px] border-border/50 max-h-[90vh] max-h-[90dvh] flex flex-col">
        <div className="p-6 pb-4 flex-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{isEditing ? "Edit Session" : "Log Training Session"}</DialogTitle>
            <DialogDescription>Record your notes and skills practiced.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-scroll-touch min-h-0 px-6 pb-6 text-foreground">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className="w-full text-left font-normal rounded-xl h-11">
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
                <div className="flex items-center gap-2">
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Start</span>
                      <FormControl><Input type="time" className="rounded-xl h-9 px-2 text-sm flex-1 min-w-0" {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                  <span className="text-muted-foreground text-sm">→</span>
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">End</span>
                      <FormControl><Input type="time" className="rounded-xl h-9 px-2 text-sm flex-1 min-w-0" {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <FormField control={form.control} name="rating" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session</FormLabel>
                    <FormControl>
                      <div className="h-11 flex items-center bg-secondary/20 rounded-xl px-3 border border-border/50 w-fit">
                        <StarRating value={field.value} onChange={field.onChange} />
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sleepScore" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sleep</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="—"
                          className="rounded-xl h-11 w-20 px-3 text-sm"
                          value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-foreground/80 font-medium">Skills & Drills Practiced</FormLabel>
                  <Button 
                    type="button" 
                    variant={isConnectMode ? "default" : "outline"}
                    size="sm" 
                    className={cn(
                      "h-7 px-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                      isConnectMode ? "bg-red-500 text-white shadow-md hover:bg-red-600" : "border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    )}
                    onClick={() => setIsConnectMode(!isConnectMode)}
                  >
                    {isConnectMode ? "Connecting Next..." : "Connect Next"}
                  </Button>
                </div>
                <Select key={selectedSkills.length} onValueChange={addSkill}>
                  <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Add a skill, drill or FC..." /></SelectTrigger>
                  <SelectContent>
                    {allItems?.sort((a, b) => b.difficulty - a.difficulty).map(item => (
                      <SelectItem key={item.id} value={item.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{item.code}</Badge>
                          <span>{item.name}</span>
                          {item.isDrill === 1 && <span className="text-[10px] text-yellow-500 ml-auto font-medium">(Drill)</span>}
                          {item.isDrill === 2 && <span className="text-[10px] text-red-500 ml-auto font-medium">(FC)</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {routines && routines.length > 0 && (
                  <Select key={`routine-select-${selectedSkills.length}`} onValueChange={addRoutine}>
                    <SelectTrigger className="rounded-xl h-11 border-primary/20 bg-primary/5"><SelectValue placeholder="Add a saved routine..." /></SelectTrigger>
                    <SelectContent>
                      {routines.map(routine => (
                        <SelectItem key={routine.id} value={routine.id.toString()}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 border-primary/20 text-primary">Routine</Badge>
                            <span>{routine.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div className="min-h-[220px] bg-secondary/10 rounded-xl border border-border/50 overflow-hidden relative">
                  <div className="bg-secondary/20 px-3 py-1.5 border-b border-border/50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total DD:</span>
                      <span className="text-xs font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
                    </div>
                  </div>

                  {editingRoutineIdx !== null && selectedSkills[editingRoutineIdx]?.id === -2 && (() => {
                    const rItem = selectedSkills[editingRoutineIdx];
                    const routine = routines?.find(r => r.id === rItem.routineId);
                    const displaySkillIds = rItem.customSkillIds ?? routine?.skillIds ?? [];

                    const handleDragEnd = (event: DragEndEvent) => {
                      const { active, over } = event;
                      if (!over || active.id === over.id) return;
                      const oldIdx = displaySkillIds.findIndex((_, i) => `skill-${i}` === active.id);
                      const newIdx = displaySkillIds.findIndex((_, i) => `skill-${i}` === over.id);
                      const newIds = arrayMove(displaySkillIds, oldIdx, newIdx);
                      setSelectedSkills(prev => {
                        const ns = [...prev];
                        ns[editingRoutineIdx] = { ...ns[editingRoutineIdx], customSkillIds: newIds };
                        form.setValue('skills', JSON.stringify(ns));
                        return ns;
                      });
                    };

                    const removeSkillFromRoutine = (sIdx: number) => {
                      const newIds = displaySkillIds.filter((_, i) => i !== sIdx);
                      setSelectedSkills(prev => {
                        const ns = [...prev];
                        ns[editingRoutineIdx] = { ...ns[editingRoutineIdx], customSkillIds: newIds };
                        form.setValue('skills', JSON.stringify(ns));
                        return ns;
                      });
                    };

                    const addSkillToRoutine = (val: string) => {
                      const newIds = [...displaySkillIds, parseInt(val)];
                      setSelectedSkills(prev => {
                        const ns = [...prev];
                        ns[editingRoutineIdx] = { ...ns[editingRoutineIdx], customSkillIds: newIds };
                        form.setValue('skills', JSON.stringify(ns));
                        return ns;
                      });
                    };

                    return (
                      <div className="absolute inset-0 bg-background/97 backdrop-blur-sm z-10 flex flex-col p-4 rounded-xl overflow-hidden">
                        <div className="flex justify-between items-center mb-3 shrink-0">
                          <span className="font-bold text-sm">{rItem.routineName}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingRoutineIdx(null)}>Done</Button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto mb-3">
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={displaySkillIds.map((_, i) => `skill-${i}`)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-0.5">
                                {displaySkillIds.map((sId, sIdx) => {
                                  const sk = allItems?.find(s => s.id === sId);
                                  return (
                                    <SortableRoutineSkill
                                      key={`skill-${sIdx}`}
                                      uid={`skill-${sIdx}`}
                                      code={sk?.code}
                                      name={sk?.name}
                                      onRemove={() => removeSkillFromRoutine(sIdx)}
                                    />
                                  );
                                })}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                        <div className="shrink-0">
                          <Select key={displaySkillIds.length} onValueChange={addSkillToRoutine}>
                            <SelectTrigger className="h-9 text-xs rounded-xl border-primary/20 bg-background">
                              <SelectValue placeholder="Add skill..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allItems?.sort((a, b) => b.difficulty - a.difficulty).map(s => (
                                <SelectItem key={s.id} value={s.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>
                                    <span>{s.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })()}

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePracticeListDragEnd}>
                  <div className="max-h-[300px] overflow-scroll-touch">
                    {(() => {
                      const groups: Array<{ items: typeof selectedSkills; indices: number[] }> = [];
                      let curItems: typeof selectedSkills = [];
                      let curIndices: number[] = [];
                      selectedSkills.forEach((item, idx) => {
                        if (item.id === -1) {
                          groups.push({ items: curItems, indices: curIndices });
                          curItems = []; curIndices = [];
                        } else {
                          curItems.push(item); curIndices.push(idx);
                        }
                      });
                      groups.push({ items: curItems, indices: curIndices });
                      const nonEmpty = groups.filter(g => g.items.length > 0);

                      return (
                        <SortableContext items={nonEmpty.map((_, i) => `group-${i}`)} strategy={verticalListSortingStrategy}>
                          {nonEmpty.map((group, gIdx) => {
                            const isConnected = group.items.length > 1 && group.items[0].id !== -2;
                            return (
                              <SortablePracticeGroup key={`group-${gIdx}`} gId={`group-${gIdx}`} isConnected={isConnected}>
                            {group.items.map((item, iIdx) => {
                              const idx = group.indices[iIdx];
                              if (item.id === -2) {
                                const routine = routines?.find(r => r.id === item.routineId);
                                const baseSkillIds = routine?.skillIds ?? [];
                                const displaySkillIds = item.customSkillIds ?? baseSkillIds;
                                return (
                                  <div
                                    key={idx}
                                    className="w-full px-3 py-2 text-sm flex justify-between items-center hover:bg-secondary/20 active:bg-secondary/40 transition-colors cursor-pointer bg-primary/5"
                                    onClick={() => setEditingRoutineIdx(idx)}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none">ROUTINE</Badge>
                                      <span className="font-bold text-primary">{item.routineName}</span>
                                      {displaySkillIds.length < 10 && (
                                        <span className="text-[11px] font-mono text-muted-foreground">attempt {displaySkillIds.length}/10</span>
                                      )}
                                      {displaySkillIds.length > 10 && (
                                        <span className="text-[11px] font-mono text-muted-foreground">{displaySkillIds.length} skills</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSkill(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    </div>
                                  </div>
                                );
                              }
                              const skill = allItems?.find(s => s.id === item.id);
                              const showReps = !isConnected || iIdx === 0;
                              return (
                                <div key={idx} className={cn(
                                  "px-3 py-2 flex justify-between items-center",
                                  iIdx > 0 && isConnected ? "border-t border-border/20" : "",
                                  isConnected ? "bg-red-50/60 dark:bg-red-900/10" : ""
                                )}>
                                  <div className="flex gap-2 items-center min-w-0">
                                    {isConnected && (
                                      <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-red-500" : "text-red-400/50 pl-1")}>
                                        {iIdx === 0 ? "C" : "└"}
                                      </span>
                                    )}
                                    <Badge variant="outline" className={cn(
                                      "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                      isConnected
                                        ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                        : skill?.isDrill === 1
                                        ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                        : skill?.isDrill === 2
                                        ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                        : "border-border/60 text-muted-foreground"
                                    )}>{skill?.code}</Badge>
                                    <span className="text-sm truncate">{skill?.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {showReps && (
                                      <div className="flex items-center border rounded-md">
                                        <button type="button" className="px-2" onClick={() => updateReps(group.indices, (item.reps || 1) - 1)}>-</button>
                                        <input
                                          type="number"
                                          min="1"
                                          value={item.reps || 1}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val)) updateReps(group.indices, val);
                                          }}
                                          className="w-8 text-center text-xs font-bold bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <button type="button" className="px-2" onClick={() => updateReps(group.indices, (item.reps || 1) + 1)}>+</button>
                                      </div>
                                    )}
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSkill(idx)}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                              );
                            })}
                              </SortablePracticeGroup>
                            );
                          })}
                        </SortableContext>
                      );
                    })()}
                  </div>
                  </DndContext>
                </div>
              </div>

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="How did the session go?" className="min-h-[100px] rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <Button type="submit" className="w-full h-12 rounded-xl text-lg font-display" disabled={createNote.isPending || updateNote.isPending}>
                {isEditing ? "Update Session" : "Log Session"}
              </Button>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showDiscardAlert} onOpenChange={setShowDiscardAlert}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowDiscardAlert(false); onOpenChange(false); }} className="rounded-xl bg-destructive text-destructive-foreground">Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
