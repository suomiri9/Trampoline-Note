import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, GripVertical } from "lucide-react";
import { type Note, type Skill } from "@shared/schema";
import { useCreateNote, useUpdateNote } from "@/hooks/use-notes";
import { useSkills } from "@/hooks/use-skills";
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
  time: z.string().optional().nullable(),
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
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [isConnectMode, setIsConnectMode] = useState(false);

  const isEditing = !!noteToEdit;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
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
          time: noteToEdit.time || "",
          content: noteToEdit.content,
          skills: noteToEdit.skills || "",
          rating: noteToEdit.rating || null,
        });
      } else {
        setSelectedSkills([]);
        setIsConnectMode(false);
        form.reset({
          date: new Date(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          content: "",
          skills: "",
          rating: null,
        });
      }
    }
  }, [open, noteToEdit, form]);

  const addSkill = (idStr: string) => {
    const id = parseInt(idStr);
    let newSkills = [...selectedSkills];
    
    if (isConnectMode && newSkills.length > 0) {
      if (newSkills[newSkills.length - 1].id === -1) {
        newSkills.pop();
      }
      const lastSkill = [...newSkills].reverse().find(s => s.id !== -1);
      const reps = lastSkill?.reps || 1;
      newSkills.push({ id, reps });
      setIsConnectMode(false);
    } else {
      if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
        newSkills.push({ id: -1 });
      }
      newSkills.push({ id, reps: 1 });
    }
    
    setSelectedSkills(newSkills);
    form.setValue('skills', JSON.stringify(newSkills));
  };

  const removeSkill = (index: number) => {
    const newSkills = [...selectedSkills];
    newSkills.splice(index, 1);
    setSelectedSkills(newSkills);
    form.setValue('skills', JSON.stringify(newSkills));
  };

  const updateReps = (indices: number[], reps: number) => {
    const val = Math.max(1, reps);
    const newSkills = [...selectedSkills];
    indices.forEach(idx => {
      if (newSkills[idx]) {
        newSkills[idx] = { ...newSkills[idx], reps: val };
      }
    });
    setSelectedSkills(newSkills);
    form.setValue('skills', JSON.stringify(newSkills));
  };

  const totalDifficulty = selectedSkills.reduce((sum, item, idx) => {
    if (item.id === -1) return sum;
    
    // Find if this skill is part of a connection group
    // A group is defined by skills between -1 separators
    let groupSkills: SkillItem[] = [];
    let i = idx;
    // Look backwards to find start of group
    while (i >= 0 && selectedSkills[i].id !== -1) {
      groupSkills.unshift(selectedSkills[i]);
      i--;
    }
    // Look forwards to find end of group
    i = idx + 1;
    while (i < selectedSkills.length && selectedSkills[i].id !== -1) {
      groupSkills.push(selectedSkills[i]);
      i++;
    }

    // Only process the first item of each group to avoid overcounting
    // The first item of a group is either index 0 or follows a -1
    const isFirstInGroup = idx === 0 || selectedSkills[idx - 1].id === -1;
    if (!isFirstInGroup) return sum;

    const groupDD = groupSkills.reduce((acc, gs) => {
      const skill = allItems?.find(s => s.id === gs.id);
      return acc + (skill?.difficulty || 0);
    }, 0);

    return sum + (groupDD * (item.reps || 1));
  }, 0);

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      date: values.date.toISOString(), 
      time: values.time || null,
      skills: JSON.stringify(selectedSkills) || null,
      rating: values.rating || null,
    };

    if (isEditing && noteToEdit) {
      updateNote.mutate({ id: noteToEdit.id, ...payload }, {
        onSuccess: () => { onOpenChange(false); toast({ title: "Session updated" }); }
      });
    } else {
      createNote.mutate(payload as any, {
        onSuccess: () => { onOpenChange(false); toast({ title: "Session logged!" }); }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-32px)] p-0 overflow-hidden rounded-[24px] border-border/50 max-h-[90vh] flex flex-col">
        <div className="p-6 pb-4 flex-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{isEditing ? "Edit Session" : "Log Training Session"}</DialogTitle>
            <DialogDescription>Record your notes and skills practiced.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Date</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className="w-full text-left font-normal rounded-xl h-11">{field.value ? format(field.value, "PPP") : "Pick a date"}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus /></PopoverContent></Popover>
                  </FormItem>
                )} />
                <FormField control={form.control} name="time" render={({ field }) => (
                  <FormItem className="w-32"><FormLabel>Time</FormLabel><FormControl><Input type="time" className="rounded-xl h-11" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="rating" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Rating</FormLabel><FormControl><div className="h-11 flex items-center"><StarRating value={field.value} onChange={field.onChange} /></div></FormControl></FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-foreground/80 font-medium">Skills & Drills Practiced</FormLabel>
                  <div className="flex items-center gap-2">
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
                </div>
                <Select onValueChange={addSkill}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Add a skill or drill..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allItems?.sort((a, b) => b.difficulty - a.difficulty).map(item => (
                      <SelectItem key={item.id} value={item.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{item.code}</Badge>
                          <span>{item.name}</span>
                          {item.isDrill === 1 && <span className="text-[10px] text-muted-foreground ml-auto">(Drill)</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="min-h-[150px] bg-secondary/10 rounded-xl border border-border/50 overflow-hidden">
                  <div className="bg-secondary/20 px-3 py-1.5 border-b border-border/50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total DD:</span>
                      <span className="text-xs font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-[300px] overflow-y-auto">
                    {(() => {
                      const rows: JSX.Element[] = [];
                      let currentConnection: SkillItem[] = [];
                      
                      const flushConnection = (idx: number) => {
                        if (currentConnection.length === 0) return;
                        const connectionIdx = idx - currentConnection.length;
                        const isSingle = currentConnection.length === 1;
                        rows.push(
                          <div key={`group-${connectionIdx}`} className={cn(
                            "p-2 space-y-2 border-y border-border/10",
                            isSingle ? "bg-transparent" : "bg-primary/5"
                          )}>
                            <div className="flex items-center justify-between px-1">
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest",
                                isSingle ? "text-muted-foreground/40" : "text-primary/60"
                              )}>
                                {isSingle ? "Single Practice" : "Connected Sequence"}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground">Reps:</span>
                                <div className="flex items-center border rounded-md bg-background overflow-hidden">
                                  <button 
                                    type="button" 
                                    className="h-5 px-1 hover:bg-secondary text-[10px] border-r"
                                    onClick={() => {
                                      const val = (currentConnection[0]?.reps || 1) - 1;
                                      const indices = currentConnection.map((_, i) => connectionIdx + i);
                                      updateReps(indices, val);
                                    }}
                                  >-</button>
                                  <Input 
                                    type="number" 
                                    className="h-5 w-8 text-[10px] p-0 text-center border-none shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                    value={currentConnection[0]?.reps || 1}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 1;
                                      const indices = currentConnection.map((_, i) => connectionIdx + i);
                                      updateReps(indices, val);
                                    }}
                                  />
                                  <button 
                                    type="button" 
                                    className="h-5 px-1 hover:bg-secondary text-[10px] border-l"
                                    onClick={() => {
                                      const val = (currentConnection[0]?.reps || 1) + 1;
                                      const indices = currentConnection.map((_, i) => connectionIdx + i);
                                      updateReps(indices, val);
                                    }}
                                  >+</button>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {currentConnection.map((item, subIdx) => {
                                const skill = allItems?.find(s => s.id === item.id);
                                const originalIdx = connectionIdx + subIdx;
                                return (
                                  <div key={originalIdx} className="flex items-center gap-1.5">
                                    <Badge variant="outline" className={cn(
                                      "font-mono text-[10px] bg-background pr-1 gap-1",
                                      !isSingle && "border-primary/30 text-primary"
                                    )}>
                                      {skill?.code}
                                      <button type="button" onClick={() => removeSkill(originalIdx)} className="hover:text-destructive transition-colors">
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </Badge>
                                    {subIdx < currentConnection.length - 1 && <span className="text-primary/30 text-xs">+</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                        currentConnection = [];
                      };

                      selectedSkills.forEach((item, index) => {
                        if (item.id === -1) {
                          flushConnection(index);
                          rows.push(
                            <div key={`sep-${index}`} className="flex items-center justify-between bg-muted/10 px-3 py-0.5 group transition-colors border-y border-border/10">
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">Next Set</span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeSkill(index)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        } else {
                          currentConnection.push(item);
                        }
                      });
                      flushConnection(selectedSkills.length);

                      if (rows.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 space-y-2">
                            <GripVertical className="w-6 h-6 opacity-20" />
                            <p className="text-xs font-medium">Select items or start a connection</p>
                          </div>
                        );
                      }
                      return rows;
                    })()}
                  </div>
                </div>
              </div>

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem><FormLabel>Notes & Reflections</FormLabel><FormControl><Textarea placeholder="How did the session go? Any takeaways?" className="rounded-xl min-h-[100px] bg-secondary/5 border-border/60" {...field} /></FormControl></FormItem>
              )} />

              <div className="pt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
                <Button type="submit" disabled={createNote.isPending || updateNote.isPending} className="rounded-xl px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                  {isEditing ? "Update Session" : "Log Training"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
