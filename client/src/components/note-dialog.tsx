import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, GripVertical } from "lucide-react";
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
  content: z.string().min(1, "Notes cannot be empty."),
  skills: z.string().optional().nullable(), // Store as comma-separated IDs
  rating: z.number().min(1).max(5).optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteToEdit?: Note | null;
}

type SkillItem = { id: number; reps?: number };

export function NoteDialog({ open, onOpenChange, noteToEdit }: NoteDialogProps) {
  const { toast } = useToast();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const { data: allItems } = useSkills();
  const { data: routines } = useRoutines();
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [isConnectMode, setIsConnectMode] = useState(false);

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

  const totalDifficulty = selectedSkills.reduce((sum, item, idx) => {
    if (item.id === -1) return sum;
    if (item.id === -2) {
      const routine = routines?.find(r => r.id === item.routineId);
      if (!routine) return sum;
      const routineDD = routine.skillIds.reduce((acc, sId) => {
        const skill = allItems?.find(s => s.id === sId);
        return acc + (skill?.difficulty || 0);
      }, 0);
      return sum + routineDD;
    }
    let groupStart = idx;
    while (groupStart > 0 && selectedSkills[groupStart - 1].id !== -1) {
      groupStart--;
    }
    if (idx !== groupStart) return sum;
    let groupDD = 0;
    let i = groupStart;
    while (i < selectedSkills.length && selectedSkills[i].id !== -1) {
      const skill = allItems?.find(s => s.id === selectedSkills[i].id);
      groupDD += (skill?.difficulty || 0);
      i++;
    }
    return sum + (groupDD * (item.reps || 1));
  }, 0);

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      date: format(values.date, "yyyy-MM-dd"),
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      skills: JSON.stringify(selectedSkills) || null,
      rating: values.rating || null,
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

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && (form.getValues("content") || selectedSkills.length > 0)) {
      if (confirm("Are you sure you want to close? Your changes will be lost.")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-32px)] p-0 overflow-hidden rounded-[24px] border-border/50 max-h-[90svh] flex flex-col">
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
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem className="min-w-0"><FormLabel>Start</FormLabel><FormControl><Input type="time" className="rounded-xl h-11 px-3 text-sm" {...field} value={field.value || ""} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem className="min-w-0"><FormLabel>End</FormLabel><FormControl><Input type="time" className="rounded-xl h-11 px-3 text-sm" {...field} value={field.value || ""} /></FormControl></FormItem>
                  )} />
                </div>
              </div>

              <FormField control={form.control} name="rating" render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Rating</FormLabel>
                  <FormControl>
                    <div className="h-11 flex items-center bg-secondary/20 rounded-xl px-3 border border-border/50 w-fit">
                      <StarRating value={field.value} onChange={field.onChange} />
                    </div>
                  </FormControl>
                </FormItem>
              )} />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-foreground/80 font-medium">Skills & Drills Practiced</FormLabel>
                  <Button 
                    type="button" 
                    variant={isConnectMode ? "default" : "outline"}
                    size="sm" 
                    className={cn(
                      "h-7 px-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                      isConnectMode ? "bg-primary text-primary-foreground shadow-md" : "border-primary/20 text-primary hover:bg-primary/5"
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
                          {item.isDrill === 1 && <span className="text-[10px] text-muted-foreground ml-auto">(Drill)</span>}
                          {item.isDrill === 2 && <span className="text-[10px] text-muted-foreground ml-auto">(FC)</span>}
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

                <div className="min-h-[150px] bg-secondary/10 rounded-xl border border-border/50 overflow-hidden">
                  <div className="bg-secondary/20 px-3 py-1.5 border-b border-border/50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total DD:</span>
                      <span className="text-xs font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-[300px] overflow-scroll-touch">
                    {/* Simplified List for brevity - maintaining functionality */}
                    {selectedSkills.map((item, idx) => {
                       if (item.id === -1) return null;
                       const skill = allItems?.find(s => s.id === item.id);
                       if (item.id === -2) {
                         return <div key={idx} className="p-3 text-sm font-bold text-primary flex justify-between items-center">
                           <span>Routine: {item.routineName}</span>
                           <Button type="button" variant="ghost" size="icon" onClick={() => removeSkill(idx)}><Trash2 className="h-4 w-4" /></Button>
                         </div>;
                       }
                       return <div key={idx} className="p-3 flex justify-between items-center">
                         <div className="flex gap-2 items-center">
                           <Badge variant="outline">{skill?.code}</Badge>
                           <span className="text-sm">{skill?.name}</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <div className="flex items-center border rounded-md">
                               <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                               <span className="px-2 text-xs font-bold">{item.reps || 1}</span>
                               <button type="button" className="px-2" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSkill(idx)}><Trash2 className="h-4 w-4" /></Button>
                         </div>
                       </div>;
                    })}
                  </div>
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
  );
}
