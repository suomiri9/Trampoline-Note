import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Trash2, GripVertical, MessageSquare, Copy, MoreVertical, Plus, X, ChevronRight } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Note } from "@shared/schema";
import { parseNoteSkills, calculateTotalDD, type SkillItem } from "@/lib/training-utils";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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


export function NoteDialog({ open, onOpenChange, noteToEdit }: NoteDialogProps) {
  const { toast } = useToast();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const { data: allItems, createSkill, isCreating: isCreatingSkill } = useSkills();
  const { data: routines, createRoutine, isCreating: isCreatingRoutine } = useRoutines();
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [isConnectMode, setIsConnectMode] = useState(false);
  const [editingRoutineIdx, setEditingRoutineIdx] = useState<number | null>(null);
  const [showNewConn, setShowNewConn] = useState(false);
  const [showNewRoutine, setShowNewRoutine] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnCode, setNewConnCode] = useState("");
  const [newConnSkillIds, setNewConnSkillIds] = useState<number[]>([]);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineCode, setNewRoutineCode] = useState("");
  const [newRoutineSkillIds, setNewRoutineSkillIds] = useState<number[]>([]);
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillCode, setNewSkillCode] = useState("");
  const [newSkillDD, setNewSkillDD] = useState("");
  const [newSkillIsDrill, setNewSkillIsDrill] = useState(false);

  const recentSkillIds = (() => {
    if (!allItems) return [];
    const seen: number[] = [];
    for (let i = selectedSkills.length - 1; i >= 0; i--) {
      const item = selectedSkills[i];
      if (item.id > 0 && !seen.includes(item.id)) seen.push(item.id);
    }
    return seen.slice(0, 8).filter(id => allItems.some(s => s.id === id));
  })();

  const sensors = useDndSensors();

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
        setSelectedSkills(parseNoteSkills(noteToEdit.skills));
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
        setShowNewConn(false);
        setShowNewRoutine(false);
        setNewConnName("");
        setNewConnCode("");
        setNewConnSkillIds([]);
        setNewRoutineName("");
        setNewRoutineCode("");
        setNewRoutineSkillIds([]);
        setShowNewSkill(false);
        setNewSkillName("");
        setNewSkillCode("");
        setNewSkillDD("");
        setNewSkillIsDrill(false);
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
    const fcItem = allItems?.find(s => s.id === id && s.isDrill === 2);
    if (fcItem && fcItem.skillIds) {
      setSelectedSkills(prev => {
        let newSkills = [...prev];
        newSkills.push({ id: -3, fcId: id, fcName: fcItem.name, customSkillIds: fcItem.skillIds! } as any);
        form.setValue('skills', JSON.stringify(newSkills));
        return newSkills;
      });
      setIsConnectMode(false);
      return;
    }
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

  const duplicateGroup = (groupIndices: number[]) => {
    setSelectedSkills(prev => {
      const newSkills = [...prev];
      const lastIdx = groupIndices[groupIndices.length - 1];
      const groupItems = groupIndices.map(i => ({ ...prev[i] }));
      const toInsert = [{ id: -1 } as SkillItem, ...groupItems];
      newSkills.splice(lastIdx + 1, 0, ...toInsert);
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  const updateReps = (indices: number[], reps: number) => {
    const val = Math.max(0, reps);
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

  const updateSkillNote = (index: number, note: string | undefined) => {
    setSelectedSkills(prev => {
      const newSkills = prev.map((item, idx) => {
        if (idx === index) {
          if (note === undefined) {
            const { note: _, ...rest } = item;
            return rest;
          }
          return { ...item, note };
        }
        return item;
      });
      setTimeout(() => {
        const cleaned = newSkills.map(s => {
          if (s.note === "") { const { note: _, ...rest } = s; return rest; }
          return s;
        });
        form.setValue('skills', JSON.stringify(cleaned));
      }, 0);
      return newSkills;
    });
  };

  const totalDifficulty = calculateTotalDD(selectedSkills, allItems, routines);

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
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-32px)] p-0 rounded-[24px] border-border/50 max-h-[90vh] max-h-[90dvh] flex flex-col overflow-clip">
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
                            {field.value ? format(field.value, "EEE, d MMMM yyyy") : "Pick a date"}
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

                <div className="flex gap-2">
                  <Select key={selectedSkills.length} onValueChange={addSkill}>
                    <SelectTrigger className="rounded-xl h-11 flex-1"><SelectValue placeholder="Add a skill or drill..." /></SelectTrigger>
                    <SelectContent>
                      {allItems?.filter(s => s.isDrill !== 2).slice().sort((a, b) => {
                        const groupOrder = (s: typeof a) => s.isDrill === 0 ? 0 : 1;
                        const gA = groupOrder(a), gB = groupOrder(b);
                        if (gA !== gB) return gA - gB;
                        const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                        if (oA !== oB) return oA - oB;
                        return b.difficulty - a.difficulty;
                      }).map(item => (
                        <SelectItem key={item.id} value={item.id.toString()}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">{item.code}</Badge>
                            <span>{item.name}</span>
                            {item.isDrill === 1 && <span className="text-[10px] text-yellow-500 ml-auto font-medium">(Drill)</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-xl text-[10px] gap-1 px-2" onClick={() => { setShowNewSkill(true); setShowNewConn(false); setShowNewRoutine(false); setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(false); }} data-testid="btn-new-skill"><Plus className="h-3.5 w-3.5" />S<span className="text-muted-foreground/50">or</span><span className="text-yellow-500">D</span></Button>
                </div>

                <div className="flex gap-2">
                  <Select key={`routine-select-${selectedSkills.length}`} onValueChange={(val) => {
                    if (val.startsWith("conn-")) {
                      addSkill(val.replace("conn-", ""));
                    } else {
                      addRoutine(val);
                    }
                  }}>
                    <SelectTrigger className="rounded-xl h-11 border-primary/20 bg-primary/5 flex-1"><SelectValue placeholder="Routine / Connection..." /></SelectTrigger>
                    <SelectContent>
                      {routines?.map(routine => (
                        <SelectItem key={`r-${routine.id}`} value={routine.id.toString()}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 border-primary/20 text-primary">Routine</Badge>
                            <span>{routine.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      {allItems?.filter(s => s.isDrill === 2 && s.skillIds).map(conn => (
                        <SelectItem key={`c-${conn.id}`} value={`conn-${conn.id}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px] bg-red-100 border-red-200 text-red-500 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">Connection</Badge>
                            <span>{conn.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-xl text-[10px] gap-1 px-2 border-foreground text-foreground hover:bg-foreground/10 dark:border-foreground dark:text-foreground dark:hover:bg-foreground/10" onClick={() => { setShowNewRoutine(true); setShowNewConn(false); setShowNewSkill(false); setNewRoutineName(""); setNewRoutineCode(""); setNewRoutineSkillIds([]); }} data-testid="btn-new-routine"><Plus className="h-3.5 w-3.5" />R<span className="text-muted-foreground/50">or</span><span className="text-red-500">C</span></Button>
                </div>

                {showNewSkill && (
                  <div className={cn("p-3 rounded-xl border space-y-2", newSkillIsDrill ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10" : "border-border bg-secondary/20")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-bold", newSkillIsDrill ? "text-yellow-600 dark:text-yellow-400" : "text-foreground/80")}>{newSkillIsDrill ? "New Drill" : "New Skill"}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setNewSkillIsDrill(!newSkillIsDrill)}>Switch to {newSkillIsDrill ? "Skill" : "Drill"}</Button>
                        <button type="button" onClick={() => setShowNewSkill(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Name" value={newSkillName} onChange={e => setNewSkillName(e.target.value)} className="rounded-lg h-9 text-xs flex-1" />
                      <Input placeholder="Code" value={newSkillCode} onChange={e => setNewSkillCode(e.target.value)} className="rounded-lg h-9 text-xs w-20" />
                    </div>
                    <Input type="number" step="0.1" min="0" placeholder="DD" value={newSkillDD} onChange={e => setNewSkillDD(e.target.value)} className="rounded-lg h-9 text-xs w-20" />
                    <Button type="button" size="sm" className="w-full h-8 rounded-lg text-xs" disabled={!newSkillName || !newSkillCode || isCreatingSkill} onClick={async () => {
                      try {
                        await createSkill({ name: newSkillName, code: newSkillCode, difficulty: parseFloat(newSkillDD) || 0, isDrill: newSkillIsDrill ? 1 : 0 });
                        setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(false); setShowNewSkill(false);
                      } catch {}
                    }}>Save {newSkillIsDrill ? "Drill" : "Skill"}</Button>
                  </div>
                )}

                {showNewConn && (
                  <div className="p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">New Connection</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setShowNewConn(false); setShowNewRoutine(true); setNewRoutineName(""); setNewRoutineCode(""); setNewRoutineSkillIds([]); }}>Switch to Routine</Button>
                        <button type="button" onClick={() => setShowNewConn(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Name" value={newConnName} onChange={e => setNewConnName(e.target.value)} className="rounded-lg h-9 text-xs flex-1" />
                      <Input placeholder="Code" value={newConnCode} onChange={e => setNewConnCode(e.target.value)} className="rounded-lg h-9 text-xs w-20" />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {newConnSkillIds.map((sid, i) => {
                        const s = allItems?.find(sk => sk.id === sid);
                        return <Badge key={i} variant="outline" className="font-mono text-[10px] gap-1">{s?.code}<button type="button" onClick={() => setNewConnSkillIds(prev => prev.filter((_, j) => j !== i))}><X className="h-2.5 w-2.5" /></button></Badge>;
                      })}
                    </div>
                    <Select key={`conn-skill-${newConnSkillIds.length}`} onValueChange={(v) => setNewConnSkillIds(prev => [...prev, parseInt(v)])}>
                      <SelectTrigger className="rounded-lg h-8 text-xs"><SelectValue placeholder="Add skill to connection..." /></SelectTrigger>
                      <SelectContent>
                        {allItems?.filter(s => s.isDrill === 0).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}><span className="text-xs">{s.code} — {s.name}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" className="w-full h-8 rounded-lg text-xs bg-red-500 hover:bg-red-600 text-white" disabled={!newConnName || !newConnCode || newConnSkillIds.length === 0 || isCreatingSkill} onClick={async () => {
                      try {
                        const dd = newConnSkillIds.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0);
                        await createSkill({ name: newConnName, code: newConnCode, difficulty: dd, isDrill: 2, skillIds: newConnSkillIds });
                        setNewConnName(""); setNewConnCode(""); setNewConnSkillIds([]); setShowNewConn(false);
                      } catch {}
                    }}>Save Connection</Button>
                  </div>
                )}

                {showNewRoutine && (
                  <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary">New Routine</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setShowNewRoutine(false); setShowNewConn(true); setNewConnName(""); setNewConnCode(""); setNewConnSkillIds([]); }}>Switch to Connection</Button>
                        <button type="button" onClick={() => setShowNewRoutine(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Name" value={newRoutineName} onChange={e => setNewRoutineName(e.target.value)} className="rounded-lg h-9 text-xs flex-1" />
                      <Input placeholder="Code" value={newRoutineCode} onChange={e => setNewRoutineCode(e.target.value)} className="rounded-lg h-9 text-xs w-20" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Select key={`routine-skill-${newRoutineSkillIds.length}`} onValueChange={(v) => setNewRoutineSkillIds(prev => prev.length < 10 ? [...prev, parseInt(v)] : prev)} disabled={newRoutineSkillIds.length >= 10}>
                        <SelectTrigger className="rounded-lg h-8 text-xs flex-1" disabled={newRoutineSkillIds.length >= 10}><SelectValue placeholder={newRoutineSkillIds.length >= 10 ? "Maximum 10 skills reached" : "Add skill to routine..."} /></SelectTrigger>
                        <SelectContent>
                          {allItems?.filter(s => s.isDrill === 0).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}><span className="text-xs">{s.code} — {s.name}</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className={cn("text-[10px] shrink-0", newRoutineSkillIds.length >= 10 ? "text-red-500 font-bold" : "text-muted-foreground")}>{newRoutineSkillIds.length}/10</span>
                    </div>
                    {newRoutineSkillIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-primary/10">
                        {newRoutineSkillIds.map((sid, i) => {
                          const s = allItems?.find(sk => sk.id === sid);
                          return <Badge key={i} variant="outline" className="font-mono text-[10px] gap-1">{s?.code}<button type="button" onClick={() => setNewRoutineSkillIds(prev => prev.filter((_, j) => j !== i))}><X className="h-2.5 w-2.5" /></button></Badge>;
                        })}
                      </div>
                    )}
                    <Button type="button" size="sm" className="w-full h-8 rounded-lg text-xs" disabled={!newRoutineName || !newRoutineCode || newRoutineSkillIds.length === 0 || isCreatingRoutine} onClick={async () => {
                      try {
                        await createRoutine({ name: newRoutineName, code: newRoutineCode, skillIds: newRoutineSkillIds });
                        setNewRoutineName(""); setNewRoutineCode(""); setNewRoutineSkillIds([]); setShowNewRoutine(false);
                      } catch {}
                    }}>Save Routine</Button>
                  </div>
                )}

                {(recentSkillIds.length > 0 || selectedSkills.length > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      {recentSkillIds.length > 0 && <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>}
                      {recentSkillIds.length === 0 && <span />}
                      {selectedSkills.length > 0 && selectedSkills.some(s => s.id !== -1) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSkills(prev => {
                              if (prev.length === 0 || prev[prev.length - 1].id === -1) return prev;
                              const newSkills = [...prev, { id: -1 as const }];
                              form.setValue('skills', JSON.stringify(newSkills));
                              return newSkills;
                            });
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-blue-300 text-blue-600 bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:bg-blue-900/10 transition-colors active:scale-95"
                          data-testid="btn-next-turn"
                        >
                          Turn {(() => { let turns = 1; selectedSkills.forEach(s => { if (s.id === -1) turns++; }); return turns; })()}
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {recentSkillIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {recentSkillIds.map(sid => {
                          const skill = allItems?.find(s => s.id === sid);
                          if (!skill) return null;
                          return (
                            <button key={sid} type="button" onClick={() => addSkill(sid.toString())} className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors active:scale-95",
                              skill.isDrill === 1 ? "border-yellow-300 text-yellow-600 bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:bg-yellow-900/10"
                                : skill.isDrill === 2 ? "border-red-300 text-red-500 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-900/10"
                                : "border-border/60 text-muted-foreground bg-secondary/30 hover:bg-secondary/50"
                            )} data-testid={`btn-recent-skill-${sid}`}>{skill.code}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="min-h-[220px] bg-secondary/10 rounded-xl border border-border/50 overflow-hidden relative">
                  <div className="bg-secondary/20 px-3 py-1.5 border-b border-border/50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total DD:</span>
                      <span className="text-xs font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
                    </div>
                  </div>

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
                            const isConnected = false;
                            return (
                              <SortablePracticeGroup key={`group-${gIdx}`} gId={`group-${gIdx}`} isConnected={isConnected}>
                            {group.items.map((item, iIdx) => {
                              const idx = group.indices[iIdx];
                              if (item.id === -2) {
                                const routine = routines?.find(r => r.id === item.routineId);
                                const baseSkillIds = routine?.skillIds ?? [];
                                const displaySkillIds = item.customSkillIds ?? baseSkillIds;
                                return (
                                  <div key={idx}>
                                    <div
                                      className="w-full px-3 py-2 text-sm flex justify-between items-center hover:bg-secondary/20 active:bg-secondary/40 transition-colors cursor-pointer bg-primary/5"
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                                        <span className="font-bold text-primary truncate">{item.routineName}</span>
                                        {displaySkillIds.length < 10 && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">attempt {displaySkillIds.length}/10</span>
                                        )}
                                        {displaySkillIds.length > 10 && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">{displaySkillIds.length} skills</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center border rounded-md">
                                          <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                          <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-8 text-center text-xs font-bold bg-transparent outline-none" />
                                          <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                        </div>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { updateSkillNote(idx, ""); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => removeSkill(idx)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                    {(item.note !== undefined && item.note !== null) && (
                                      <div className="px-3 pb-2 bg-primary/5">
                                        <input type="text" placeholder="Type a note..." value={item.note || ""} onChange={(e) => updateSkillNote(idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40" data-testid={`input-skill-note-${idx}`} />
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              if (item.id === -3) {
                                const fc = allItems?.find(s => s.id === item.fcId);
                                const baseSkillIds = fc?.skillIds ?? [];
                                const displaySkillIds = item.customSkillIds ?? baseSkillIds;
                                return (
                                  <div key={idx}>
                                    <div
                                      className="w-full px-3 py-2 text-sm flex justify-between items-center hover:bg-red-100/40 active:bg-red-100/60 dark:hover:bg-red-900/20 dark:active:bg-red-900/30 transition-colors cursor-pointer bg-red-50/60 dark:bg-red-900/10"
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-red-500 text-white border-none shrink-0">CONN</Badge>
                                        <span className="font-bold text-red-600 dark:text-red-400 truncate">{item.fcName}</span>
                                        {displaySkillIds.length < baseSkillIds.length && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center border rounded-md">
                                          <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                          <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-8 text-center text-xs font-bold bg-transparent outline-none" />
                                          <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                        </div>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { updateSkillNote(idx, ""); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => removeSkill(idx)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                    {(item.note !== undefined && item.note !== null) && (
                                      <div className="px-3 pb-2 bg-red-50/60 dark:bg-red-900/10">
                                        <input type="text" placeholder="Type a note..." value={item.note || ""} onChange={(e) => updateSkillNote(idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40" data-testid={`input-skill-note-${idx}`} />
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              const skill = allItems?.find(s => s.id === item.id);
                              const showReps = !isConnected || iIdx === 0;
                              return (
                                <div key={idx} className={cn(
                                  iIdx > 0 && isConnected ? "border-t border-border/20" : "",
                                  isConnected ? "bg-red-50/60 dark:bg-red-900/10" : ""
                                )}>
                                  <div className="px-3 py-2 flex justify-between items-center">
                                    <div className="flex gap-2 items-center min-w-0">
                                      {isConnected && (
                                        <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-red-500" : "text-red-400/50 pl-1")}>
                                          {iIdx === 0 ? "C" : "└"}
                                        </span>
                                      )}
                                      <Badge variant="outline" className={cn(
                                        "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                        skill?.isDrill === 1
                                          ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                          : isConnected || skill?.isDrill === 2
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
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={item.reps ?? ""}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              if (raw === "") {
                                                updateReps(group.indices, 0);
                                                return;
                                              }
                                              const val = parseInt(raw);
                                              if (!isNaN(val)) updateReps(group.indices, val);
                                            }}
                                            onBlur={() => {
                                              if (!item.reps || item.reps < 1) updateReps(group.indices, 1);
                                            }}
                                            className="w-8 text-center text-xs font-bold bg-transparent outline-none"
                                          />
                                          <button type="button" className="px-2" onClick={() => updateReps(group.indices, (item.reps || 1) + 1)}>+</button>
                                        </div>
                                      )}
                                      {(!isConnected || iIdx === 0) ? (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => {
                                              if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); }
                                              else { updateSkillNote(idx, ""); setTimeout(() => { const el = document.querySelector(`[data-testid="input-skill-note-${idx}"]`) as HTMLInputElement; if (el) el.focus(); }, 50); }
                                            }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => removeSkill(idx)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      ) : (
                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive" onClick={() => removeSkill(idx)}><Trash2 className="h-3 w-3" /></Button>
                                      )}
                                    </div>
                                  </div>
                                  {(isConnected ? (iIdx === group.items.length - 1 && group.items[0].note !== undefined && group.items[0].note !== null) : (item.note !== undefined && item.note !== null)) && (
                                    <div className="px-3 pb-2">
                                      <input
                                        type="text"
                                        placeholder="Type a note..."
                                        value={group.items[0].note || ""}
                                        onChange={(e) => updateSkillNote(group.indices[0], e.target.value)}
                                        className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40"
                                        data-testid={`input-skill-note-${group.indices[0]}`}
                                      />
                                    </div>
                                  )}
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

        {editingRoutineIdx !== null && (selectedSkills[editingRoutineIdx]?.id === -2 || selectedSkills[editingRoutineIdx]?.id === -3) && (() => {
          const rItem = selectedSkills[editingRoutineIdx];
          const isFC = rItem.id === -3;
          const baseSkillIds = isFC
            ? (allItems?.find(s => s.id === rItem.fcId)?.skillIds ?? [])
            : (routines?.find(r => r.id === rItem.routineId)?.skillIds ?? []);
          const displaySkillIds = rItem.customSkillIds ?? baseSkillIds;
          const title = isFC ? (rItem.fcName || "Edit Connection") : (rItem.routineName || "Edit Routine");

          return (
            <div className="absolute inset-0 bg-background z-30 flex flex-col rounded-[24px] overflow-hidden p-4">
              <SkillEditorOverlay
                title={title}
                skillIds={displaySkillIds}
                allSkills={allItems || []}
                onSkillIdsChange={(newIds) => {
                  setSelectedSkills(prev => {
                    const ns = [...prev];
                    ns[editingRoutineIdx] = { ...ns[editingRoutineIdx], customSkillIds: newIds };
                    form.setValue('skills', JSON.stringify(ns));
                    return ns;
                  });
                }}
                onClose={() => setEditingRoutineIdx(null)}
                filterSkills={isFC ? (s) => s.isDrill === 0 : undefined}
                className="flex-1 min-h-0"
              />
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={showDiscardAlert}
      onOpenChange={setShowDiscardAlert}
      title="Discard changes?"
      description="Your unsaved changes will be lost."
      onConfirm={() => { setShowDiscardAlert(false); onOpenChange(false); }}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
    />
    </>
  );
}
