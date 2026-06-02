import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Clock, Trash2, GripVertical, MessageSquare, Copy, MoreVertical, Plus, X, Search } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Note, type Skill } from "@shared/schema";
import { parseNoteSkills, calculateTotalDD, suggestRoutinePartName, type SkillItem } from "@/lib/training-utils";
import { useDndSensors, useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { SortableChip } from "@/components/sortable-chip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";

import { useCreateNote, useUpdateNote } from "@/hooks/use-notes";
import { updateQueuedByTempId } from "@/lib/offline-queue";
import { useSkills } from "@/hooks/use-skills";
import { useRecentSkills, addRecentSkill } from "@/hooks/use-recent-skills";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
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
import { TimeField } from "./time-field";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  const globalRecentSkillIds = useRecentSkills();
  const { data: routines, createRoutine, isCreating: isCreatingRoutine } = useRoutines();
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [isConnectMode, setIsConnectMode] = useState(false);
  const [editingRoutineIdx, setEditingRoutineIdx] = useState<number | null>(null);
  const [editingConnIndices, setEditingConnIndices] = useState<number[] | null>(null);
  const [showNewConn, setShowNewConn] = useState(false);
  const [showNewRoutine, setShowNewRoutine] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [connSkillSearch, setConnSkillSearch] = useState("");
  const [routineSkillSearch, setRoutineSkillSearch] = useState("");
  const [connSkillPickerOpen, setConnSkillPickerOpen] = useState(false);
  const [routineSkillPickerOpen, setRoutineSkillPickerOpen] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnSkillIds, setNewConnSkillIds] = useState<number[]>([]);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineSkillIds, setNewRoutineSkillIds] = useState<number[]>([]);
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillCode, setNewSkillCode] = useState("");
  const [newSkillDD, setNewSkillDD] = useState("");
  const [newSkillIsDrill, setNewSkillIsDrill] = useState(false);
  const [showNewPart, setShowNewPart] = useState(false);
  const [newPartRoutineId, setNewPartRoutineId] = useState<number | null>(null);
  const [newPartStart, setNewPartStart] = useState(1);
  const [newPartEnd, setNewPartEnd] = useState(10);
  const [newPartNameOverride, setNewPartNameOverride] = useState<string | null>(null);

  useTypeToSearch(
    open && !showNewConn && !showNewRoutine && !showNewSkill && !showNewPart && editingRoutineIdx === null && editingConnIndices === null,
    pickerOpen,
    setPickerOpen,
    setPickerSearch,
  );
  useTypeToSearch(open && showNewConn, connSkillPickerOpen, setConnSkillPickerOpen, setConnSkillSearch);
  useTypeToSearch(open && showNewRoutine, routineSkillPickerOpen, setRoutineSkillPickerOpen, setRoutineSkillSearch);

  const recentEntries = (() => {
    if (!allItems) return [] as Array<{ kind: 'skill'; id: number } | { kind: 'routine'; id: number } | { kind: 'fc'; id: number }>;
    const seenKeys = new Set<string>();
    const out: Array<{ kind: 'skill'; id: number } | { kind: 'routine'; id: number } | { kind: 'fc'; id: number }> = [];
    for (let i = selectedSkills.length - 1; i >= 0; i--) {
      const item = selectedSkills[i];
      if (item.id > 0) {
        const k = `s-${item.id}`;
        if (!seenKeys.has(k) && allItems.some(s => s.id === item.id)) { seenKeys.add(k); out.push({ kind: 'skill', id: item.id }); }
      } else if (item.id === -2 && item.routineId) {
        const k = `r-${item.routineId}`;
        if (!seenKeys.has(k) && (routines?.some(r => r.id === item.routineId))) { seenKeys.add(k); out.push({ kind: 'routine', id: item.routineId }); }
      } else if (item.id === -3 && item.fcId) {
        const k = `f-${item.fcId}`;
        if (!seenKeys.has(k) && allItems.some(s => s.id === item.fcId)) { seenKeys.add(k); out.push({ kind: 'fc', id: item.fcId }); }
      }
      if (out.length >= 8) break;
    }
    return out;
  })();

  const sensors = useDndSensors();
  const longPressSensors = useLongPressDndSensors();
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const practiceListRef = useRef<HTMLDivElement>(null);
  const prevSkillsLenRef = useRef(0);

  const handleNewConnChipDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = parseInt(String(active.id).split("-")[1]);
    const newIdx = parseInt(String(over.id).split("-")[1]);
    if (isNaN(oldIdx) || isNaN(newIdx)) return;
    setNewConnSkillIds(prev => arrayMove(prev, oldIdx, newIdx));
  };

  const handleNewRoutineChipDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = parseInt(String(active.id).split("-")[1]);
    const newIdx = parseInt(String(over.id).split("-")[1]);
    if (isNaN(oldIdx) || isNaN(newIdx)) return;
    setNewRoutineSkillIds(prev => arrayMove(prev, oldIdx, newIdx));
  };

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
    if (!open) {
      prevSkillsLenRef.current = 0;
      return;
    }
    if (selectedSkills.length > prevSkillsLenRef.current) {
      const el = practiceListRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        });
      }
    }
    prevSkillsLenRef.current = selectedSkills.length;
  }, [selectedSkills.length, open]);

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
        setNewConnSkillIds([]);
        setNewRoutineName("");
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
    const fcItem = allItems?.find(s => s.id === id && (s.isDrill === 2 || s.isDrill === 3));
    if (fcItem && fcItem.skillIds) {
      setSelectedSkills(prev => {
        let newSkills = [...prev];
        if (isConnectMode && newSkills.length > 0) {
          if (newSkills[newSkills.length - 1].id === -1) {
            newSkills.pop();
          }
          const lastNonSep = [...newSkills].reverse().find(s => s.id !== -1);
          const reps = lastNonSep?.reps || 1;
          newSkills.push({ id: -3, fcId: id, fcName: fcItem.name, customSkillIds: fcItem.skillIds!, reps } as any);
        } else {
          if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
            newSkills.push({ id: -1 });
          }
          newSkills.push({ id: -3, fcId: id, fcName: fcItem.name, customSkillIds: fcItem.skillIds! } as any);
        }
        form.setValue('skills', JSON.stringify(newSkills));
        return newSkills;
      });
      return;
    }
    setSelectedSkills(prev => {
      let newSkills = [...prev];
      if (isConnectMode && newSkills.length > 0) {
        if (newSkills[newSkills.length - 1].id === -1) {
          newSkills.pop();
        }
        const lastNonSep = [...newSkills].reverse().find(s => s.id !== -1);
        const reps = lastNonSep?.reps || 1;
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
      if (isConnectMode && newSkills.length > 0) {
        if (newSkills[newSkills.length - 1].id === -1) {
          newSkills.pop();
        }
        const lastNonSep = [...newSkills].reverse().find(s => s.id !== -1);
        const reps = lastNonSep?.reps || 1;
        newSkills.push({ id: -2, routineId, routineName: routine.name, reps });
      } else {
        if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
          newSkills.push({ id: -1 });
        }
        newSkills.push({ id: -2, routineId, routineName: routine.name });
      }
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

  const removeGroup = (indices: number[]) => {
    if (!indices.length) return;
    setSelectedSkills(prev => {
      const newSkills = [...prev];
      const first = indices[0];
      const last = indices[indices.length - 1];
      let from = first;
      let to = last;
      if (from > 0 && newSkills[from - 1]?.id === -1) from = from - 1;
      else if (to < newSkills.length - 1 && newSkills[to + 1]?.id === -1) to = to + 1;
      newSkills.splice(from, to - from + 1);
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

  const addNoteAndFocus = (noteIdx: number) => {
    updateSkillNote(noteIdx, "");
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="input-skill-note-${noteIdx}"]`) as HTMLInputElement | null;
      if (!el) return;
      const container = practiceListRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const target = elRect.top - containerRect.top + container.scrollTop - (container.clientHeight / 2) + (el.clientHeight / 2);
        container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      }
      el.focus();
    }, 60);
  };

  const totalDifficulty = calculateTotalDD(selectedSkills, allItems, routines);

  const onSubmit = (values: FormValues) => {
    let payload: any;
    try {
      payload = {
        ...values,
        date: format(values.date, "yyyy-MM-dd"),
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        skills: JSON.stringify(selectedSkills) || null,
        rating: values.rating || null,
        sleepScore: values.sleepScore || null,
      };
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : "Bad form data.",
        variant: "destructive",
      });
      return;
    }

    if (isEditing && noteToEdit) {
      // Pending offline entries have negative ids (queue tempIds) and live
      // only in IndexedDB until the queue drains. Editing one rewrites the
      // queued payload instead of hitting the server.
      if (noteToEdit.id < 0) {
        void updateQueuedByTempId(noteToEdit.id, payload).then((ok) => {
          if (ok) {
            onOpenChange(false);
            toast({ title: "Pending session updated" });
          } else {
            toast({
              title: "Couldn't update session",
              description: "This pending entry could not be found locally.",
              variant: "destructive",
            });
          }
        });
        return;
      }
      updateNote.mutate({ id: noteToEdit.id, ...payload }, {
        onSuccess: () => {
          onOpenChange(false);
          toast({ title: "Session updated" });
        },
        onError: (err) => {
          toast({
            title: "Couldn't update session",
            description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      });
    } else {
      createNote.mutate(payload as any, {
        onSuccess: () => { onOpenChange(false); toast({ title: "Session logged!" }); },
        onError: (err) => {
          toast({
            title: "Couldn't log session",
            description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      });
    }
  };

  const onInvalid = (errors: Record<string, { message?: string } | undefined>) => {
    const firstMessage = Object.values(errors).find(
      (e) => e && typeof e.message === "string" && e.message,
    )?.message;
    toast({
      title: "Couldn't save",
      description: firstMessage ?? "Please check the highlighted fields and try again.",
      variant: "destructive",
    });
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
      <DialogContent className="sm:max-w-[500px] md:max-w-[680px] w-[calc(100vw-32px)] p-0 rounded-[24px] border-border/50 max-h-[90vh] max-h-[90dvh] flex flex-col overflow-clip">
        <div className="p-6 pb-4 flex-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{isEditing ? "Edit Session" : "Log Training Session"}</DialogTitle>
            <DialogDescription>Record your notes and skills practiced.</DialogDescription>
          </DialogHeader>
        </div>

        <div ref={dialogBodyRef} className="flex-1 overflow-scroll-touch min-h-0 px-6 pb-6 text-foreground">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid as any)} className="space-y-6">
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
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <FormControl><TimeField ariaLabel="Start time" value={field.value || ""} onChange={field.onChange} testId="input-start-time" /></FormControl>
                    </FormItem>
                  )} />
                  <span className="text-muted-foreground text-sm">→</span>
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <FormControl><TimeField ariaLabel="End time" value={field.value || ""} onChange={field.onChange} testId="input-end-time" /></FormControl>
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
                          value={field.value == null || Number.isNaN(field.value) ? "" : field.value}
                          onChange={e => {
                            const raw = e.target.value;
                            if (raw === "") { field.onChange(null); return; }
                            const n = Number(raw);
                            if (Number.isFinite(n)) field.onChange(n);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <FormLabel className="text-foreground/80 font-medium">Skills & Drills Practiced</FormLabel>

                <div className="flex gap-2">
                  <div className="flex flex-1 min-w-0 basis-0 h-11 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <Popover open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) setPickerSearch(""); }}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        className="flex-1 min-w-0 flex items-center justify-start font-normal text-muted-foreground px-3 hover-elevate active-elevate-2"
                        data-testid="btn-open-picker"
                      >
                        <Search className="h-4 w-4 mr-2 opacity-60 shrink-0" />
                        <span className="truncate text-xs">Search skills or add new...</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent container={dialogBodyRef.current} className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command
                        filter={(value, search) => {
                          const v = value.toLowerCase();
                          const s = search.toLowerCase();
                          return v.includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Search by name or code..." className="h-10" value={pickerSearch} onValueChange={setPickerSearch} />
                        <CommandList className="max-h-[320px]">
                          <CommandEmpty>No matches.</CommandEmpty>
                          {(() => {
                            const skillsList = (allItems || [])
                              .filter(s => s.isDrill === 0 && s.archived !== 1)
                              .slice()
                              .sort((a, b) => {
                                const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                                if (oA !== oB) return oA - oB;
                                return b.difficulty - a.difficulty;
                              });
                            const drillsList = (allItems || [])
                              .filter(s => s.isDrill === 1 && s.archived !== 1)
                              .slice()
                              .sort((a, b) => {
                                const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                                if (oA !== oB) return oA - oB;
                                return b.difficulty - a.difficulty;
                              });
                            const connList = (allItems || [])
                              .filter(s => s.isDrill === 2 && s.skillIds && s.archived !== 1)
                              .slice();
                            const partList = (allItems || [])
                              .filter(s => s.isDrill === 3 && s.skillIds && s.archived !== 1)
                              .slice();
                            const routineList = (routines || [])
                              .filter(r => r.archived !== 1)
                              .slice();
                            return (
                              <>
                                {skillsList.length > 0 && (
                                  <CommandGroup heading="Skills">
                                    {skillsList.map(item => (
                                      <CommandItem
                                        key={`s-${item.id}`}
                                        value={`${item.code} ${item.name} skill`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-skill-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.code}</span>
                                        <span className="text-muted-foreground">- {item.name}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {drillsList.length > 0 && (
                                  <CommandGroup heading="Drills">
                                    {drillsList.map(item => (
                                      <CommandItem
                                        key={`d-${item.id}`}
                                        value={`${item.code} ${item.name} drill`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-drill-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.code}</span>
                                        <span className="text-muted-foreground">- {item.name}</span>
                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-yellow-600 dark:text-yellow-400">Drill</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {connList.length > 0 && (
                                  <CommandGroup heading="Connections">
                                    {connList.map(item => (
                                      <CommandItem
                                        key={`c-${item.id}`}
                                        value={`${item.name} connection`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-conn-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.name}</span>
                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-red-500 dark:text-red-400">Connection</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {partList.length > 0 && (
                                  <CommandGroup heading="Routine Parts">
                                    {partList.map(item => (
                                      <CommandItem
                                        key={`p-${item.id}`}
                                        value={`${item.name} routine part`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-part-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.name}</span>
                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-gray-600 dark:text-gray-300">Part</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {routineList.length > 0 && (
                                  <CommandGroup heading="Routines">
                                    {routineList.map(r => (
                                      <CommandItem
                                        key={`r-${r.id}`}
                                        value={`${r.name} routine`}
                                        onSelect={() => { addRoutine(r.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-routine-${r.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{r.name}</span>
                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">Routine</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </>
                            );
                          })()}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="shrink-0 px-3 flex items-center justify-center border-l border-input text-muted-foreground hover-elevate active-elevate-2" data-testid="btn-new-item" aria-label="Add new"><Plus className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-xl">
                      <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => { setShowNewSkill(true); setShowNewConn(false); setShowNewRoutine(false); setShowNewPart(false); setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(false); }} data-testid="menu-new-skill">New Skill</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-yellow-600 dark:text-yellow-400" onClick={() => { setShowNewSkill(true); setShowNewConn(false); setShowNewRoutine(false); setShowNewPart(false); setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(true); }} data-testid="menu-new-drill">New Drill</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-red-500 dark:text-red-400" onClick={() => { setShowNewConn(true); setShowNewSkill(false); setShowNewRoutine(false); setShowNewPart(false); setNewConnName(""); setNewConnSkillIds([]); }} data-testid="menu-new-connection">New Connection</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-blue-600 dark:text-blue-400" onClick={() => { setShowNewRoutine(true); setShowNewConn(false); setShowNewSkill(false); setShowNewPart(false); setNewRoutineName(""); setNewRoutineSkillIds([]); }} data-testid="menu-new-routine">New Routine</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-gray-600 dark:text-gray-300" onClick={() => { setShowNewPart(true); setShowNewConn(false); setShowNewSkill(false); setShowNewRoutine(false); setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); }} data-testid="menu-new-part">New Routine Part</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                  <Button
                    type="button"
                    variant={isConnectMode ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-11 shrink-0 px-3 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all",
                      isConnectMode ? "bg-red-500 text-white shadow-md hover:bg-red-600" : "border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    )}
                    onClick={() => setIsConnectMode(!isConnectMode)}
                    data-testid="btn-connect-next"
                  >
                    {isConnectMode ? "Connecting..." : "Connect Next"}
                  </Button>
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
                    {(() => {
                      const dupItems = allItems?.filter(s => (newSkillIsDrill ? s.isDrill === 1 : s.isDrill === 0) && s.archived !== 1) || [];
                      if (dupItems.length === 0) return null;
                      return (
                        <Select value="" onValueChange={(v) => {
                          const src = dupItems.find(s => s.id === parseInt(v));
                          if (!src) return;
                          setNewSkillName(`${src.name} (copy)`);
                          setNewSkillCode(src.code);
                          setNewSkillDD(src.difficulty.toString());
                        }}>
                          <SelectTrigger className="rounded-lg h-8 text-xs" data-testid="select-duplicate-inline-skill"><SelectValue placeholder={`Duplicate from existing ${newSkillIsDrill ? "drill" : "skill"}...`} /></SelectTrigger>
                          <SelectContent>
                            {dupItems.map(s => (
                              <SelectItem key={s.id} value={s.id.toString()}><span className="text-xs"><span className="font-mono">{s.code}</span> — {s.name}</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <div className="flex gap-2">
                      <Input placeholder="Name" value={newSkillName} onChange={e => setNewSkillName(e.target.value)} className="rounded-lg h-9 text-xs w-1/2" />
                      <Input placeholder="Code" value={newSkillCode} onChange={e => setNewSkillCode(e.target.value)} className="rounded-lg h-9 text-xs w-1/2" />
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
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setShowNewConn(false); setShowNewRoutine(true); setNewRoutineName(""); setNewRoutineSkillIds([]); }}>Switch to Routine</Button>
                        <button type="button" onClick={() => setShowNewConn(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    </div>
                    {(() => {
                      const dupConns = allItems?.filter(s => s.isDrill === 2 && s.archived !== 1) || [];
                      if (dupConns.length === 0) return null;
                      return (
                        <Select value="" onValueChange={(v) => {
                          const src = dupConns.find(s => s.id === parseInt(v));
                          if (!src) return;
                          setNewConnName(`${src.name} (copy)`);
                          setNewConnSkillIds(src.skillIds || []);
                        }}>
                          <SelectTrigger className="rounded-lg h-8 text-xs" data-testid="select-duplicate-inline-connection"><SelectValue placeholder="Duplicate from existing connection..." /></SelectTrigger>
                          <SelectContent>
                            {dupConns.map(s => (
                              <SelectItem key={s.id} value={s.id.toString()}><span className="text-xs">{s.name}</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <Input placeholder="Name (e.g. Ba+BT)" value={newConnName} onChange={e => setNewConnName(e.target.value)} className="rounded-lg h-9 text-xs" />
                    <div className="flex items-center gap-2">
                    <Popover open={connSkillPickerOpen} onOpenChange={(v) => { setConnSkillPickerOpen(v); if (!v) setConnSkillSearch(""); }}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" role="combobox" className="rounded-lg h-8 flex-1 min-w-0 justify-start font-normal text-xs text-muted-foreground" data-testid="btn-open-conn-skill-picker">
                          <Search className="h-3.5 w-3.5 mr-2 opacity-60 shrink-0" />
                          <span className="truncate">Add skill to connection...</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent container={dialogBodyRef.current} className="p-0 w-[--radix-popover-trigger-width]" align="start">
                        <Command filter={(value, search) => { const v = value.toLowerCase(); const s = search.toLowerCase(); return v.includes(s) ? 1 : 0; }}>
                          <CommandInput placeholder="Search by name or code..." className="h-10" value={connSkillSearch} onValueChange={setConnSkillSearch} />
                          <CommandList className="max-h-[280px]">
                            <CommandEmpty>No matches.</CommandEmpty>
                            <CommandGroup heading="Skills">
                              {allItems?.filter(s => s.isDrill === 0 && s.archived !== 1).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                                <CommandItem key={s.id} value={`${s.code} ${s.name} skill`} onSelect={() => { addRecentSkill(s.id); setNewConnSkillIds(prev => [...prev, s.id]); setConnSkillPickerOpen(false); }} data-testid={`pick-conn-skill-${s.id}`}>
                                  <span className="font-mono text-xs font-semibold text-foreground mr-2">{s.code}</span>
                                  {s.code !== s.name && <span className="text-muted-foreground">- {s.name}</span>}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <span className="text-[10px] shrink-0 text-muted-foreground" data-testid="text-new-conn-skill-count">{newConnSkillIds.length} skills</span>
                    </div>
                    {(() => {
                      const recents = globalRecentSkillIds
                        .map(id => allItems?.find(s => s.id === id && s.isDrill === 0 && s.archived !== 1))
                        .filter((s): s is NonNullable<typeof s> => !!s);
                      if (recents.length === 0) return null;
                      return (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                          <div className="flex flex-wrap gap-1.5">
                            {recents.map(s => (
                              <button key={`nc-recent-${s.id}`} type="button" onClick={() => { addRecentSkill(s.id); setNewConnSkillIds(prev => [...prev, s.id]); }} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-border/60 text-muted-foreground bg-secondary/30 hover:bg-secondary/50 transition-colors active:scale-95" data-testid={`btn-new-conn-recent-${s.id}`}>{s.code}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {newConnSkillIds.length > 0 && (
                      <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleNewConnChipDragEnd}>
                        <SortableContext items={newConnSkillIds.map((_, i) => `nc-${i}`)} strategy={rectSortingStrategy}>
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-red-500/10">
                            {newConnSkillIds.map((sid, i) => {
                              const s = allItems?.find(sk => sk.id === sid);
                              return (
                                <SortableChip key={`nc-${i}`} uid={`nc-${i}`}>
                                  <Badge variant="outline" className="font-mono text-[10px] gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-new-conn-skill-${i}`}>
                                    <span className="py-0.5 pl-2 pr-1 flex items-center">{s?.code}</span>
                                    <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => setNewConnSkillIds(prev => prev.filter((_, j) => j !== i))} className="px-2 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-new-conn-skill-${i}`} aria-label="Remove">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                </SortableChip>
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    <Button type="button" size="sm" className="w-full h-8 rounded-lg text-xs bg-red-500 hover:bg-red-600 text-white" disabled={!newConnName || newConnSkillIds.length === 0 || isCreatingSkill} onClick={async () => {
                      try {
                        const dd = newConnSkillIds.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0);
                        await createSkill({ name: newConnName, code: newConnName, difficulty: dd, isDrill: 2, skillIds: newConnSkillIds });
                        setNewConnName(""); setNewConnSkillIds([]); setShowNewConn(false);
                      } catch {}
                    }}>Save Connection</Button>
                  </div>
                )}

                {showNewRoutine && (
                  <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary">New Routine</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setShowNewRoutine(false); setShowNewConn(true); setNewConnName(""); setNewConnSkillIds([]); }}>Switch to Connection</Button>
                        <button type="button" onClick={() => setShowNewRoutine(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                    </div>
                    {(() => {
                      const dupRoutines = routines?.filter(r => r.archived !== 1) || [];
                      if (dupRoutines.length === 0) return null;
                      return (
                        <Select value="" onValueChange={(v) => {
                          const src = dupRoutines.find(r => r.id === parseInt(v));
                          if (!src) return;
                          setNewRoutineName(`${src.name} (copy)`);
                          setNewRoutineSkillIds(src.skillIds.slice(0, 10));
                        }}>
                          <SelectTrigger className="rounded-lg h-8 text-xs" data-testid="select-duplicate-inline-routine"><SelectValue placeholder="Duplicate from existing routine..." /></SelectTrigger>
                          <SelectContent>
                            {dupRoutines.map(r => (
                              <SelectItem key={r.id} value={r.id.toString()}><span className="text-xs">{r.name}</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <Input placeholder="Name" value={newRoutineName} onChange={e => setNewRoutineName(e.target.value)} className="rounded-lg h-9 text-xs" />
                    <div className="flex items-center gap-2">
                      <Popover open={routineSkillPickerOpen} onOpenChange={(v) => { if (!v) { setRoutineSkillPickerOpen(false); setRoutineSkillSearch(""); return; } if (newRoutineSkillIds.length < 10) setRoutineSkillPickerOpen(true); }}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" role="combobox" disabled={newRoutineSkillIds.length >= 10} className="rounded-lg h-8 flex-1 min-w-0 justify-start font-normal text-xs text-muted-foreground" data-testid="btn-open-routine-skill-picker">
                            <Search className="h-3.5 w-3.5 mr-2 opacity-60 shrink-0" />
                            <span className="truncate">{newRoutineSkillIds.length >= 10 ? "Maximum 10 skills reached" : "Add skill to routine..."}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent container={dialogBodyRef.current} className="p-0 w-[--radix-popover-trigger-width]" align="start">
                          <Command filter={(value, search) => { const v = value.toLowerCase(); const s = search.toLowerCase(); return v.includes(s) ? 1 : 0; }}>
                            <CommandInput placeholder="Search by name or code..." className="h-10" value={routineSkillSearch} onValueChange={setRoutineSkillSearch} />
                            <CommandList className="max-h-[280px]">
                              <CommandEmpty>No matches.</CommandEmpty>
                              <CommandGroup heading="Skills">
                                {allItems?.filter(s => s.isDrill === 0 && s.archived !== 1).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                                  <CommandItem key={s.id} value={`${s.code} ${s.name} skill`} onSelect={() => { setNewRoutineSkillIds(prev => prev.length < 10 ? [...prev, s.id] : prev); setRoutineSkillPickerOpen(false); }} data-testid={`pick-routine-skill-${s.id}`}>
                                    <span className="font-mono text-xs font-semibold text-foreground mr-2">{s.code}</span>
                                    {s.code !== s.name && <span className="text-muted-foreground">- {s.name}</span>}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <span className={cn("text-[10px] shrink-0", newRoutineSkillIds.length >= 10 ? "text-red-500 font-bold" : "text-muted-foreground")}>{newRoutineSkillIds.length}/10</span>
                    </div>
                    {newRoutineSkillIds.length > 0 && (
                      <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleNewRoutineChipDragEnd}>
                        <SortableContext items={newRoutineSkillIds.map((_, i) => `nr-${i}`)} strategy={rectSortingStrategy}>
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-primary/10">
                            {newRoutineSkillIds.map((sid, i) => {
                              const s = allItems?.find(sk => sk.id === sid);
                              return (
                                <SortableChip key={`nr-${i}`} uid={`nr-${i}`}>
                                  <Badge variant="outline" className="font-mono text-[10px] gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-new-routine-skill-${i}`}>
                                    <span className="py-0.5 pl-2 pr-1 flex items-center">{s?.code}</span>
                                    <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => setNewRoutineSkillIds(prev => prev.filter((_, j) => j !== i))} className="px-2 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-new-routine-skill-${i}`} aria-label="Remove">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                </SortableChip>
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    <Button type="button" size="sm" className="w-full h-8 rounded-lg text-xs" disabled={!newRoutineName || newRoutineSkillIds.length === 0 || isCreatingRoutine} onClick={async () => {
                      try {
                        await createRoutine({ name: newRoutineName, code: newRoutineName, skillIds: newRoutineSkillIds });
                        setNewRoutineName(""); setNewRoutineSkillIds([]); setShowNewRoutine(false);
                      } catch {}
                    }}>Save Routine</Button>
                  </div>
                )}

                {showNewPart && (() => {
                  const partRoutines = (routines || []).filter(r => r.archived !== 1);
                  const sel = partRoutines.find(r => r.id === newPartRoutineId) || null;
                  const ids = sel?.skillIds || [];
                  const total = ids.length;
                  const effStart = Math.max(1, newPartStart || 1);
                  const effEnd = Math.max(effStart, newPartEnd || effStart);
                  const slice = ids.slice(effStart - 1, effEnd);
                  const auto = sel ? suggestRoutinePartName(sel.name, effStart, effEnd, total || 10) : "";
                  const finalName = (newPartNameOverride ?? "").trim() || auto;
                  const dd = slice.reduce((a, sid) => a + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0);
                  return (
                    <div className="p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-900/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">New Routine Part</span>
                        <button type="button" onClick={() => { setShowNewPart(false); setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); }}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                      </div>
                      <Select value={newPartRoutineId !== null ? String(newPartRoutineId) : ""} onValueChange={(v) => {
                        const id = parseInt(v);
                        setNewPartRoutineId(Number.isFinite(id) ? id : null);
                        setNewPartStart(1);
                        const r = partRoutines.find(rr => rr.id === id);
                        setNewPartEnd(r?.skillIds.length || 10);
                        setNewPartNameOverride(null);
                      }}>
                        <SelectTrigger className="rounded-lg h-9 text-xs" data-testid="select-new-part-routine"><SelectValue placeholder="Pick a routine..." /></SelectTrigger>
                        <SelectContent>
                          {partRoutines.map(r => (
                            <SelectItem key={r.id} value={String(r.id)}><span className="text-xs">{r.name}</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sel && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground">Start (1–{total})</label>
                              <Input
                                type="number" min={1} max={total}
                                value={newPartStart || ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") { setNewPartStart(0); setNewPartNameOverride(null); return; }
                                  const n = parseInt(raw);
                                  if (!Number.isFinite(n)) return;
                                  setNewPartStart(Math.max(0, Math.min(total, n)));
                                  setNewPartNameOverride(null);
                                }}
                                onBlur={() => {
                                  const v = Math.max(1, Math.min(total, newPartStart || 1));
                                  setNewPartStart(v);
                                  if (v > newPartEnd) setNewPartEnd(v);
                                }}
                                className="rounded-lg h-8 text-xs"
                                data-testid="input-new-part-start"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground">End ({newPartStart}–{total})</label>
                              <Input
                                type="number" min={newPartStart || 1} max={total}
                                value={newPartEnd || ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") { setNewPartEnd(0); setNewPartNameOverride(null); return; }
                                  const n = parseInt(raw);
                                  if (!Number.isFinite(n)) return;
                                  setNewPartEnd(Math.max(0, Math.min(total, n)));
                                  setNewPartNameOverride(null);
                                }}
                                onBlur={() => {
                                  const start = newPartStart || 1;
                                  const v = Math.max(start, Math.min(total, newPartEnd || start));
                                  setNewPartEnd(v);
                                }}
                                className="rounded-lg h-8 text-xs"
                                data-testid="input-new-part-end"
                              />
                            </div>
                          </div>
                          <Input
                            placeholder={auto}
                            value={finalName}
                            onChange={(e) => setNewPartNameOverride(e.target.value)}
                            className="rounded-lg h-9 text-xs"
                            data-testid="input-new-part-name"
                          />
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-500/20">
                            {slice.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground p-1">Empty range</span>
                            ) : slice.map((sid, i) => {
                              const s = allItems?.find(sk => sk.id === sid);
                              return (
                                <Badge key={`np-${i}`} variant="outline" className="font-mono text-[10px]">
                                  {effStart + i}. {s?.code || "?"}
                                </Badge>
                              );
                            })}
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-muted-foreground">Total DD</span>
                            <span className="font-semibold text-foreground">{dd.toFixed(1)}</span>
                          </div>
                        </>
                      )}
                      <Button
                        type="button" size="sm"
                        className="w-full h-8 rounded-lg text-xs bg-gray-500 hover:bg-gray-600 text-white"
                        disabled={!sel || slice.length === 0 || !finalName || isCreatingSkill}
                        onClick={async () => {
                          try {
                            const created = await createSkill({ name: finalName, code: finalName, difficulty: dd, isDrill: 3, skillIds: slice });
                            if (created && (created as Skill).id !== undefined) {
                              addSkill(String((created as Skill).id));
                            }
                            setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); setShowNewPart(false);
                          } catch {}
                        }}
                        data-testid="btn-save-new-part"
                      >Save Routine Part</Button>
                    </div>
                  );
                })()}

                {recentEntries.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                    <div className="flex flex-wrap gap-1.5">
                      {recentEntries.map(ent => {
                        if (ent.kind === 'routine') {
                          const r = routines?.find(rt => rt.id === ent.id);
                          if (!r) return null;
                          return (
                            <button key={`r-${ent.id}`} type="button" onClick={() => addRoutine(ent.id.toString())} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors active:scale-95 border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 max-w-[140px] truncate" data-testid={`btn-recent-routine-${ent.id}`}>{r.name}</button>
                          );
                        }
                        if (ent.kind === 'fc') {
                          const fc = allItems?.find(s => s.id === ent.id);
                          if (!fc) return null;
                          const isPart = fc.isDrill === 3;
                          return (
                            <button key={`f-${ent.id}`} type="button" onClick={() => addSkill(ent.id.toString())} className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors active:scale-95 max-w-[140px] truncate",
                              isPart ? "border-gray-400 text-gray-600 bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-900/10" : "border-red-300 text-red-500 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-900/10"
                            )} data-testid={`btn-recent-fc-${ent.id}`}>{fc.name}</button>
                          );
                        }
                        const skill = allItems?.find(s => s.id === ent.id);
                        if (!skill) return null;
                        return (
                          <button key={`s-${ent.id}`} type="button" onClick={() => addSkill(ent.id.toString())} className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors active:scale-95",
                            skill.isDrill === 1 ? "border-yellow-300 text-yellow-600 bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:bg-yellow-900/10"
                              : "border-border/60 text-muted-foreground bg-secondary/30 hover:bg-secondary/50"
                          )} data-testid={`btn-recent-skill-${ent.id}`}>{skill.code}</button>
                        );
                      })}
                    </div>
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
                  <div ref={practiceListRef}>
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
                            const isConnected = group.items.length > 1;
                            return (
                              <SortablePracticeGroup key={`group-${gIdx}`} gId={`group-${gIdx}`} isConnected={isConnected}>
                            {isConnected ? (() => {
                              const grpReps = group.items[0]?.reps ?? 1;
                              const grpNote = group.items[0]?.note;
                              const grpNoteIdx = group.indices[0];
                              const lineDD = group.items.reduce((acc, it) => {
                                if (it.id === -2) {
                                  const r = routines?.find(rt => rt.id === it.routineId);
                                  const sIds = it.customSkillIds ?? r?.skillIds ?? [];
                                  const cnt = it.attempt ?? sIds.length;
                                  return acc + sIds.slice(0, cnt).reduce((a, sId) => a + (allItems?.find(s => s.id === sId)?.difficulty || 0), 0);
                                }
                                if (it.id === -3) {
                                  const fc = allItems?.find(s => s.id === it.fcId);
                                  const sIds = it.customSkillIds ?? fc?.skillIds ?? [];
                                  return acc + sIds.reduce((a, sId) => a + (allItems?.find(s => s.id === sId)?.difficulty || 0), 0);
                                }
                                return acc + (allItems?.find(s => s.id === it.id)?.difficulty || 0);
                              }, 0);
                              return (
                                <div className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div
                                      className={cn("flex flex-wrap items-center gap-1.5 flex-1 min-w-0", group.items.every(it => it.id !== -2 && it.id !== -3) && "cursor-pointer")}
                                      onClick={() => {
                                        if (group.items.every(it => it.id !== -2 && it.id !== -3)) {
                                          setEditingConnIndices(group.indices);
                                        }
                                      }}
                                    >
                                      {group.items.map((it, iIdx) => {
                                        const idx = group.indices[iIdx];
                                        const sep = iIdx < group.items.length - 1 ? <span className="text-red-400/70 font-bold text-xs">+</span> : null;
                                        if (it.id === -2) {
                                          const r = routines?.find(rt => rt.id === it.routineId);
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5 cursor-pointer" onClick={() => setEditingRoutineIdx(idx)}>
                                              <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                                              <span className="text-[11px] font-bold text-primary truncate max-w-[120px]">{r?.name || it.routineName}</span>
                                              {sep}
                                            </div>
                                          );
                                        }
                                        if (it.id === -3) {
                                          const fc = allItems?.find(s => s.id === it.fcId);
                                          const isPart = fc?.isDrill === 3;
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5 cursor-pointer" onClick={() => setEditingRoutineIdx(idx)}>
                                              <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] text-white border-none shrink-0", isPart ? "bg-gray-500" : "bg-red-500")}>{isPart ? "PART" : "CONN"}</Badge>
                                              <span className={cn("text-[11px] font-bold truncate max-w-[120px]", isPart ? "text-gray-700 dark:text-gray-300" : "text-red-600 dark:text-red-400")}>{fc?.name || it.fcName}</span>
                                              {sep}
                                            </div>
                                          );
                                        }
                                        const sk = allItems?.find(s => s.id === it.id);
                                        return (
                                          <div key={idx} className="flex items-center gap-1.5">
                                            <Badge variant="outline" className={cn(
                                              "px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm",
                                              sk?.isDrill === 1
                                                ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                                : "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                            )}>{sk?.code}</Badge>
                                            {sep}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                                        <span className="text-muted-foreground">{lineDD.toFixed(1)}</span>
                                        <span className="text-red-400/70">×</span>
                                        <div className="flex items-center border rounded-md">
                                          <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps(group.indices, (grpReps || 1) - 1)}>-</button>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={grpReps ?? ""}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              if (raw === "") { updateReps(group.indices, 0); return; }
                                              const v = parseInt(raw);
                                              if (!isNaN(v)) updateReps(group.indices, v);
                                            }}
                                            onBlur={() => { if (!grpReps || grpReps < 1) updateReps(group.indices, 1); }}
                                            className="w-6 text-center text-xs font-bold bg-transparent outline-none"
                                          />
                                          <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps(group.indices, (grpReps || 1) + 1)}>+</button>
                                        </div>
                                        <span className="text-red-400/70">=</span>
                                        <span className="text-red-600 dark:text-red-400">{(lineDD * (grpReps || 1)).toFixed(1)}</span>
                                      </div>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (grpNote !== undefined && grpNote !== null) { updateSkillNote(grpNoteIdx, undefined); } else { addNoteAndFocus(grpNoteIdx); } }}><MessageSquare className="h-3.5 w-3.5" /> {grpNote !== undefined && grpNote !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => removeGroup(group.indices)}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                  {grpNote !== undefined && grpNote !== null && (
                                    <div className="mt-1.5">
                                      <input
                                        type="text"
                                        placeholder="Type a note..."
                                        value={grpNote || ""}
                                        onChange={(e) => updateSkillNote(grpNoteIdx, e.target.value)}
                                        className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40"
                                        data-testid={`input-skill-note-${grpNoteIdx}`}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })() : group.items.map((item, iIdx) => {
                              const idx = group.indices[iIdx];
                              if (item.id === -2) {
                                const routine = routines?.find(r => r.id === item.routineId);
                                const baseSkillIds = routine?.skillIds ?? [];
                                const displaySkillIds = item.customSkillIds ?? baseSkillIds;
                                return (
                                  <div key={idx} className={cn(
                                    iIdx > 0 && isConnected ? "border-t border-border/20" : "",
                                    isConnected ? "bg-red-50/60 dark:bg-red-900/10" : ""
                                  )}>
                                    <div
                                      className={cn(
                                        "w-full px-3 py-2 text-sm flex justify-between items-center transition-colors cursor-pointer",
                                        isConnected
                                          ? "hover:bg-red-100/40 active:bg-red-100/60 dark:hover:bg-red-900/20 dark:active:bg-red-900/30"
                                          : "hover:bg-secondary/20 active:bg-secondary/40 bg-primary/5"
                                      )}
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isConnected && (
                                          <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-red-500" : "text-red-400/50 pl-1")}>
                                            {iIdx === 0 ? "C" : "└"}
                                          </span>
                                        )}
                                        <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                                        <span className="font-bold text-primary truncate">{routine?.name || item.routineName}</span>
                                        {displaySkillIds.length < 10 && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">attempt {displaySkillIds.length}/10</span>
                                        )}
                                        {displaySkillIds.length > 10 && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">{displaySkillIds.length} skills</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                        {!isConnected && (() => {
                                          const dd = displaySkillIds.reduce((a, sId) => a + (allItems?.find(s => s.id === sId)?.difficulty || 0), 0);
                                          const reps = item.reps || 1;
                                          return (
                                            <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                                              <span className="text-muted-foreground">{dd.toFixed(1)}</span>
                                              <span className="text-muted-foreground/40">×</span>
                                              <div className="flex items-center border rounded-md">
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-6 text-center text-xs font-bold bg-transparent outline-none" />
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                              </div>
                                              <span className="text-muted-foreground/40">=</span>
                                              <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                            </div>
                                          );
                                        })()}
                                        {(!isConnected || iIdx === 0) ? (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { addNoteAndFocus(idx); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
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
                                      <div className="px-3 pb-2 bg-primary/5">
                                        <input type="text" placeholder="Type a note..." value={(isConnected ? group.items[0].note : item.note) || ""} onChange={(e) => updateSkillNote(isConnected ? group.indices[0] : idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40" data-testid={`input-skill-note-${isConnected ? group.indices[0] : idx}`} />
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              if (item.id === -3) {
                                const fc = allItems?.find(s => s.id === item.fcId);
                                const baseSkillIds = fc?.skillIds ?? [];
                                const displaySkillIds = item.customSkillIds ?? baseSkillIds;
                                const isPart = fc?.isDrill === 3;
                                return (
                                  <div key={idx} className={cn(
                                    iIdx > 0 && isConnected ? "border-t border-border/20" : "",
                                    isPart ? "bg-gray-100/60 dark:bg-gray-900/10" : "bg-red-50/60 dark:bg-red-900/10"
                                  )}>
                                    <div
                                      className={cn("w-full px-3 py-2 text-sm flex justify-between items-center transition-colors cursor-pointer",
                                        isPart
                                          ? "hover:bg-gray-200/40 active:bg-gray-200/60 dark:hover:bg-gray-900/20 dark:active:bg-gray-900/30"
                                          : "hover:bg-red-100/40 active:bg-red-100/60 dark:hover:bg-red-900/20 dark:active:bg-red-900/30")}
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isConnected && (
                                          <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-red-500" : "text-red-400/50 pl-1")}>
                                            {iIdx === 0 ? "C" : "└"}
                                          </span>
                                        )}
                                        <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] text-white border-none shrink-0", isPart ? "bg-gray-500" : "bg-red-500")}>{isPart ? "PART" : "CONN"}</Badge>
                                        <span className={cn("font-bold truncate", isPart ? "text-gray-700 dark:text-gray-300" : "text-red-600 dark:text-red-400")}>{fc?.name || item.fcName}</span>
                                        {displaySkillIds.length < baseSkillIds.length && (
                                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">attempt {displaySkillIds.length}/{baseSkillIds.length}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                        {!isConnected && (() => {
                                          const dd = displaySkillIds.reduce((a, sId) => a + (allItems?.find(s => s.id === sId)?.difficulty || 0), 0);
                                          const reps = item.reps || 1;
                                          return (
                                            <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                                              <span className="text-muted-foreground">{dd.toFixed(1)}</span>
                                              <span className="text-muted-foreground/40">×</span>
                                              <div className="flex items-center border rounded-md">
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-6 text-center text-xs font-bold bg-transparent outline-none" />
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                              </div>
                                              <span className="text-muted-foreground/40">=</span>
                                              <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                            </div>
                                          );
                                        })()}
                                        {(!isConnected || iIdx === 0) ? (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { addNoteAndFocus(idx); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
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
                                      <div className="px-3 pb-2 bg-red-50/60 dark:bg-red-900/10">
                                        <input type="text" placeholder="Type a note..." value={(isConnected ? group.items[0].note : item.note) || ""} onChange={(e) => updateSkillNote(isConnected ? group.indices[0] : idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 outline-none focus:bg-muted/50 placeholder:text-muted-foreground/40" data-testid={`input-skill-note-${isConnected ? group.indices[0] : idx}`} />
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
                                          : skill?.isDrill === 3
                                          ? "border-gray-400 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                          : isConnected || skill?.isDrill === 2
                                          ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400"
                                          : "border-border/60 text-muted-foreground"
                                      )}>{skill?.code}</Badge>
                                      <span className="text-sm truncate">{skill?.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {showReps && (() => {
                                        const dd = skill?.difficulty || 0;
                                        const reps = item.reps || 1;
                                        return (
                                          <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                                            <span className="text-muted-foreground">{dd.toFixed(1)}</span>
                                            <span className="text-muted-foreground/40">×</span>
                                            <div className="flex items-center border rounded-md">
                                              <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps(group.indices, (item.reps || 1) - 1)}>-</button>
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={item.reps ?? ""}
                                                onChange={(e) => {
                                                  const raw = e.target.value;
                                                  if (raw === "") { updateReps(group.indices, 0); return; }
                                                  const val = parseInt(raw);
                                                  if (!isNaN(val)) updateReps(group.indices, val);
                                                }}
                                                onBlur={() => { if (!item.reps || item.reps < 1) updateReps(group.indices, 1); }}
                                                className="w-6 text-center text-xs font-bold bg-transparent outline-none"
                                              />
                                              <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps(group.indices, (item.reps || 1) + 1)}>+</button>
                                            </div>
                                            <span className="text-muted-foreground/40">=</span>
                                            <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                          </div>
                                        );
                                      })()}
                                      {(!isConnected || iIdx === 0) ? (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => {
                                              if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); }
                                              else { addNoteAndFocus(isConnected ? group.indices[0] : idx); }
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

        {editingConnIndices !== null && (() => {
          const indices = editingConnIndices;
          const skillIds = indices.map(i => selectedSkills[i]?.id).filter((v): v is number => typeof v === 'number' && v > 0);
          return (
            <div className="absolute inset-0 bg-background z-30 flex flex-col rounded-[24px] overflow-hidden p-4">
              <SkillEditorOverlay
                title="Edit Connection"
                skillIds={skillIds}
                allSkills={allItems || []}
                onSkillIdsChange={(newIds) => {
                  setSelectedSkills(prev => {
                    const first = prev[indices[0]];
                    const reps = first?.reps;
                    const note = first?.note;
                    const newItems: SkillItem[] = newIds.map((id, i) => {
                      const base: SkillItem = { id };
                      if (i === 0) {
                        if (reps !== undefined) base.reps = reps;
                        if (note !== undefined) base.note = note;
                      }
                      return base;
                    });
                    const sortedIdx = [...indices].sort((a, b) => a - b);
                    const minIdx = sortedIdx[0];
                    const set = new Set(sortedIdx);
                    const ns: SkillItem[] = [];
                    for (let i = 0; i < prev.length; i++) {
                      if (i === minIdx) ns.push(...newItems);
                      if (!set.has(i)) ns.push(prev[i]);
                    }
                    form.setValue('skills', JSON.stringify(ns));
                    return ns;
                  });
                  if (newIds.length === 0) {
                    setEditingConnIndices(null);
                  } else {
                    const minIdx = Math.min(...indices);
                    setEditingConnIndices(Array.from({ length: newIds.length }, (_, k) => minIdx + k));
                  }
                }}
                onClose={() => setEditingConnIndices(null)}
                filterSkills={(s) => s.isDrill === 0}
                className="flex-1 min-h-0"
              />
            </div>
          );
        })()}

        {editingRoutineIdx !== null && (selectedSkills[editingRoutineIdx]?.id === -2 || selectedSkills[editingRoutineIdx]?.id === -3) && (() => {
          const rItem = selectedSkills[editingRoutineIdx];
          const isFC = rItem.id === -3;
          const baseSkillIds = isFC
            ? (allItems?.find(s => s.id === rItem.fcId)?.skillIds ?? [])
            : (routines?.find(r => r.id === rItem.routineId)?.skillIds ?? []);
          const displaySkillIds = rItem.customSkillIds ?? baseSkillIds;
          const liveName = isFC
            ? allItems?.find(s => s.id === rItem.fcId)?.name
            : routines?.find(r => r.id === rItem.routineId)?.name;
          const title = liveName || (isFC ? (rItem.fcName || "Edit Connection") : (rItem.routineName || "Edit Routine"));

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
