import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { type Note } from "@shared/schema";
import { useCreateNote, useUpdateNote } from "@/hooks/use-notes";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StarRating } from "./star-rating";

// We create a frontend-specific schema that handles Date objects nicely
// before transforming to the string format expected by the API if needed.
import { useSkills } from "@/hooks/use-skills";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, X } from "lucide-react";

const formSchema = z.object({
  date: z.date({
    required_error: "A date is required.",
  }),
  time: z.string().optional().nullable(),
  content: z.string().min(1, "Notes cannot be empty."),
  skillIds: z.array(z.number()).default([]),
  rating: z.number().min(1).max(5).optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteToEdit?: Note | null;
}

export function NoteDialog({ open, onOpenChange, noteToEdit }: NoteDialogProps) {
  const { toast } = useToast();
  const { data: allSkills } = useSkills();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const isEditing = !!noteToEdit;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      content: "",
      skillIds: [],
      rating: null,
    },
  });

  // Reset form when modal opens/closes or noteToEdit changes
  useEffect(() => {
    if (open) {
      if (noteToEdit) {
        form.reset({
          date: new Date(noteToEdit.date),
          time: noteToEdit.time || "",
          content: noteToEdit.content,
          skillIds: noteToEdit.skillIds || [],
          rating: noteToEdit.rating || null,
        });
      } else {
        form.reset({
          date: new Date(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          content: "",
          skillIds: [],
          rating: null,
        });
      }
    }
  }, [open, noteToEdit, form]);

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      date: values.date.toISOString(), 
      time: values.time || null,
      skillIds: values.skillIds,
      rating: values.rating || null,
    };

    if (isEditing && noteToEdit) {
      updateNote.mutate(
        { id: noteToEdit.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Session updated" });
            onOpenChange(false);
          },
          onError: (err) => {
            toast({ title: "Failed to update", description: err.message, variant: "destructive" });
          }
        }
      );
    } else {
      createNote.mutate(
        payload as any, 
        {
          onSuccess: () => {
            toast({ title: "Session logged successfully!" });
            onOpenChange(false);
          },
          onError: (err) => {
            toast({ title: "Failed to create", description: err.message, variant: "destructive" });
          }
        }
      );
    }
  };

  const isPending = createNote.isPending || updateNote.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-[24px] border-border/50">
        <div className="p-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">
              {isEditing ? "Edit Session" : "Log Training Session"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Record your notes, skills practiced, and how you felt about this session.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 pb-6 space-y-6">
            
            <div className="flex flex-col sm:flex-row gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col flex-1">
                    <FormLabel className="text-foreground/80 font-medium">Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal rounded-xl h-11 border-border/60 hover:bg-secondary/50",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                          className="rounded-xl"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem className="flex flex-col flex-1">
                    <FormLabel className="text-foreground/80 font-medium">Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="time" 
                        className="rounded-xl h-11 border-border/60 focus-visible:ring-primary/20"
                        {...field} 
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-foreground/80 font-medium">Session Rating</FormLabel>
                    <FormControl>
                      <div className="h-11 flex items-center">
                        <StarRating 
                          value={field.value} 
                          onChange={field.onChange} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="skillIds"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-foreground/80 font-medium text-base">Practiced Skills</FormLabel>
                  <div className="space-y-4">
                    <Select onValueChange={(val) => {
                      const id = parseInt(val);
                      if (!field.value.includes(id)) {
                        field.onChange([...field.value, id]);
                      }
                    }}>
                      <SelectTrigger className="rounded-xl h-11 border-border/60 focus-visible:ring-primary/20">
                        <SelectValue placeholder="Add a skill..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {allSkills?.map(skill => (
                          <SelectItem key={skill.id} value={skill.id.toString()}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px] h-4 px-1 leading-none shrink-0">
                                {skill.code}
                              </Badge>
                              <span>{skill.name}</span>
                              <span className="text-muted-foreground ml-auto text-[10px]">({skill.difficulty.toFixed(1)})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {field.value.length > 0 && (
                      <div className="border border-border/40 rounded-xl overflow-hidden bg-muted/5">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 border-b border-border/40">
                            <tr>
                              <th className="text-left py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px]">Skill</th>
                              <th className="text-center py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] w-12">Diff</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {field.value.map((id, idx) => {
                              const skill = allSkills?.find(s => s.id === id);
                              return (
                                <tr key={`${id}-${idx}`} className="group hover:bg-muted/40 transition-colors">
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="font-mono text-[10px] h-4 px-1 shrink-0">
                                        {skill?.code || "???"}
                                      </Badge>
                                      <span className="truncate max-w-[150px]">{skill?.name || "Unknown Skill"}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono text-xs font-medium">
                                    {skill?.difficulty.toFixed(1) || "0.0"}
                                  </td>
                                  <td className="py-2 px-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                                      onClick={() => {
                                        const newSkills = [...field.value];
                                        newSkills.splice(idx, 1);
                                        field.onChange(newSkills);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-muted/10 border-t border-border/40">
                            <tr>
                              <td className="py-2 px-3 font-bold text-xs">Total Difficulty</td>
                              <td className="py-2 px-3 text-center font-bold font-mono text-primary text-sm">
                                {field.value.reduce((acc, id) => {
                                  const skill = allSkills?.find(s => s.id === id);
                                  return acc + (skill?.difficulty || 0);
                                }, 0).toFixed(1)}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 font-medium">Notes & Reflections</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="How did the session go? What are your takeaways?"
                      className="resize-none rounded-xl min-h-[120px] border-border/60 focus-visible:ring-primary/20 p-3"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-2 flex justify-end gap-3">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="rounded-xl font-medium"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                className="rounded-xl font-semibold px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10 transition-all active:scale-[0.98]"
              >
                {isPending ? "Saving..." : isEditing ? "Save Changes" : "Log Session"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
