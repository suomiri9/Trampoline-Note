import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, Clock, Loader2, Trash2, GripVertical, MessageSquare, Copy, MoreVertical, Plus, Minus, X, Search, Shapes, ChevronDown, ChevronRight, Camera, Check, Merge, Split, Repeat, NotebookPen, Target, Dumbbell, Link2, Layers, Puzzle } from "lucide-react";
import { DialogHero } from "@/components/dialog-hero";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Note, type Skill } from "@shared/schema";
import { parseNoteSkills, calculateTotalDD, suggestRoutinePartName, skillDisplayCode, skillDisplayName, swapSkillIdToShape, swapSkillIdsToShape, shapeSwapInfo, isShapeableSkill, pickableSkills, buildRowsWithIndices, computeTurns, type SkillItem } from "@/lib/training-utils";
import { lineupOnDate } from "@shared/routine-versions";
import { useTrackTurns } from "@/hooks/use-track-turns";
import { SkillCode } from "@/components/skill-code";
import { ShapeSwapPicker } from "@/components/shape-swap-picker";
import { useDndSensors, useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { SortableChip } from "@/components/sortable-chip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SkillEditorOverlay } from "@/components/skill-editor-overlay";

import { useLocation } from "wouter";
import { useCreateNote, useUpdateNote } from "@/hooks/use-notes";
import { updateQueuedByTempId } from "@/lib/offline-queue";
import { useSkills } from "@/hooks/use-skills";
import { ShapeDraftsEditor, SHAPE_OPTIONS, type ShapeDraft } from "@/components/shape-drafts-editor";
import { useRecentSkills, addRecentSkill, useRecentEntries, addRecentEntry } from "@/hooks/use-recent-skills";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
import { useRoutines } from "@/hooks/use-routines";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { bottomNavClearance, cn } from "@/lib/utils";
import { compressDataUrl } from "@/lib/image-file";
import { persistBeforeClose, startLockedSave } from "@/lib/training-save-guard";
import { PhotoAreaSelect, type PhotoAreaSelectHandle } from "@/components/photo-area-select";
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
import { SearchPicker } from "@/components/search-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StarRating } from "./star-rating";

// Menu crops are compressed before sending (max long-side 1280px, max output
// 3.5 MB base64) so the full JSON body stays well within the server's limits.
const MENU_COMPRESS = { maxChars: 3.5 * 1024 * 1024, maxSide: 1280, qualities: [0.82, 0.65, 0.48, 0.35] };

const formSchema = z.object({
  date: z.date({
    required_error: "A date is required.",
  }),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  content: z.string().optional().default(""),
  skills: z.string().optional().nullable(), // Store as comma-separated IDs
  rating: z.number().min(1).max(5).optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteToEdit?: Note | null;
}


/** Height (px) of the viewport strip covered by the fixed bottom nav. The
 * nav sits at z-[60] — deliberately ABOVE dialogs and dropdowns — so a row
 * menu that extends down behind it becomes unreachable. This measures the
 * covered strip live (includes safe-area insets and nav size) so the menus'
 * collisionPadding makes Radix flip them upward before they slide under. */
function useBottomNavCoverPx(): number {
  const [px, setPx] = useState(96);
  useEffect(() => {
    const measure = () => setPx(bottomNavClearance());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return px;
}

function SortablePracticeGroup({ gId, isConnected, children }: { gId: string; isConnected: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: gId });
  return (
    <div
      ref={setNodeRef}
      data-practice-group={gId}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn("flex items-stretch border-b border-border/30 last:border-0", isConnected ? "border-l-[3px] border-l-red-400 bg-red-50/60 dark:bg-red-900/10" : "border-l-[3px] border-transparent")}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing flex items-center justify-center w-5 shrink-0 text-muted-foreground/55 hover:text-muted-foreground"
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
  const [, setLocation] = useLocation();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const { data: allItems, createSkill, updateSkill, isCreating: isCreatingSkill } = useSkills();
  const globalRecentSkillIds = useRecentSkills();
  const persistedRecentEntries = useRecentEntries();
  const { data: routines, createRoutine, isCreating: isCreatingRoutine } = useRoutines();
  const bottomNavCoverPx = useBottomNavCoverPx();
  
  const [selectedSkills, setSelectedSkills] = useState<SkillItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectMode, setIsConnectMode] = useState(false);
  const [editingRoutineIdx, setEditingRoutineIdx] = useState<number | null>(null);
  const [editingGroupIndices, setEditingGroupIndices] = useState<number[] | null>(null);
  const [showNewConn, setShowNewConn] = useState(false);
  const [showNewRoutine, setShowNewRoutine] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shapeSwapIndices, setShapeSwapIndices] = useState<number[] | null>(null);
  const [connShapeSwapOpen, setConnShapeSwapOpen] = useState(false);
  const [connSkillPickerOpen, setConnSkillPickerOpen] = useState(false);
  const [routineSkillPickerOpen, setRoutineSkillPickerOpen] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnSkillIds, setNewConnSkillIds] = useState<number[]>([]);
  const [newConnRoutineId, setNewConnRoutineId] = useState<number | null>(null);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineSkillIds, setNewRoutineSkillIds] = useState<number[]>([]);
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillCode, setNewSkillCode] = useState("");
  const [newSkillDD, setNewSkillDD] = useState("");
  const [newSkillIsDrill, setNewSkillIsDrill] = useState(false);
  const [newSkillShapes, setNewSkillShapes] = useState<ShapeDraft[]>([]);
  // Two-step quick-add New Skill/Drill: step 1 = basics, step 2 = optional shapes.
  const [newSkillStep, setNewSkillStep] = useState<1 | 2>(1);
  const [showNewPart, setShowNewPart] = useState(false);
  const [newPartRoutineId, setNewPartRoutineId] = useState<number | null>(null);
  const [newPartStart, setNewPartStart] = useState(1);
  const [newPartEnd, setNewPartEnd] = useState(10);
  const [newPartNameOverride, setNewPartNameOverride] = useState<string | null>(null);

  // ── Menu popup state ──────────────────────────────────────────────────────
  // step: "upload" → "crop" → "chat"
  const [menuPhotoDialogOpen, setMenuPhotoDialogOpen] = useState(false);
  const [menuStep, setMenuStep] = useState<"upload" | "crop" | "chat">("upload");
  const [menuPhotoLoading, setMenuPhotoLoading] = useState(false);
  const [menuPhotoFile, setMenuPhotoFile] = useState<File | null>(null);
  const [menuPhotoDataUrl, setMenuPhotoDataUrl] = useState<string | null>(null);
  const [menuCropDataUrl, setMenuCropDataUrl] = useState<string | null>(null);
  const menuCropRef = useRef<PhotoAreaSelectHandle>(null);
  const [menuCropCount, setMenuCropCount] = useState(0);
  type MenuChatMsg = { role: "user" | "assistant"; content: string };
  const [menuMessages, setMenuMessages] = useState<MenuChatMsg[]>([]);
  const [menuInput, setMenuInput] = useState("");
  // A draft item is plain skills OR a routine (routineId → app item {id:-2})
  // OR a frequent connection (fcId → app item {id:-3}).
  type MenuDraftItem = {
    skills: Array<{ skillId: number; code: string; name: string }>;
    reps: number;
    routineId?: number;
    fcId?: number;
    customSkillIds?: number[];
  };
  const [menuDraft, setMenuDraft] = useState<null | {
    items: MenuDraftItem[];
    unmatched: string[];
    noteText: string;
  }>(null);
  const [menuSuggestions, setMenuSuggestions] = useState<string[]>([]);
  // Review dialog (replaces the old /menu-review page)
  type ReviewItem = {
    skillIds: number[];
    codes: string[];
    names: string[];
    reps: number;
    routineId?: number;
    fcId?: number;
    customSkillIds?: number[];
  };
  const [menuReviewOpen, setMenuReviewOpen] = useState(false);
  const [menuReviewItems, setMenuReviewItems] = useState<ReviewItem[]>([]);
  const [menuReviewUnmatched, setMenuReviewUnmatched] = useState<string[]>([]);
  const [reviewPickerOpen, setReviewPickerOpen] = useState(false);
  const [reviewConnectMode, setReviewConnectMode] = useState(false);
  const [reviewEditingIdx, setReviewEditingIdx] = useState<number | null>(null);
  const menuChatEndRef = useRef<HTMLDivElement>(null);
  const menuPhotoRef = useRef<HTMLInputElement>(null);

  const pickerInputRef = useRef<HTMLInputElement>(null);
  const connSkillInputRef = useRef<HTMLInputElement>(null);
  const routineSkillInputRef = useRef<HTMLInputElement>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const groupPickerInputRef = useRef<HTMLInputElement>(null);
  useTypeToSearch(
    open && !showNewConn && !showNewRoutine && !showNewSkill && !showNewPart && editingRoutineIdx === null && editingGroupIndices === null,
    pickerOpen,
    pickerInputRef,
  );
  useTypeToSearch(open && showNewConn, connSkillPickerOpen, connSkillInputRef);
  useTypeToSearch(open && showNewRoutine, routineSkillPickerOpen, routineSkillInputRef);

  const recentEntries = (() => {
    if (!allItems) return [] as Array<{ kind: 'skill'; id: number } | { kind: 'routine'; id: number } | { kind: 'fc'; id: number }>;
    const seenKeys = new Set<string>();
    const out: Array<{ kind: 'skill'; id: number } | { kind: 'routine'; id: number } | { kind: 'fc'; id: number }> = [];
    const keyOf = (kind: 'skill' | 'routine' | 'fc', id: number) => kind === 'routine' ? `r-${id}` : kind === 'fc' ? `f-${id}` : `s-${id}`;
    const existsFor = (kind: 'skill' | 'routine' | 'fc', id: number) => kind === 'routine' ? !!routines?.some(r => r.id === id) : allItems.some(s => s.id === id);
    const pushEntry = (kind: 'skill' | 'routine' | 'fc', id: number) => {
      const k = keyOf(kind, id);
      if (!seenKeys.has(k) && existsFor(kind, id)) { seenKeys.add(k); out.push({ kind, id }); }
    };
    // Persisted recents survive deletion from the practice list
    for (const ent of persistedRecentEntries) {
      pushEntry(ent.kind, ent.id);
      if (out.length >= 8) return out;
    }
    // Plus anything currently in the practice list (covers notes opened for editing)
    for (let i = selectedSkills.length - 1; i >= 0; i--) {
      const item = selectedSkills[i];
      if (item.id > 0) pushEntry('skill', item.id);
      else if (item.id === -2 && item.routineId) pushEntry('routine', item.routineId);
      else if (item.id === -3 && item.fcId) pushEntry('fc', item.fcId);
      if (out.length >= 8) break;
    }
    return out;
  })();

  const sensors = useDndSensors();
  const longPressSensors = useLongPressDndSensors();
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const practiceListRef = useRef<HTMLDivElement>(null);
  const prevSkillsRef = useRef<SkillItem[]>([]);

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
  const [trackTurns] = useTrackTurns();
  const turnInfo = computeTurns(selectedSkills);

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
    if (!open) {
      prevSkillsRef.current = [];
      return;
    }
    const prev = prevSkillsRef.current;
    const next = selectedSkills;
    prevSkillsRef.current = next;
    if (next.length > prev.length) {
      const el = practiceListRef.current;
      if (!el) return;
      // Scroll to the row that actually received the new item(s), not blindly
      // to the list end: growth paths (append, duplicate-below, add-to-group)
      // keep untouched rows' object identity, so the first index where the
      // arrays diverge is the insertion point.
      let d = 0;
      while (d < prev.length && prev[d] === next[d]) d++;
      let j = d; // first inserted non-separator item
      while (j < next.length && next[j].id === -1) j++;
      // Rendered row index containing j, and total row count (rows split on -1)
      let gIdx = -1;
      let total = 0;
      let inGroup = false;
      for (let i = 0; i < next.length; i++) {
        if (next[i].id === -1) { inGroup = false; continue; }
        if (!inGroup) { inGroup = true; total++; }
        if (i === j) gIdx = total - 1;
      }
      requestAnimationFrame(() => {
        // Appends, initial load, and anything landing in the last row keep the
        // old scroll-to-bottom behavior; mid-list insertions center their row.
        const row = prev.length > 0 && gIdx >= 0 && gIdx < total - 1
          ? (el.querySelector(`[data-practice-group="group-${gIdx}"]`) as HTMLElement | null)
          : null;
        if (row) {
          const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top
            + el.scrollTop - el.clientHeight / 2 + row.clientHeight / 2;
          el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
        } else {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      });
    }
  }, [selectedSkills, open]);

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
        });
      } else {
        setSelectedSkills([]);
        setIsConnectMode(false);
        setShowNewConn(false);
        setShowNewRoutine(false);
        setNewConnName("");
        setNewConnSkillIds([]);
        setNewConnRoutineId(null);
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
        });
      }
    }
  }, [open, noteToEdit, form]);

  // `known` lets create-then-add flows (e.g. the New Routine Part button) pass
  // the freshly created item, since the allItems cache may not have it yet —
  // without it a new part would be added as a plain skill row (wrong badge).
  // Heal legacy rows: a connection/part that got added as a plain skill row
  // (added before the cache knew the item, older sessions) is converted into
  // a proper PART/CONN entry so it renders and edits like the others.
  useEffect(() => {
    if (!open || !allItems) return;
    setSelectedSkills(prev => {
      let changed = false;
      const ns = prev.map(it => {
        if (it.id > 0 && (it as any).fcId === undefined) {
          const s = allItems.find(x => x.id === it.id);
          if (s && (s.isDrill === 2 || s.isDrill === 3) && s.skillIds) {
            changed = true;
            return { ...it, id: -3, fcId: s.id, fcName: s.name, customSkillIds: s.skillIds } as any;
          }
        }
        return it;
      });
      if (!changed) return prev;
      form.setValue('skills', JSON.stringify(ns));
      return ns;
    });
  }, [open, allItems, form]);

  const addSkill = (idStr: string, known?: Skill) => {
    const id = parseInt(idStr);
    const fcItem =
      (known && known.id === id && (known.isDrill === 2 || known.isDrill === 3) ? known : undefined) ??
      allItems?.find(s => s.id === id && (s.isDrill === 2 || s.isDrill === 3));
    addRecentEntry({ kind: fcItem ? 'fc' : 'skill', id });
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
    addRecentEntry({ kind: 'routine', id: routineId });

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

  const openMenuPhotoDialog = () => {
    setMenuPhotoFile(null);
    setMenuPhotoDataUrl(null);
    setMenuCropDataUrl(null);
    setMenuMessages([]);
    setMenuInput("");
    setMenuDraft(null);
    setMenuStep("upload");
    setMenuPhotoDialogOpen(true);
  };

  const pickMenuPhotoFile = (file: File) => {
    setMenuPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setMenuPhotoDataUrl(String(reader.result));
      setMenuStep("crop");
    };
    reader.readAsDataURL(file);
  };

  const proceedToChat = async () => {
    const raw = menuCropRef.current?.buildCropDataUrl() ?? menuPhotoDataUrl;
    if (!raw) return;
    setMenuPhotoLoading(true);
    let cropUrl: string;
    try {
      cropUrl = await compressDataUrl(raw, MENU_COMPRESS);
    } catch (e: any) {
      toast({ title: "Image error", description: e.message, variant: "destructive" });
      setMenuPhotoLoading(false);
      return;
    }
    setMenuCropDataUrl(cropUrl);
    setMenuMessages([]);
    setMenuInput("");
    setMenuDraft(null);
    setMenuStep("chat");
    // Fire first AI turn immediately (loading stays true until sendMenuChat finishes)
    sendMenuChat(cropUrl, [{ role: "user", content: "Please read this training menu and help me turn it into a practice list." }]);
  };

  const sendMenuChat = async (
    cropUrl: string,
    msgs: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    setMenuPhotoLoading(true);
    try {
      const res = await fetch("/api/coach/menu-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cropDataUrl: cropUrl, messages: msgs }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "AI unavailable.");
      }
      const { reply, draft, suggestions, guideUpdated } = await res.json() as {
        reply: string;
        draft: null | { date: string; items: MenuDraftItem[]; unmatched: string[]; noteText: string };
        suggestions?: string[];
        guideUpdated?: boolean;
      };
      setMenuMessages(prev => [...prev, { role: "assistant", content: reply }]);
      if (draft) setMenuDraft(draft);
      setMenuSuggestions(draft ? [] : (suggestions ?? []));
      if (guideUpdated) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({ title: "Menu notation saved", description: "I'll remember that next time. Review or edit it in Settings." });
      }
      setTimeout(() => menuChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err: any) {
      toast({ title: "AI error", description: err?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setMenuPhotoLoading(false);
    }
  };

  const submitMenuMessage = (overrideText?: string) => {
    const text = (overrideText ?? menuInput).trim();
    if (!text || menuPhotoLoading || !menuCropDataUrl) return;
    const newMsg: { role: "user" | "assistant"; content: string } = { role: "user", content: text };
    const updated = [...menuMessages, newMsg];
    setMenuMessages(updated);
    setMenuInput("");
    setMenuSuggestions([]);
    setTimeout(() => menuChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
    sendMenuChat(menuCropDataUrl, updated);
  };

  // Navigate to the review page with the current draft
  const goToReview = () => {
    // Load the AI draft into the review list when one exists; otherwise open
    // the review with whatever is already there (possibly empty) so the athlete
    // can always jump in and add items manually.
    if (menuDraft && menuDraft.items.length > 0) {
      const items = menuDraft.items.map(it => ({
        skillIds: it.skills.map(s => s.skillId),
        codes: it.skills.map(s => s.code),
        names: it.skills.map(s => s.name),
        reps: it.reps,
        routineId: it.routineId,
        fcId: it.fcId,
        customSkillIds: it.customSkillIds,
      }));
      setMenuReviewItems(items);
      setMenuReviewUnmatched(menuDraft.unmatched);
    }
    setReviewConnectMode(false);
    setReviewEditingIdx(null);
    setMenuReviewOpen(true);
  };

  const addReviewEntry = (entry: Omit<ReviewItem, "reps">) => {
    setMenuReviewItems(prev => [...prev, { ...entry, reps: 1 }]);
    setReviewPickerOpen(false);
  };

  const confirmMenuReview = () => {
    const incoming: SkillItem[] = [];
    menuReviewItems.forEach((it, i) => {
      if (i > 0) incoming.push({ id: -1 });
      if (it.routineId != null) {
        incoming.push({
          id: -2,
          routineId: it.routineId,
          customSkillIds: it.customSkillIds ?? [],
          ...(it.reps > 1 ? { reps: it.reps } : {}),
        });
        return;
      }
      if (it.fcId != null) {
        incoming.push({
          id: -3,
          fcId: it.fcId,
          customSkillIds: it.customSkillIds ?? [],
          ...(it.reps > 1 ? { reps: it.reps } : {}),
        });
        return;
      }
      it.skillIds.forEach((sid) => {
        incoming.push(it.reps > 1 ? { id: sid, reps: it.reps } : { id: sid });
      });
    });
    if (incoming.length > 0) {
      setSelectedSkills(prev => {
        const newSkills = [...prev];
        if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) newSkills.push({ id: -1 });
        newSkills.push(...incoming);
        form.setValue("skills", JSON.stringify(newSkills));
        return newSkills;
      });
      toast({ title: `Added ${menuReviewItems.length} item${menuReviewItems.length !== 1 ? "s" : ""} from menu` });
    }
    setMenuReviewOpen(false);
    setMenuPhotoDialogOpen(false);
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

  // Insert a shape-swapped copy of a group directly below the original, swapping
  // every shapeable plain skill to `shape` and leaving everything else as-is.
  const duplicateGroupWithShape = (groupIndices: number[], shape: string) => {
    setSelectedSkills(prev => {
      const newSkills = [...prev];
      const lastIdx = groupIndices[groupIndices.length - 1];
      const groupItems = groupIndices.map(i => {
        const item = { ...prev[i] };
        if (item.id > 0) {
          const swapped = swapSkillIdToShape(item.id, shape, allItems);
          if (swapped != null) item.id = swapped;
        }
        return item;
      });
      const toInsert = [{ id: -1 } as SkillItem, ...groupItems];
      newSkills.splice(lastIdx + 1, 0, ...toInsert);
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  // ---- Turn grouping (rows joined into the same trampoline turn) ----
  const nextTurnMarker = (items: SkillItem[]) =>
    items.reduce((m, it) => (typeof it.turn === "number" && it.turn >= m ? it.turn + 1 : m), 1);

  // Join row `rowIdx` to the previous row's turn.
  const joinTurnWithPrevious = (rowIdx: number) => {
    setSelectedSkills(prev => {
      const rows = buildRowsWithIndices(prev);
      if (rowIdx <= 0 || rowIdx >= rows.length) return prev;
      const newSkills = prev.map(it => ({ ...it }));
      const prevRowFirst = rows[rowIdx - 1].indices[0];
      let marker = newSkills[prevRowFirst].turn;
      if (typeof marker !== "number") {
        marker = nextTurnMarker(prev);
        newSkills[prevRowFirst].turn = marker;
      }
      newSkills[rows[rowIdx].indices[0]].turn = marker;
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  // Split row `rowIdx` back out into its own turn.
  const splitTurnFromPrevious = (rowIdx: number) => {
    setSelectedSkills(prev => {
      const rows = buildRowsWithIndices(prev);
      if (rowIdx < 0 || rowIdx >= rows.length) return prev;
      const newSkills = prev.map((it, idx) => {
        if (idx === rows[rowIdx].indices[0] && it.turn !== undefined) {
          const { turn: _t, ...rest } = it;
          return rest as SkillItem;
        }
        return { ...it };
      });
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  // Copy every row of the LAST turn as a brand-new turn appended at the end.
  const duplicateLastTurn = () => {
    setSelectedSkills(prev => {
      const rows = buildRowsWithIndices(prev);
      if (rows.length === 0) return prev;
      const { rowTurns, totalTurns } = computeTurns(prev);
      const lastTurnRows = rows.filter((_, i) => rowTurns[i] === totalTurns);
      if (lastTurnRows.length === 0) return prev;
      const marker = lastTurnRows.length > 1 ? nextTurnMarker(prev) : undefined;
      const newSkills = [...prev];
      lastTurnRows.forEach((row) => {
        if (newSkills.length > 0 && newSkills[newSkills.length - 1].id !== -1) {
          newSkills.push({ id: -1 });
        }
        row.items.forEach((it, i) => {
          const copy: SkillItem = { ...it };
          delete copy.turn;
          if (i === 0 && marker !== undefined) copy.turn = marker;
          newSkills.push(copy);
        });
      });
      form.setValue('skills', JSON.stringify(newSkills));
      return newSkills;
    });
  };

  // A group qualifies for shape-swap only when every member is a plain skill
  // (no routine/conn chips, ids -2/-3) and at least one is shapeable.
  const groupIsPlainSkills = (indices: number[]) =>
    indices.every(i => { const it = selectedSkills[i]; return !!it && it.id > 0; });
  const groupHasShapeable = (indices: number[]) =>
    indices.some(i => {
      const it = selectedSkills[i];
      return !!it && it.id > 0 && isShapeableSkill(allItems?.find(s => s.id === it.id));
    });
  const canShapeSwapGroup = (indices: number[]) =>
    groupIsPlainSkills(indices) && groupHasShapeable(indices);

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
      const newSkills = prev.map((item, idx): SkillItem => {
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
        const cleaned = newSkills.map((s): SkillItem => {
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
    // Focus the new note input and KEEP it: when the row's ⋮ menu unmounts,
    // the dialog's focus scope restores focus to the previously-focused
    // element — usually the skill search bar. On iOS the menu's exit
    // animation delays that restore past a one-shot focus(), so the search
    // bar ends up with the keyboard. Re-assert focus until the dust settles.
    const startedAt = Date.now();
    let scrolled = false;
    const claim = () => {
      const el = document.querySelector(`[data-testid="input-skill-note-${noteIdx}"]`) as HTMLInputElement | null;
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const container = practiceListRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const target = elRect.top - containerRect.top + container.scrollTop - (container.clientHeight / 2) + (el.clientHeight / 2);
            container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
          }
        }
        if (document.activeElement !== el) el.focus();
      }
      if (Date.now() - startedAt < 600) setTimeout(claim, 80);
    };
    setTimeout(claim, 60);
  };

  // Routine lineups are resolved against the session's own day (athlete-local),
  // so editing an old note shows the lineup that was actually trained then —
  // not today's version of the routine.
  const watchedDate = form.watch("date");
  const noteDay = watchedDate instanceof Date && !isNaN(watchedDate.getTime())
    ? format(watchedDate, "yyyy-MM-dd")
    : undefined;
  const routineLineupFor = (routineId: number | undefined): number[] => {
    const r = routines?.find(rt => rt.id === routineId);
    return r ? lineupOnDate(r.skillIds, r.versions, noteDay) : [];
  };

  const totalDifficulty = calculateTotalDD(selectedSkills, allItems, routines, noteDay);

  const onSubmit = async (values: FormValues) => {
    setSaveError(null);
    let payload: any;
    try {
      payload = {
        ...values,
        date: format(values.date, "yyyy-MM-dd"),
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        skills: JSON.stringify(selectedSkills) || null,
        rating: values.rating || null,
      };
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : "Bad form data.",
        variant: "destructive",
      });
      setSaveError(e instanceof Error ? e.message : "The session data could not be prepared. Please check it and try again.");
      return;
    }

    let result: unknown;
    const saved = await persistBeforeClose(
      async () => {
        if (isEditing && noteToEdit) {
          // Pending offline entries have negative ids (queue tempIds) and live
          // only in IndexedDB until the queue drains. Editing one rewrites the
          // queued payload instead of hitting the server.
          if (noteToEdit.id < 0) {
            const updated = await updateQueuedByTempId(noteToEdit.id, payload);
            if (!updated) throw new Error("This pending entry could not be found locally.");
            return { pendingEntryUpdated: true };
          }
          return await updateNote.mutateAsync({ id: noteToEdit.id, ...payload });
        }
        return await createNote.mutateAsync(payload as any);
      },
      (confirmedResult) => {
        result = confirmedResult;
        onOpenChange(false);
      },
      (err) => {
        const fallback = "Your session is still here. Check your connection and try End training again.";
        const detail = err instanceof Error && err.message ? err.message : fallback;
        setSaveError(`${detail} Your session has not been discarded.`);
      },
    );

    if (saved) {
      const pendingEntryUpdated = !!(result && typeof result === "object" && "pendingEntryUpdated" in result);
      const queued = !!(result && typeof result === "object" && "_queuedOffline" in result);
      toast({
        title: pendingEntryUpdated
          ? "Pending session updated"
          : queued
            ? "Saved offline. Will sync when reconnected."
            : isEditing
              ? "Session updated"
              : "Session logged!",
      });
    } else {
      const fallback = "Your session is still here. Check your connection and try End training again.";
      toast({
        title: isEditing ? "Couldn't update session" : "Couldn't log session",
        description: fallback,
        variant: "destructive",
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
    setSaveError(`${firstMessage ?? "Please check the highlighted fields."} Your session is still open so you can correct it.`);
    if (errors.date) setNoteStep(1);
  };

  const [noteStep, setNoteStep] = useState<1 | 2 | 3>(1);
  const isSavingRef = useRef(false);
  useEffect(() => {
    if (open) {
      setNoteStep(1);
      setSaveError(null);
      setDiscardConfirmOpen(false);
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [open]);

  // If the user navigates with the bottom nav (which sits above the dialog)
  // while this dialog is open, close it — otherwise it stays stuck over the
  // new page and leaks the body scroll lock ("black screen" bug).
  const [currentLocation] = useLocation();
  const openedAtLocationRef = useRef(currentLocation);
  useEffect(() => {
    if (open) openedAtLocationRef.current = currentLocation;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && currentLocation !== openedAtLocationRef.current) {
      handleOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation]);

  const hasUnsavedContent = () => {
    const v = form.getValues();
    return !!(v.content || selectedSkills.length > 0 || v.startTime || v.endTime || v.rating || form.formState.isDirty);
  };

  // The lock is set synchronously, before react-query updates isPending, so
  // rapid repeated taps can never start two create/update requests.
  const flushDraftSave = (): boolean => {
    if (isSavingRef.current) return false;
    if (!hasUnsavedContent()) {
      onOpenChange(false);
      return false;
    }
    return startLockedSave(
      isSavingRef,
      setIsSaving,
      form.handleSubmit(onSubmit, onInvalid as any),
    );
  };
  // Cleanup closures capture the render they were created in, so the
  // unmount effect reads the LATEST flush + open state through refs.
  const flushDraftSaveRef = useRef(flushDraftSave);
  flushDraftSaveRef.current = flushDraftSave;
  const openRef = useRef(open);
  openRef.current = open;

  // The location-watcher effect above only runs while this component stays
  // mounted. When the HOST PAGE unmounts — the bottom nav sits above the
  // dialog, so tapping e.g. Skills unmounts home and this dialog in one
  // commit — React runs only cleanups, never that effect. This cleanup is
  // therefore the last chance to save: without it, an open editor's session
  // draft is silently destroyed and no request ever leaves the device
  // (real training sessions have been lost this way). The started mutation
  // and offline-queue writes run to completion after unmount.
  useEffect(() => {
    return () => {
      if (openRef.current) flushDraftSaveRef.current();
    };
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isSavingRef.current) return;
    if (!newOpen && hasUnsavedContent()) {
      setDiscardConfirmOpen(true);
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] md:max-w-[680px] w-[calc(100vw-32px)] p-0 rounded-[24px] border-white/[0.07] max-h-[90vh] max-h-[90dvh] sm:max-h-[82vh] sm:max-h-[82dvh] flex flex-col overflow-clip">
        <div className="p-6 pb-4 flex-none">
          <DialogHero
            icon={NotebookPen}
            eyebrow="Training log"
            title={isEditing ? "Edit session" : "Log session"}
            description="Record your notes and skills practiced."
          />
          <div className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.03]" role="tablist" aria-label="Session form steps">
            {([1, 2, 3] as const).map((s, i) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={noteStep === s}
                onClick={() => setNoteStep(s)}
                className={cn(
                  "h-8 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-colors",
                  noteStep === s ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground",
                )}
                data-testid={["tab-note-start","tab-note-skills","tab-note-finish"][i]}
              >
                {["1 · Start","2 · Skills","3 · Finish"][i]}
              </button>
            ))}
          </div>
        </div>

        <div ref={dialogBodyRef} className="flex-1 overflow-scroll-touch min-h-0 px-6 pb-6 text-foreground">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid as any)} className="space-y-6">
              <div className={cn("space-y-4", noteStep !== 1 && "hidden")}>
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className="w-full text-left font-normal rounded-xl h-11 font-mono">
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
                </div>
              </div>

              <div className={cn("space-y-3", noteStep !== 2 && "hidden")}>
                <FormLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Skills & drills practiced</FormLabel>

                <div className="flex flex-wrap gap-2">
                  <div className="flex w-full sm:w-auto sm:flex-1 min-w-0 sm:basis-0 h-11 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <SearchPicker
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    placeholder="Search skills or add new..."
                    container={dialogBodyRef.current}
                    className="flex-1 h-full"
                    inputClassName="text-xs"
                    inputTestId="btn-open-picker"
                    inputRef={pickerInputRef}
                  >
                        <CommandList className="max-h-[320px]">
                          <CommandEmpty>No matches.</CommandEmpty>
                          {(() => {
                            const sortFn = (a: Skill, b: Skill) => {
                              const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                              if (oA !== oB) return oA - oB;
                              return b.difficulty - a.difficulty;
                            };
                            const skillsList = pickableSkills(allItems, 0).slice().sort(sortFn);
                            const drillsList = pickableSkills(allItems, 1).slice().sort(sortFn);
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
                                        value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} skill`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-skill-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(item, allItems)}</span>
                                        <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {drillsList.length > 0 && (
                                  <CommandGroup heading="Drills">
                                    {drillsList.map(item => (
                                      <CommandItem
                                        key={`d-${item.id}`}
                                        value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} drill`}
                                        onSelect={() => { addSkill(item.id.toString()); setPickerOpen(false); }}
                                        data-testid={`pick-drill-${item.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(item, allItems)}</span>
                                        <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
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
                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Part</span>
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
                  </SearchPicker>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="shrink-0 px-3 flex items-center justify-center border-l border-input text-muted-foreground hover-elevate active-elevate-2" data-testid="btn-new-item" aria-label="Add new"><Plus className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-xl">
                      <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => { setShowNewSkill(true); setShowNewConn(false); setShowNewRoutine(false); setShowNewPart(false); setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(false); setNewSkillShapes([]); setNewSkillStep(1); }} data-testid="menu-new-skill">New Skill</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-yellow-600 dark:text-yellow-400" onClick={() => { setShowNewSkill(true); setShowNewConn(false); setShowNewRoutine(false); setShowNewPart(false); setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(true); setNewSkillShapes([]); setNewSkillStep(1); }} data-testid="menu-new-drill">New Drill</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-destructive" onClick={() => { setShowNewConn(true); setShowNewSkill(false); setShowNewRoutine(false); setShowNewPart(false); setNewConnName(""); setNewConnSkillIds([]); setNewConnRoutineId(null); }} data-testid="menu-new-connection">New Connection</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-primary" onClick={() => { setShowNewRoutine(true); setShowNewConn(false); setShowNewSkill(false); setShowNewPart(false); setNewRoutineName(""); setNewRoutineSkillIds([]); }} data-testid="menu-new-routine">New Routine</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-xs text-muted-foreground" onClick={() => { setShowNewPart(true); setShowNewConn(false); setShowNewSkill(false); setShowNewRoutine(false); setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); }} data-testid="menu-new-part">New Routine Part</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                  <Button
                    type="button"
                    variant={isConnectMode ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-11 shrink-0 px-3 text-[10px] font-bold uppercase tracking-wider rounded-xl",
                      isConnectMode ? "bg-red-500 text-white shadow-md hover:bg-red-600" : "border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    )}
                    onClick={() => setIsConnectMode(!isConnectMode)}
                    data-testid="btn-connect-next"
                    title="Link the next picked skill to the previous one as a connection"
                  >
                    {isConnectMode ? "Linking..." : "+ Link"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0 px-3 rounded-xl gap-1.5 text-[10px] font-bold uppercase tracking-wider border-primary/40 text-primary hover:bg-primary/10 hover:border-primary dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10"
                    onClick={openMenuPhotoDialog}
                    data-testid="btn-menu-photo"
                    title="Read a training menu photo and add skills to the practice list"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Scan menu
                  </Button>

                  {/* ── Menu Photo Dialog ── */}
                  <Dialog open={menuPhotoDialogOpen} onOpenChange={(o) => { if (!o && !menuPhotoLoading) setMenuPhotoDialogOpen(false); }}>
                    <DialogContent aria-describedby={undefined} className="sm:max-w-lg max-h-[80dvh] top-[calc(50%-2rem)] flex flex-col gap-0 p-0 overflow-hidden">
                      {/* Header */}
                      <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b">
                        <DialogTitle className="flex items-center gap-2 text-sm">
                          <Camera className="h-4 w-4 text-primary" />
                          {menuStep === "upload" && "Pick a menu photo"}
                          {menuStep === "crop" && "Select the area to read"}
                          {menuStep === "chat" && "Review with AI"}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="flex-1 overflow-y-auto flex flex-col">

                        {/* ── Step 1: Upload ── */}
                        {menuStep === "upload" && (
                          <div className="p-4 flex flex-col gap-4">
                            <div
                              className="relative rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer select-none"
                              onClick={() => menuPhotoRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const f = e.dataTransfer.files?.[0];
                                if (f && f.type.startsWith("image/")) pickMenuPhotoFile(f);
                              }}
                              data-testid="menu-photo-dropzone"
                            >
                              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                                <Camera className="h-10 w-10 opacity-30" />
                                <p className="text-sm font-medium">Tap to pick a photo</p>
                                <p className="text-xs opacity-60">or drag one in · jpg, png, webp</p>
                              </div>
                            </div>
                            <input ref={menuPhotoRef} type="file" accept="image/*" className="hidden" aria-hidden="true"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickMenuPhotoFile(f); }}
                              data-testid="input-menu-photo" />
                          </div>
                        )}

                        {/* ── Step 2: Crop ── */}
                        {/* Stays mounted (hidden) during the chat step so "← Back" keeps the drawn areas. */}
                        {menuPhotoDataUrl && (menuStep === "crop" || menuStep === "chat") && (
                          <div className={menuStep === "crop" ? "p-4" : "hidden"}>
                            <PhotoAreaSelect
                              ref={menuCropRef}
                              photoDataUrl={menuPhotoDataUrl}
                              active={menuStep === "crop"}
                              testIdPrefix="menu-crop"
                              topHint="Draw a rectangle over the part of the menu you want the AI to read. Skip to use the whole photo."
                              bottomHint="Draw rectangles on the photo to select the areas you want the AI to read. You can select multiple."
                              onSelectionChange={setMenuCropCount}
                            />
                          </div>
                        )}

                        {/* ── Step 3: Chat ── */}
                        {menuStep === "chat" && (
                          <div className="flex flex-col flex-1 min-h-0">
                            {/* Crop thumbnail */}
                            {menuCropDataUrl && (
                              <div className="px-4 pt-3 pb-2 shrink-0">
                                <img src={menuCropDataUrl} alt="Crop" className="max-h-28 rounded-lg border object-contain" />
                              </div>
                            )}
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-2" style={{ minHeight: 120 }}>
                              {menuMessages.map((m, i) => (
                                <div key={i} className={cn("rounded-xl px-3 py-2 text-sm max-w-[85%]",
                                  m.role === "user"
                                    ? "self-end bg-primary text-primary-foreground ml-auto"
                                    : "self-start bg-muted text-foreground"
                                )}>
                                  {/* Strip the draft_entry block from assistant messages */}
                                  {m.role === "assistant"
                                    ? m.content.replace(/```draft_entry[\s\S]*?```/g, "").trim() || "(Draft ready — see below)"
                                    : m.content
                                  }
                                </div>
                              ))}
                              {menuPhotoLoading && (
                                <div className="self-start bg-muted rounded-xl px-3 py-2 flex items-center gap-2">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">Reading…</span>
                                </div>
                              )}
                              <div ref={menuChatEndRef} />
                            </div>
                            {/* Draft-ready banner — only when the AI has produced items */}
                            {menuDraft && menuDraft.items.length > 0 && (
                              <div className="mx-4 mb-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
                                <p className="text-xs font-medium text-primary">{menuDraft.items.length} item{menuDraft.items.length !== 1 ? "s" : ""} ready</p>
                                <Button size="sm" className="h-7 rounded-lg text-xs" onClick={goToReview} data-testid="btn-menu-review">
                                  Review &amp; add →
                                </Button>
                              </div>
                            )}
                            {/* Quick-reply suggestions */}
                            {menuSuggestions.length > 0 && !menuPhotoLoading && (
                              <div className="px-4 pb-2 shrink-0 flex flex-wrap gap-1.5">
                                {menuSuggestions.map((s, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => submitMenuMessage(s)}
                                    className="rounded-xl border border-primary/40 bg-primary/5 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/15 transition-colors"
                                    data-testid={`btn-menu-suggestion-${i}`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                            {/* Input */}
                            <div className="px-4 py-3 border-t shrink-0 flex gap-2">
                              <input
                                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                                placeholder="Reply to the AI…"
                                value={menuInput}
                                onChange={(e) => setMenuInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitMenuMessage(); } }}
                                disabled={menuPhotoLoading}
                                data-testid="input-menu-chat"
                              />
                              <Button size="sm" className="rounded-xl shrink-0" onClick={() => submitMenuMessage()} disabled={!menuInput.trim() || menuPhotoLoading} data-testid="btn-menu-chat-send">
                                Send
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="shrink-0 flex justify-between gap-2 px-4 py-3 border-t">
                        <Button type="button" variant="outline" size="sm" className="rounded-xl"
                          onClick={() => {
                            if (menuStep === "crop") { setMenuStep("upload"); }
                            else if (menuStep === "chat") { setMenuStep("crop"); }
                            else { setMenuPhotoDialogOpen(false); }
                          }}
                          disabled={menuPhotoLoading}
                          data-testid="btn-menu-back"
                        >
                          {menuStep === "upload" ? "Cancel" : "← Back"}
                        </Button>
                        {menuStep === "crop" && (
                          <Button type="button" size="sm" className="rounded-xl gap-1.5"
                            onClick={proceedToChat}
                            data-testid="btn-menu-proceed"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            {menuCropCount > 1 ? `Use ${menuCropCount} areas` : menuCropCount === 1 ? "Use selection" : "Use whole photo"}
                          </Button>
                        )}
                        {menuStep === "chat" && !(menuDraft && menuDraft.items.length > 0) && (
                          <Button type="button" variant="outline" size="sm" className="rounded-xl"
                            onClick={goToReview}
                            data-testid="btn-menu-review"
                          >
                            Do manually
                          </Button>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* ── Menu review Dialog ── */}
                  <Dialog open={menuReviewOpen} onOpenChange={o => { if (!o) { setMenuReviewOpen(false); setReviewConnectMode(false); setReviewEditingIdx(null); } }}>
                    <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[80dvh] top-[calc(50%-2rem)] flex flex-col p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
                      <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
                        <div className="flex items-center justify-between gap-2 pr-8">
                          <DialogTitle className="text-sm font-bold uppercase tracking-wider font-mono">Review menu</DialogTitle>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {menuReviewItems.length} item{menuReviewItems.length !== 1 ? "s" : ""}
                              {menuReviewUnmatched.length > 0 && ` · ${menuReviewUnmatched.length} unmatched`}
                            </span>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
                        {/* Left: crop photo */}
                        {menuCropDataUrl && (
                          <div className="sm:w-2/5 sm:border-r border-b sm:border-b-0 p-3 flex items-start justify-center overflow-y-auto shrink-0">
                            <img src={menuCropDataUrl} alt="Menu" className="w-full rounded-lg border object-contain max-h-48 sm:max-h-none" />
                          </div>
                        )}

                        {/* Right: editable list */}
                        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                          <div className="flex gap-2 shrink-0 items-stretch">
                          <div className="flex h-11 flex-1 min-w-0 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                            <SearchPicker
                              open={reviewPickerOpen}
                              onOpenChange={setReviewPickerOpen}
                              placeholder="Search skills to add..."
                              className="flex-1 h-full"
                              inputClassName="text-xs"
                              inputTestId="input-review-add-skill"
                            >
                              <CommandList className="max-h-[260px]">
                                <CommandEmpty>No matches.</CommandEmpty>
                                {(() => {
                                  const sortFn = (a: Skill, b: Skill) => {
                                    const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                                    if (oA !== oB) return oA - oB;
                                    return b.difficulty - a.difficulty;
                                  };
                                  const skillsList = pickableSkills(allItems, 0).slice().sort(sortFn);
                                  const drillsList = pickableSkills(allItems, 1).slice().sort(sortFn);
                                  const connList = (allItems || []).filter(s => s.isDrill === 2 && s.skillIds && s.archived !== 1);
                                  const partList = (allItems || []).filter(s => s.isDrill === 3 && s.skillIds && s.archived !== 1);
                                  const routineList = (routines || []).filter(r => r.archived !== 1);
                                  const pickSkill = (item: Skill) => {
                                    if (reviewConnectMode) {
                                      setMenuReviewItems(prev => {
                                        const last = prev[prev.length - 1];
                                        if (last && last.fcId == null && last.routineId == null) {
                                          const merged = {
                                            ...last,
                                            skillIds: [...last.skillIds, item.id],
                                            codes: [...last.codes, skillDisplayCode(item, allItems)],
                                            names: [...last.names, skillDisplayName(item, allItems)],
                                          };
                                          return [...prev.slice(0, -1), merged];
                                        }
                                        return [...prev, { skillIds: [item.id], codes: [skillDisplayCode(item, allItems)], names: [skillDisplayName(item, allItems)], reps: 1 }];
                                      });
                                      setReviewPickerOpen(false);
                                      return;
                                    }
                                    addReviewEntry({
                                      skillIds: [item.id],
                                      codes: [skillDisplayCode(item, allItems)],
                                      names: [skillDisplayName(item, allItems)],
                                    });
                                  };
                                  const pickFc = (item: Skill) => addReviewEntry({
                                    skillIds: [],
                                    codes: [item.name],
                                    names: [item.name],
                                    fcId: item.id,
                                    customSkillIds: item.skillIds ?? [],
                                  });
                                  return (
                                    <>
                                      {skillsList.length > 0 && (
                                        <CommandGroup heading="Skills">
                                          {skillsList.map(item => (
                                            <CommandItem key={`s-${item.id}`} value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} skill`}
                                              onSelect={() => pickSkill(item)} data-testid={`review-pick-skill-${item.id}`}>
                                              <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(item, allItems)}</span>
                                              <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      )}
                                      {drillsList.length > 0 && (
                                        <CommandGroup heading="Drills">
                                          {drillsList.map(item => (
                                            <CommandItem key={`d-${item.id}`} value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} drill`}
                                              onSelect={() => pickSkill(item)} data-testid={`review-pick-drill-${item.id}`}>
                                              <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(item, allItems)}</span>
                                              <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
                                              <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-yellow-600 dark:text-yellow-400">Drill</span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      )}
                                      {connList.length > 0 && (
                                        <CommandGroup heading="Connections">
                                          {connList.map(item => (
                                            <CommandItem key={`c-${item.id}`} value={`${item.name} connection`}
                                              onSelect={() => pickFc(item)} data-testid={`review-pick-conn-${item.id}`}>
                                              <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.name}</span>
                                              <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-red-500 dark:text-red-400">Connection</span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      )}
                                      {partList.length > 0 && (
                                        <CommandGroup heading="Routine Parts">
                                          {partList.map(item => (
                                            <CommandItem key={`p-${item.id}`} value={`${item.name} routine part`}
                                              onSelect={() => pickFc(item)} data-testid={`review-pick-part-${item.id}`}>
                                              <span className="font-mono text-xs font-semibold text-foreground mr-2">{item.name}</span>
                                              <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Part</span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      )}
                                      {routineList.length > 0 && (
                                        <CommandGroup heading="Routines">
                                          {routineList.map(r => (
                                            <CommandItem key={`r-${r.id}`} value={`${r.name} routine`}
                                              onSelect={() => addReviewEntry({ skillIds: [], codes: [r.name], names: [r.name], routineId: r.id, customSkillIds: routineLineupFor(r.id) })}
                                              data-testid={`review-pick-routine-${r.id}`}>
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
                            </SearchPicker>
                          </div>
                          <Button
                            type="button"
                            variant={reviewConnectMode ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-11 shrink-0 px-3 text-[10px] font-bold uppercase tracking-wider rounded-xl",
                              reviewConnectMode ? "bg-red-500 text-white shadow-md hover:bg-red-600" : "border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                            )}
                            onClick={() => setReviewConnectMode(!reviewConnectMode)}
                            data-testid="btn-review-connect-next"
                            title="Link the next picked skill to the previous one as a connection"
                          >
                            {reviewConnectMode ? "Linking..." : "+ Link"}
                          </Button>
                          </div>
                          <div className="min-h-[120px] bg-white/[0.01] rounded-xl border border-white/[0.07] overflow-hidden">
                            <div className="bg-white/[0.015] px-3 py-1.5 border-b border-white/[0.07]">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                            </div>
                            {menuReviewItems.length === 0 && (
                              <p className="text-xs text-muted-foreground italic px-3 py-3">No items — use the search box above to add skills.</p>
                            )}
                            {menuReviewItems.map((it, idx) => {
                              const fc = it.fcId != null ? allItems?.find(s => s.id === it.fcId) : undefined;
                              const isPart = fc?.isDrill === 3;
                              const stepper = (
                                <div className="flex items-center border rounded-md">
                                  <button type="button" className="px-1.5 text-muted-foreground"
                                    onClick={() => setMenuReviewItems(prev => prev.map((r, i) => i === idx ? { ...r, reps: Math.max(1, r.reps - 1) } : r))}
                                    data-testid={`btn-review-reps-minus-${idx}`}>-</button>
                                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={it.reps}
                                    onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) setMenuReviewItems(prev => prev.map((r, i) => i === idx ? { ...r, reps: Math.min(999, n) } : r)); }}
                                    className="w-6 text-center text-xs font-bold bg-transparent outline-none"
                                    data-testid={`input-review-reps-${idx}`} />
                                  <button type="button" className="px-1.5 text-muted-foreground"
                                    onClick={() => setMenuReviewItems(prev => prev.map((r, i) => i === idx ? { ...r, reps: Math.min(999, r.reps + 1) } : r))}
                                    data-testid={`btn-review-reps-plus-${idx}`}>+</button>
                                </div>
                              );
                              const editable = it.routineId != null || it.fcId != null || it.skillIds.length > 1;
                              return (
                                <div key={idx} className={cn("px-3 py-2 flex justify-between items-center gap-2", idx > 0 && "border-t border-border/20")} data-testid={`menu-review-item-${idx}`}>
                                  <div
                                    className={cn("flex gap-2 items-center min-w-0 flex-wrap flex-1", editable && "cursor-pointer")}
                                    onClick={editable ? () => setReviewEditingIdx(idx) : undefined}
                                    data-testid={`btn-review-edit-${idx}`}
                                  >
                                    {it.routineId != null ? (
                                      <>
                                        <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0" data-testid={`badge-menu-review-kind-${idx}`}>ROUTINE</Badge>
                                        <span className="text-sm font-bold text-primary truncate">{it.names[0]}</span>
                                      </>
                                    ) : it.fcId != null ? (
                                      <>
                                        <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] border-none shrink-0", isPart ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive")} data-testid={`badge-menu-review-kind-${idx}`}>{isPart ? "PART" : "CONN"}</Badge>
                                        <span className={cn("text-sm font-bold truncate", isPart ? "text-muted-foreground" : "text-destructive")}>{it.names[0]}</span>
                                      </>
                                    ) : (
                                      it.codes.map((c, j) => (
                                        <div key={j} className="flex items-center gap-2 min-w-0">
                                          <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[10px] normal-case bg-background border-white/[0.09] text-foreground/70 shrink-0">{c}</Badge>
                                          {it.codes.length === 1 && <span className="text-sm truncate">{it.names[j]}</span>}
                                          {j < it.codes.length - 1 && <span className="text-muted-foreground/60 font-bold text-xs">+</span>}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 text-[11px] font-mono font-bold">
                                    {stepper}
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
                                      onClick={() => setMenuReviewItems(prev => prev.filter((_, i) => i !== idx))}
                                      data-testid={`btn-review-remove-${idx}`}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {menuReviewUnmatched.length > 0 && (
                            <div className="rounded-xl border border-dashed border-muted-foreground/30 px-3 py-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Not matched</p>
                              {menuReviewUnmatched.map((u, i) => <p key={i} className="text-xs text-muted-foreground font-mono">{u}</p>)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex justify-between gap-2 px-4 py-3 border-t">
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setMenuReviewOpen(false)} data-testid="btn-menu-review-back">
                          ← Back to chat
                        </Button>
                        <Button size="sm" className="rounded-xl gap-1.5" onClick={confirmMenuReview} disabled={menuReviewItems.length === 0} data-testid="btn-menu-review-confirm">
                          <Check className="h-3.5 w-3.5" />
                          Add to session
                        </Button>
                      </div>

                      {/* Skill editor overlay for review items (conn/part/routine/linked groups) */}
                      {reviewEditingIdx !== null && (() => {
                        const it = menuReviewItems[reviewEditingIdx];
                        if (!it) return null;
                        const isRoutine = it.routineId != null;
                        const isFC = it.fcId != null;
                        const fc = isFC ? allItems?.find(s => s.id === it.fcId) : undefined;
                        const isPart = fc?.isDrill === 3;
                        const typeLabel = isRoutine ? "ROUTINE" : isFC ? (isPart ? "PART" : "CONN") : "LINKED";
                        const typeColor = isRoutine
                          ? "bg-primary text-primary-foreground"
                          : isPart ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive";
                        const title = isRoutine || isFC ? it.names[0] : it.codes.join(" + ");
                        const editIds = isRoutine || isFC ? (it.customSkillIds ?? []) : it.skillIds;
                        return (
                          <div className="absolute inset-0 z-40 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm rounded-lg" onClick={(e) => { if (e.target === e.currentTarget) setReviewEditingIdx(null); }}>
                            <div className="flex flex-col w-full max-w-md max-h-full bg-background rounded-2xl border border-border shadow-black/30 p-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border/40">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] border-none shrink-0", typeColor)}>{typeLabel}</Badge>
                                  <span className="text-sm font-bold truncate">{title}</span>
                                </div>
                              </div>
                              <SkillEditorOverlay
                                title="Session skills"
                                skillIds={editIds}
                                allSkills={allItems || []}
                                onSkillIdsChange={(newIds) => {
                                  if (!isRoutine && !isFC && newIds.length === 0) {
                                    setMenuReviewItems(prev => prev.filter((_, i) => i !== reviewEditingIdx));
                                    setReviewEditingIdx(null);
                                    return;
                                  }
                                  setMenuReviewItems(prev => prev.map((r, i) => {
                                    if (i !== reviewEditingIdx) return r;
                                    if (r.routineId != null || r.fcId != null) return { ...r, customSkillIds: newIds };
                                    const codes = newIds.map(id => { const s = allItems?.find(x => x.id === id); return s ? skillDisplayCode(s, allItems) : "?"; });
                                    const names = newIds.map(id => { const s = allItems?.find(x => x.id === id); return s ? skillDisplayName(s, allItems) : "?"; });
                                    return { ...r, skillIds: newIds, codes, names };
                                  }));
                                }}
                                onClose={() => setReviewEditingIdx(null)}
                                filterSkills={isFC ? (s) => s.isDrill === 0 : undefined}
                                uidPrefix="review-edit"
                                className="flex-1 min-h-0"
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </DialogContent>
                  </Dialog>
                </div>

                <Dialog open={showNewSkill} onOpenChange={(o) => { if (!o) { setShowNewSkill(false); setNewSkillStep(1); } }}>
                  <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                    <DialogHero icon={newSkillIsDrill ? Dumbbell : Target} eyebrow="The Arsenal" title={newSkillIsDrill ? "Add drill" : "Add skill"} />
                    <div className="space-y-3">
                      {newSkillStep === 1 ? (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">Name</label>
                            <Input placeholder={newSkillIsDrill ? "3/4 F" : "Bs"} value={newSkillName} onChange={e => setNewSkillName(e.target.value)} data-testid="input-new-skill-name" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium leading-none">Code</label>
                            <div className="flex gap-2">
                              <Input placeholder={newSkillIsDrill ? "30" : "40"} value={newSkillCode} onChange={e => setNewSkillCode(e.target.value)} data-testid="input-new-skill-code" />
                              {newSkillShapes.length === 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="outline" className="shrink-0 gap-1 font-mono" data-testid="button-new-skill-code-shape">
                                      Shape <ChevronDown className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl">
                                    {SHAPE_OPTIONS.map(o => (
                                      <DropdownMenuItem key={o.value} className="cursor-pointer gap-2" onClick={() => setNewSkillCode(prev => (prev || "") + o.value)} data-testid={`menu-new-skill-code-shape-${o.word.toLowerCase()}`}>
                                        <span className="font-mono w-4 text-center">{o.value}</span> {o.word}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          {newSkillShapes.length === 0 && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium leading-none">Difficulty</label>
                              <Input type="number" step="0.1" min="0" placeholder="0.0" value={newSkillDD} onChange={e => setNewSkillDD(e.target.value)} data-testid="input-new-skill-dd" />
                            </div>
                          )}
                          {newSkillShapes.length > 0 && (
                            <p className="text-xs text-muted-foreground" data-testid="text-new-skill-shapes-hint">
                              This base has {newSkillShapes.length} shape variant{newSkillShapes.length === 1 ? "" : "s"} — it acts as a grouping and difficulty is set per shape.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Optional: split this {newSkillIsDrill ? "drill" : "skill"} into tuck / pike / straight variants. Once it has shapes, the base becomes a grouping and difficulty is set per shape.
                          </p>
                          <ShapeDraftsEditor
                            drafts={newSkillShapes}
                            onChange={setNewSkillShapes}
                            namePlaceholder={newSkillIsDrill ? "T" : "Bs"}
                            testIdPrefix="new-shape"
                            assignableSkills={(allItems || []).filter(s =>
                              s.isDrill === (newSkillIsDrill ? 1 : 0) &&
                              s.parentSkillId == null &&
                              s.archived !== 1 &&
                              !(allItems || []).some(c => c.parentSkillId === s.id)
                            )}
                          />
                        </>
                      )}
                      <div className="flex gap-2">
                      {newSkillStep === 2 && (
                        <Button type="button" variant="outline" onClick={() => setNewSkillStep(1)} data-testid="btn-new-skill-shapes-back">
                          Back
                        </Button>
                      )}
                      {newSkillStep === 1 && (
                        <Button type="button" variant="outline" onClick={() => setNewSkillStep(2)} data-testid="btn-new-skill-shapes-step">
                          Shape variants{newSkillShapes.length > 0 ? ` (${newSkillShapes.length})` : ""}
                        </Button>
                      )}
                      <Button type="button" className="flex-1" disabled={!newSkillName || !newSkillCode || isCreatingSkill} onClick={async () => {
                        try {
                          const childIsDrill = newSkillIsDrill ? 1 : 0;
                          const hasRealShapes = newSkillShapes.some(d => (d.shape || "").trim() || (d.name || "").trim());
                          const base = await createSkill({ name: newSkillName, code: newSkillCode, difficulty: hasRealShapes ? 0 : (parseFloat(newSkillDD) || 0), isDrill: childIsDrill });
                          if (!hasRealShapes && base?.id != null) {
                            addRecentEntry({ kind: 'skill', id: base.id });
                          }
                          if (hasRealShapes && base?.id != null) {
                            for (const d of newSkillShapes) {
                              const label = (d.shape || "").trim();
                              const name = (d.name || "").trim();
                              if (!label && !name) continue;
                              // An "assign existing skill as shape" draft relinks an
                              // already-saved skill. Preserve its original code (omit
                              // `code`) so Detach restores it cleanly.
                              if (d.existing && d.id != null) {
                                await updateSkill({ id: d.id, name: name || d.name, difficulty: d.difficulty || 0, isDrill: childIsDrill, parentSkillId: base.id, shape: label || null });
                                continue;
                              }
                              await createSkill({ name: name || label, code: label || name, difficulty: d.difficulty || 0, isDrill: childIsDrill, parentSkillId: base.id, shape: label || null });
                            }
                          }
                          setNewSkillName(""); setNewSkillCode(""); setNewSkillDD(""); setNewSkillIsDrill(false); setNewSkillShapes([]); setNewSkillStep(1); setShowNewSkill(false);
                        } catch {}
                      }} data-testid="btn-save-new-skill">Add {newSkillIsDrill ? "Drill" : "Skill"}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showNewConn} onOpenChange={(o) => { if (!o) setShowNewConn(false); }}>
                  <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                    <DialogHero icon={Link2} eyebrow="The Arsenal" title="Add connection" />
                    <div className="space-y-3">
                      {(() => {
                        const dupConns = allItems?.filter(s => s.isDrill === 2 && s.archived !== 1) || [];
                        if (dupConns.length === 0) return null;
                        return (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                            <Select value="" onValueChange={(v) => {
                              const src = dupConns.find(s => s.id === parseInt(v));
                              if (!src) return;
                              setNewConnName(`${src.name} (copy)`);
                              setNewConnSkillIds(src.skillIds || []);
                              setNewConnRoutineId(src.sourceRoutineId ?? null);
                            }}>
                              <SelectTrigger data-testid="select-duplicate-inline-connection"><SelectValue placeholder="Pick a connection to copy..." /></SelectTrigger>
                              <SelectContent>
                                {dupConns.map(s => (
                                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Connection Name</label>
                        <Input placeholder="e.g. Ba+BT" value={newConnName} onChange={e => setNewConnName(e.target.value)} data-testid="input-new-conn-name" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Routine <span className="font-normal text-muted-foreground">(optional)</span></label>
                        <Select value={newConnRoutineId !== null ? String(newConnRoutineId) : "none"} onValueChange={(v) => setNewConnRoutineId(v === "none" ? null : parseInt(v))}>
                          <SelectTrigger data-testid="select-new-conn-routine"><SelectValue placeholder="No routine" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No routine</SelectItem>
                            {(routines || []).filter(r => r.archived !== 1).map(r => (
                              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">Tag a routine to archive this connection together with it.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Build Sequence</label>
                        <div className="flex items-center gap-2">
                          <SearchPicker
                            open={connSkillPickerOpen}
                            onOpenChange={setConnSkillPickerOpen}
                            placeholder="Add skill to sequence..."
                            className="h-9 flex-1 rounded-xl border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
                            inputTestId="btn-open-conn-skill-picker"
                            inputRef={connSkillInputRef}
                          >
                                <CommandList className="max-h-[320px]">
                                  <CommandEmpty>No matches.</CommandEmpty>
                                  <CommandGroup heading="Skills">
                                    {pickableSkills(allItems, 0).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                                      <CommandItem key={s.id} value={`${skillDisplayCode(s, allItems)} ${skillDisplayName(s, allItems)} skill`} onSelect={() => { addRecentSkill(s.id); setNewConnSkillIds(prev => [...prev, s.id]); setConnSkillPickerOpen(false); }} data-testid={`pick-conn-skill-${s.id}`}>
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(s, allItems)}</span>
                                        {skillDisplayCode(s, allItems) !== skillDisplayName(s, allItems) && <span className="text-muted-foreground">- {skillDisplayName(s, allItems)}</span>}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                          </SearchPicker>
                          <span className="text-xs shrink-0 text-muted-foreground" data-testid="text-new-conn-skill-count">{newConnSkillIds.length} skills</span>
                        </div>
                        {(() => {
                          const recents = globalRecentSkillIds
                            .map(id => pickableSkills(allItems, 0).find(s => s.id === id))
                            .filter((s): s is NonNullable<typeof s> => !!s);
                          if (recents.length === 0) return null;
                          return (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                              <div className="flex flex-wrap gap-1.5">
                                {recents.map(s => (
                                  <button key={`nc-recent-${s.id}`} type="button" onClick={() => { addRecentSkill(s.id); setNewConnSkillIds(prev => [...prev, s.id]); }} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-white/[0.08] text-muted-foreground bg-white/[0.025] hover:bg-white/[0.04] transition-colors pressable [--press-scale:0.95]" data-testid={`btn-new-conn-recent-${s.id}`}><SkillCode skill={s} allSkills={allItems} /></button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleNewConnChipDragEnd}>
                        <SortableContext items={newConnSkillIds.map((_, i) => `nc-${i}`)} strategy={rectSortingStrategy}>
                          <div className="min-h-[80px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-2 items-start">
                            {newConnSkillIds.map((sid, i) => {
                              const s = allItems?.find(sk => sk.id === sid);
                              return (
                                <SortableChip key={`nc-${i}`} uid={`nc-${i}`}>
                                  <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-new-conn-skill-${i}`}>
                                    <span className="py-0.5 pl-2.5 pr-1.5 flex items-center"><SkillCode skill={s} allSkills={allItems} /></span>
                                    <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => setNewConnSkillIds(prev => prev.filter((_, j) => j !== i))} className="px-2.5 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-new-conn-skill-${i}`} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                                  </Badge>
                                </SortableChip>
                              );
                            })}
                            {newConnSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                          </div>
                        </SortableContext>
                      </DndContext>
                      {shapeSwapInfo(newConnSkillIds, allItems, SHAPE_OPTIONS).hasShapeable && (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!newConnName || isCreatingSkill} onClick={() => setConnShapeSwapOpen(true)} data-testid="btn-new-conn-duplicate-shape">
                          <Shapes className="h-3.5 w-3.5" /> Duplicate w/ shape
                        </Button>
                      )}
                      <div className="pt-2 flex justify-between items-center">
                        <span className="text-sm font-medium">Total DD:</span>
                        <span className="font-mono font-bold text-primary">{newConnSkillIds.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0).toFixed(1)}</span>
                      </div>
                      <Button type="button" className="w-full" disabled={!newConnName || newConnSkillIds.length === 0 || isCreatingSkill} onClick={async () => {
                        try {
                          const dd = newConnSkillIds.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0);
                          const createdConn = await createSkill({ name: newConnName, code: newConnName, difficulty: dd, isDrill: 2, skillIds: newConnSkillIds, sourceRoutineId: newConnRoutineId });
                          if (createdConn && (createdConn as Skill).id !== undefined) {
                            addRecentEntry({ kind: 'fc', id: (createdConn as Skill).id });
                          }
                          setNewConnName(""); setNewConnSkillIds([]); setNewConnRoutineId(null); setShowNewConn(false);
                        } catch {}
                      }} data-testid="btn-save-new-conn">Save Connection</Button>
                    </div>
                    <ShapeSwapPicker
                      open={connShapeSwapOpen}
                      onOpenChange={setConnShapeSwapOpen}
                      ids={newConnSkillIds}
                      allSkills={allItems}
                      onPick={async (shape) => {
                        const swapped = swapSkillIdsToShape(newConnSkillIds, shape, allItems);
                        const dd = swapped.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0);
                        const word = SHAPE_OPTIONS.find(o => o.value === shape)?.word ?? "";
                        const dupName = word ? `${newConnName} (${word})` : newConnName;
                        try {
                          const dupCreated = await createSkill({ name: dupName, code: dupName, difficulty: dd, isDrill: 2, skillIds: swapped, sourceRoutineId: newConnRoutineId });
                          if (dupCreated && (dupCreated as Skill).id !== undefined) {
                            addRecentEntry({ kind: 'fc', id: (dupCreated as Skill).id });
                          }
                          toast({ title: "Connection duplicated", description: `Created "${dupName}"` });
                        } catch {}
                      }}
                    />
                  </DialogContent>
                </Dialog>

                <Dialog open={showNewRoutine} onOpenChange={(o) => { if (!o) setShowNewRoutine(false); }}>
                  <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                    <DialogHero icon={Layers} eyebrow="Routine builder" title="Create routine" />
                    <div className="space-y-4">
                      {(() => {
                        const dupRoutines = routines?.filter(r => r.archived !== 1) || [];
                        if (dupRoutines.length === 0) return null;
                        return (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                            <Select value="" onValueChange={(v) => {
                              const src = dupRoutines.find(r => r.id === parseInt(v));
                              if (!src) return;
                              setNewRoutineName(`${src.name} (copy)`);
                              setNewRoutineSkillIds(src.skillIds.slice(0, 10));
                            }}>
                              <SelectTrigger data-testid="select-duplicate-inline-routine"><SelectValue placeholder="Pick a routine to copy..." /></SelectTrigger>
                              <SelectContent>
                                {dupRoutines.map(r => (
                                  <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                      <Input placeholder="Routine Name" value={newRoutineName} onChange={e => setNewRoutineName(e.target.value)} data-testid="input-new-routine-name" />
                      <div className="flex items-center gap-2">
                        <SearchPicker
                          open={routineSkillPickerOpen}
                          onOpenChange={(v) => { if (!v) setRoutineSkillPickerOpen(false); else if (newRoutineSkillIds.length < 10) setRoutineSkillPickerOpen(true); }}
                          disabled={newRoutineSkillIds.length >= 10}
                          placeholder={newRoutineSkillIds.length >= 10 ? "Maximum 10 skills reached" : "Add skill to routine..."}
                          className="h-10 flex-1 rounded-xl border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
                          inputTestId="btn-open-routine-skill-picker"
                          inputRef={routineSkillInputRef}
                        >
                              <CommandList className="max-h-[280px]">
                                <CommandEmpty>No matches.</CommandEmpty>
                                <CommandGroup heading="Skills">
                                  {pickableSkills(allItems, 0).slice().sort((a, b) => { const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999; if (oA !== oB) return oA - oB; return b.difficulty - a.difficulty; }).map(s => (
                                    <CommandItem key={s.id} value={`${skillDisplayCode(s, allItems)} ${skillDisplayName(s, allItems)} skill`} onSelect={() => { addRecentSkill(s.id); setNewRoutineSkillIds(prev => prev.length < 10 ? [...prev, s.id] : prev); setRoutineSkillPickerOpen(false); }} data-testid={`pick-routine-skill-${s.id}`}>
                                      <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(s, allItems)}</span>
                                      {skillDisplayCode(s, allItems) !== skillDisplayName(s, allItems) && <span className="text-muted-foreground">- {skillDisplayName(s, allItems)}</span>}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                        </SearchPicker>
                        <span className={cn("text-xs shrink-0 font-mono", newRoutineSkillIds.length >= 10 ? "text-red-500 font-bold" : "text-muted-foreground")}>{newRoutineSkillIds.length}/10</span>
                      </div>
                      {(() => {
                        const recents = globalRecentSkillIds
                          .map(id => pickableSkills(allItems, 0).find(s => s.id === id))
                          .filter((s): s is NonNullable<typeof s> => !!s);
                        if (recents.length === 0) return null;
                        return (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                            <div className="flex flex-wrap gap-1.5">
                              {recents.map(s => (
                                <button key={`nr-recent-${s.id}`} type="button" disabled={newRoutineSkillIds.length >= 10} onClick={() => { addRecentSkill(s.id); setNewRoutineSkillIds(prev => prev.length < 10 ? [...prev, s.id] : prev); }} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-white/[0.08] text-muted-foreground bg-white/[0.025] hover:bg-white/[0.04] transition-colors pressable [--press-scale:0.95] disabled:opacity-40 disabled:pointer-events-none" data-testid={`btn-new-routine-recent-${s.id}`}><SkillCode skill={s} allSkills={allItems} /></button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleNewRoutineChipDragEnd}>
                        <SortableContext items={newRoutineSkillIds.map((_, i) => `nr-${i}`)} strategy={rectSortingStrategy}>
                          <div className="min-h-[80px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-2 items-start">
                            {newRoutineSkillIds.map((sid, i) => {
                              const s = allItems?.find(sk => sk.id === sid);
                              return (
                                <SortableChip key={`nr-${i}`} uid={`nr-${i}`}>
                                  <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-new-routine-skill-${i}`}>
                                    <span className="py-0.5 pl-2.5 pr-1.5 flex items-center"><SkillCode skill={s} allSkills={allItems} /></span>
                                    <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => setNewRoutineSkillIds(prev => prev.filter((_, j) => j !== i))} className="px-2.5 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-new-routine-skill-${i}`} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                                  </Badge>
                                </SortableChip>
                              );
                            })}
                            {newRoutineSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                          </div>
                        </SortableContext>
                      </DndContext>
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="text-sm font-medium text-muted-foreground">Total Difficulty</span>
                        <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums text-primary">{newRoutineSkillIds.reduce((acc, sid) => acc + (allItems?.find(s => s.id === sid)?.difficulty || 0), 0).toFixed(1)}</span>
                      </div>
                      <Button type="button" className="w-full h-11" disabled={!newRoutineName || newRoutineSkillIds.length === 0 || isCreatingRoutine} onClick={async () => {
                        try {
                          await createRoutine({ name: newRoutineName, code: newRoutineName, skillIds: newRoutineSkillIds });
                          setNewRoutineName(""); setNewRoutineSkillIds([]); setShowNewRoutine(false);
                        } catch {}
                      }} data-testid="btn-save-new-routine">Save Routine</Button>
                    </div>
                  </DialogContent>
                </Dialog>

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
                    <Dialog open={showNewPart} onOpenChange={(o) => { if (!o) { setShowNewPart(false); setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); } }}>
                      <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                        <DialogHero icon={Puzzle} eyebrow="The Arsenal" title="Add routine part" />
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Routine</label>
                            <Select value={newPartRoutineId !== null ? String(newPartRoutineId) : ""} onValueChange={(v) => {
                              const id = parseInt(v);
                              setNewPartRoutineId(Number.isFinite(id) ? id : null);
                              setNewPartStart(1);
                              const r = partRoutines.find(rr => rr.id === id);
                              setNewPartEnd(r?.skillIds.length || 10);
                              setNewPartNameOverride(null);
                            }}>
                              <SelectTrigger data-testid="select-new-part-routine"><SelectValue placeholder="Pick a routine..." /></SelectTrigger>
                              <SelectContent>
                                {partRoutines.map(r => (
                                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {sel && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground">Start (1–{total})</label>
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
                                    data-testid="input-new-part-start"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground">End ({newPartStart}–{total})</label>
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
                                    data-testid="input-new-part-end"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Name</label>
                                <Input
                                  placeholder={auto}
                                  value={finalName}
                                  onChange={(e) => setNewPartNameOverride(e.target.value)}
                                  data-testid="input-new-part-name"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Skills in this part</label>
                                <div className="min-h-[60px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-1.5 items-start">
                                  {slice.length === 0 ? (
                                    <span className="text-xs text-muted-foreground p-1">Empty range</span>
                                  ) : slice.map((sid, i) => {
                                    const s = allItems?.find(sk => sk.id === sid);
                                    return (
                                      <Badge key={`np-${i}`} variant="outline" className="font-mono text-[10px]">
                                        {effStart + i}. <SkillCode skill={s} allSkills={allItems} fallback="?" />
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="pt-1 flex justify-between items-center">
                                <span className="text-sm font-medium">Total DD:</span>
                                <span className="font-mono font-bold text-primary">{dd.toFixed(1)}</span>
                              </div>
                            </>
                          )}
                          <Button
                            type="button"
                            className="w-full"
                            disabled={!sel || slice.length === 0 || !finalName || isCreatingSkill}
                            onClick={async () => {
                              try {
                                if (!sel) return;
                                const created = await createSkill({ name: finalName, code: finalName, difficulty: dd, isDrill: 3, skillIds: slice, sourceRoutineId: sel.id });
                                if (created && (created as Skill).id !== undefined) {
                                  addRecentEntry({ kind: 'fc', id: (created as Skill).id });
                                }
                                setNewPartRoutineId(null); setNewPartStart(1); setNewPartEnd(10); setNewPartNameOverride(null); setShowNewPart(false);
                              } catch {}
                            }}
                            data-testid="btn-save-new-part"
                          >Save Routine Part</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
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
                            <button key={`r-${ent.id}`} type="button" onClick={() => addRoutine(ent.id.toString())} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors pressable [--press-scale:0.95] border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 max-w-[140px] truncate" data-testid={`btn-recent-routine-${ent.id}`}>{r.name}</button>
                          );
                        }
                        if (ent.kind === 'fc') {
                          const fc = allItems?.find(s => s.id === ent.id);
                          if (!fc) return null;
                          const isPart = fc.isDrill === 3;
                          return (
                            <button key={`f-${ent.id}`} type="button" onClick={() => addSkill(ent.id.toString())} className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors pressable [--press-scale:0.95] max-w-[140px] truncate",
                              isPart ? "border-border text-muted-foreground bg-white/[0.04]" : "border-destructive/40 text-destructive bg-destructive/10"
                            )} data-testid={`btn-recent-fc-${ent.id}`}>{fc.name}</button>
                          );
                        }
                        const skill = allItems?.find(s => s.id === ent.id);
                        if (!skill) return null;
                        return (
                          <button key={`s-${ent.id}`} type="button" onClick={() => addSkill(ent.id.toString())} className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors pressable [--press-scale:0.95]",
                            skill.isDrill === 1 ? "border-yellow-300 text-yellow-600 bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:bg-yellow-900/10"
                              : "border-white/[0.08] text-muted-foreground bg-white/[0.025] hover:bg-white/[0.04]"
                          )} data-testid={`btn-recent-skill-${ent.id}`}><SkillCode skill={skill} allSkills={allItems} /></button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="min-h-[220px] bg-white/[0.01] rounded-xl border border-white/[0.07] overflow-hidden relative">
                  <div className="bg-white/[0.015] px-3 py-1.5 border-b border-white/[0.07] flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Practice List</span>
                    <div className="flex items-center gap-2">
                      {trackTurns && turnInfo.totalTurns > 0 && (
                        <>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Turns:</span>
                          <span className="text-xs font-mono font-bold text-foreground" data-testid="text-turn-count">{turnInfo.totalTurns}</span>
                          <span className="text-muted-foreground/60">·</span>
                        </>
                      )}
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total DD:</span>
                      <span className="text-xs font-mono font-bold text-primary">{totalDifficulty.toFixed(1)}</span>
                    </div>
                  </div>

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePracticeListDragEnd}>
                  {/* pr keeps rows (esp. the trailing ⋮ menu) clear of the overlay scroll indicator on iOS */}
                  <div ref={practiceListRef} className="max-h-[296px] overflow-y-auto overscroll-contain pr-1.5">
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
                            const rowTurn = turnInfo.rowTurns[gIdx];
                            const isFirstOfTurn = gIdx === 0 || turnInfo.rowTurns[gIdx - 1] !== rowTurn;
                            const joinedWithPrev = gIdx > 0 && turnInfo.rowTurns[gIdx - 1] === rowTurn;
                            const turnMenuItems = trackTurns && gIdx > 0 ? (
                              joinedWithPrev ? (
                                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => splitTurnFromPrevious(gIdx)} data-testid={`menu-split-turn-${gIdx}`}><Split className="h-3.5 w-3.5" /> Split into own turn</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => joinTurnWithPrevious(gIdx)} data-testid={`menu-join-turn-${gIdx}`}><Merge className="h-3.5 w-3.5" /> Same turn as above</DropdownMenuItem>
                              )
                            ) : null;
                            const rowContent = (
                              <>
                            {isConnected ? (() => {
                              const grpReps = group.items[0]?.reps ?? 1;
                              const grpNote = group.items[0]?.note;
                              const grpNoteIdx = group.indices[0];
                              const lineDD = group.items.reduce((acc, it) => {
                                if (it.id === -2) {
                                  const sIds = it.customSkillIds ?? routineLineupFor(it.routineId);
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
                                      className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                      onClick={() => setEditingGroupIndices(group.indices)}
                                    >
                                      {group.items.map((it, iIdx) => {
                                        const idx = group.indices[iIdx];
                                        const sep = iIdx < group.items.length - 1 ? <span className="text-muted-foreground/60 font-bold text-xs">+</span> : null;
                                        if (it.id === -2) {
                                          const r = routines?.find(rt => rt.id === it.routineId);
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5">
                                              <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                                              <span className="text-[11px] font-semibold text-primary truncate max-w-[120px]">{r?.name || it.routineName}</span>
                                              {sep}
                                            </div>
                                          );
                                        }
                                        if (it.id === -3) {
                                          const fc = allItems?.find(s => s.id === it.fcId);
                                          const isPart = fc?.isDrill === 3;
                                          return (
                                            <div key={idx} className="flex items-center gap-1.5">
                                              <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] text-white border-none shrink-0", isPart ? "bg-secondary text-secondary-foreground" : "bg-red-500")}>{isPart ? "PART" : "CONN"}</Badge>
                                              <span className={cn("text-[11px] font-semibold truncate max-w-[120px]", isPart ? "text-muted-foreground" : "text-red-500 dark:text-red-400")}>{fc?.name || it.fcName}</span>
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
                                                ? "border-yellow-400/60 text-yellow-600 dark:border-yellow-600/60 dark:text-yellow-400"
                                                : "border-white/[0.09] text-foreground/70"
                                            )}><SkillCode skill={sk} allSkills={allItems} /></Badge>
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
                                        <DropdownMenuContent align="end" className="w-36 rounded-xl" collisionPadding={{ top: 8, bottom: bottomNavCoverPx }} onCloseAutoFocus={(e) => e.preventDefault()}>
                                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (grpNote !== undefined && grpNote !== null) { updateSkillNote(grpNoteIdx, undefined); } else { addNoteAndFocus(grpNoteIdx); } }}><MessageSquare className="h-3.5 w-3.5" /> {grpNote !== undefined && grpNote !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                          {canShapeSwapGroup(group.indices) && (
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => setShapeSwapIndices(group.indices)}><Shapes className="h-3.5 w-3.5" /> Duplicate w/ shape</DropdownMenuItem>
                                          )}
                                          {turnMenuItems}
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
                                        className="w-full text-xs text-muted-foreground bg-white/[0.02] rounded px-2 py-1 outline-none focus:bg-white/[0.04] placeholder:text-muted-foreground/60"
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
                                const baseSkillIds = routineLineupFor(item.routineId);
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
                                          : "hover:bg-white/[0.015] active:bg-white/[0.03] bg-primary/5"
                                      )}
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isConnected && (
                                          <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-destructive" : "text-destructive/50 pl-1")}>
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
                                              <span className="text-muted-foreground/60">×</span>
                                              <div className="flex items-center border rounded-md">
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-6 text-center text-xs font-bold bg-transparent outline-none" />
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                              </div>
                                              <span className="text-muted-foreground/60">=</span>
                                              <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                            </div>
                                          );
                                        })()}
                                        {(!isConnected || iIdx === 0) ? (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-36 rounded-xl" collisionPadding={{ top: 8, bottom: bottomNavCoverPx }} onCloseAutoFocus={(e) => e.preventDefault()}>
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { addNoteAndFocus(idx); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                              {turnMenuItems}
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
                                        <input type="text" placeholder="Type a note..." value={(isConnected ? group.items[0].note : item.note) || ""} onChange={(e) => updateSkillNote(isConnected ? group.indices[0] : idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-white/[0.02] rounded px-2 py-1 outline-none focus:bg-white/[0.04] placeholder:text-muted-foreground/60" data-testid={`input-skill-note-${isConnected ? group.indices[0] : idx}`} />
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
                                    isPart ? "bg-muted/40" : "bg-destructive/10"
                                  )}>
                                    <div
                                      className={cn("w-full px-3 py-2 text-sm flex justify-between items-center transition-colors cursor-pointer",
                                        isPart
                                          ? "hover:bg-muted/60 active:bg-muted/70"
                                          : "hover:bg-destructive/15 active:bg-destructive/20")}
                                      onClick={() => setEditingRoutineIdx(idx)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isConnected && (
                                          <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-destructive" : "text-destructive/50 pl-1")}>
                                            {iIdx === 0 ? "C" : "└"}
                                          </span>
                                        )}
                                        <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] border-none shrink-0", isPart ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive")}>{isPart ? "PART" : "CONN"}</Badge>
                                        <span className={cn("font-bold truncate", isPart ? "text-muted-foreground" : "text-destructive")}>{fc?.name || item.fcName}</span>
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
                                              <span className="text-muted-foreground/60">×</span>
                                              <div className="flex items-center border rounded-md">
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) - 1)}>-</button>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.reps ?? 1} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateReps([idx], v); else if (e.target.value === "") updateReps([idx], 0); }} onBlur={() => { if (!item.reps || item.reps < 1) updateReps([idx], 1); }} className="w-6 text-center text-xs font-bold bg-transparent outline-none" />
                                                <button type="button" className="px-1.5 text-muted-foreground" onClick={() => updateReps([idx], (item.reps || 1) + 1)}>+</button>
                                              </div>
                                              <span className="text-muted-foreground/60">=</span>
                                              <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                            </div>
                                          );
                                        })()}
                                        {(!isConnected || iIdx === 0) ? (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-36 rounded-xl" collisionPadding={{ top: 8, bottom: bottomNavCoverPx }} onCloseAutoFocus={(e) => e.preventDefault()}>
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); } else { addNoteAndFocus(idx); } }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                              {turnMenuItems}
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
                                        <input type="text" placeholder="Type a note..." value={(isConnected ? group.items[0].note : item.note) || ""} onChange={(e) => updateSkillNote(isConnected ? group.indices[0] : idx, e.target.value)} className="w-full text-xs text-muted-foreground bg-white/[0.02] rounded px-2 py-1 outline-none focus:bg-white/[0.04] placeholder:text-muted-foreground/60" data-testid={`input-skill-note-${isConnected ? group.indices[0] : idx}`} />
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
                                        <span className={cn("text-[9px] font-black uppercase tracking-wider shrink-0", iIdx === 0 ? "text-destructive" : "text-destructive/50 pl-1")}>
                                          {iIdx === 0 ? "C" : "└"}
                                        </span>
                                      )}
                                      <Badge variant="outline" className={cn(
                                        "px-2 py-0.5 h-5 font-mono text-[10px] bg-background normal-case",
                                        skill?.isDrill === 1
                                          ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                          : skill?.isDrill === 3
                                          ? "border-border text-muted-foreground"
                                          : isConnected || skill?.isDrill === 2
                                          ? "border-destructive/40 text-destructive"
                                          : "border-white/[0.08] text-muted-foreground"
                                      )}>{skillDisplayCode(skill, allItems)}</Badge>
                                      <span className="text-sm truncate">{skillDisplayName(skill, allItems)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {showReps && (() => {
                                        const dd = skill?.difficulty || 0;
                                        const reps = item.reps || 1;
                                        return (
                                          <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                                            <span className="text-muted-foreground">{dd.toFixed(1)}</span>
                                            <span className="text-muted-foreground/60">×</span>
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
                                            <span className="text-muted-foreground/60">=</span>
                                            <span className="text-foreground">{(dd * reps).toFixed(1)}</span>
                                          </div>
                                        );
                                      })()}
                                      {(!isConnected || iIdx === 0) ? (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-36 rounded-xl" collisionPadding={{ top: 8, bottom: bottomNavCoverPx }} onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => {
                                              if (item.note !== undefined && item.note !== null) { updateSkillNote(idx, undefined); }
                                              else { addNoteAndFocus(isConnected ? group.indices[0] : idx); }
                                            }}><MessageSquare className="h-3.5 w-3.5" /> {item.note !== undefined && item.note !== null ? "Remove Note" : "Add Note"}</DropdownMenuItem>
                                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => duplicateGroup(group.indices)}><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                                            {canShapeSwapGroup(group.indices) && (
                                              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => setShapeSwapIndices(group.indices)}><Shapes className="h-3.5 w-3.5" /> Duplicate w/ shape</DropdownMenuItem>
                                            )}
                                            {turnMenuItems}
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
                                        className="w-full text-xs text-muted-foreground bg-white/[0.02] rounded px-2 py-1 outline-none focus:bg-white/[0.04] placeholder:text-muted-foreground/60"
                                        data-testid={`input-skill-note-${group.indices[0]}`}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                              </>
                            );
                            return (
                              <SortablePracticeGroup key={`group-${gIdx}`} gId={`group-${gIdx}`} isConnected={isConnected}>
                                {trackTurns ? (
                                  <div className="flex items-stretch">
                                    <div
                                      className={cn(
                                        "w-6 shrink-0 flex items-center justify-center border-r border-border/30",
                                        !isFirstOfTurn && "border-t-0"
                                      )}
                                      data-testid={`turn-gutter-${gIdx}`}
                                    >
                                      {isFirstOfTurn ? (
                                        <span className="text-[11px] font-mono font-bold text-muted-foreground" data-testid={`text-turn-number-${gIdx}`}>{rowTurn}</span>
                                      ) : (
                                        <span className="w-px self-stretch bg-border/60 mx-auto" aria-hidden="true" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">{rowContent}</div>
                                  </div>
                                ) : rowContent}
                              </SortablePracticeGroup>
                            );
                          })}
                        </SortableContext>
                      );
                    })()}
                  </div>
                  </DndContext>
                  {trackTurns && turnInfo.totalTurns > 0 && (
                    <div className="border-t border-white/[0.07] bg-white/[0.01]">
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.025] transition-colors"
                        onClick={duplicateLastTurn}
                        data-testid="button-duplicate-last-turn"
                      >
                        <Repeat className="h-3 w-3" /> Duplicate last turn
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <ShapeSwapPicker
                open={shapeSwapIndices !== null}
                onOpenChange={(o) => { if (!o) setShapeSwapIndices(null); }}
                ids={shapeSwapIndices ? shapeSwapIndices.map(i => selectedSkills[i]?.id).filter((id): id is number => typeof id === "number" && id > 0) : []}
                allSkills={allItems}
                onPick={(shape) => { if (shapeSwapIndices) duplicateGroupWithShape(shapeSwapIndices, shape); setShapeSwapIndices(null); }}
              />

              <div className={cn("space-y-4", noteStep !== 3 && "hidden")}>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <FormControl><TimeField ariaLabel="Start time" value={field.value || ""} onChange={field.onChange} testId="input-start-time-3" /></FormControl>
                    </FormItem>
                  )} />
                  <span className="text-muted-foreground text-sm">→</span>
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 flex-1 min-w-0 space-y-0">
                      <FormControl><TimeField ariaLabel="End time" value={field.value || ""} onChange={field.onChange} testId="input-end-time" /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="rating" render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session rating</FormLabel>
                    <FormControl>
                      <div className="h-9 flex items-center bg-white/[0.015] rounded-xl px-1.5 border border-white/[0.07] w-fit">
                        <StarRating value={field.value} onChange={field.onChange} />
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="content" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Notes</FormLabel><FormControl><Textarea placeholder="How did the session go?" className="min-h-[100px] rounded-xl" {...field} /></FormControl></FormItem>
                )} />
              </div>
              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                  data-testid="note-save-error"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}
              {noteStep === 1 ? (
                <Button type="button" className="w-full h-12 rounded-xl text-lg font-semibold" onClick={() => setNoteStep(2)} data-testid="btn-note-next">
                  Skills →
                </Button>
              ) : noteStep === 2 ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-12 px-4 rounded-xl font-semibold" onClick={() => setNoteStep(1)} data-testid="btn-note-back">
                    ← Start
                  </Button>
                  <Button type="button" className="flex-1 h-12 rounded-xl text-lg font-semibold" onClick={() => setNoteStep(3)} data-testid="btn-note-finish">
                    Finish →
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-12 px-4 rounded-xl font-semibold" onClick={() => setNoteStep(2)} data-testid="btn-note-back">
                    ← Skills
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-12 rounded-xl text-lg font-semibold"
                    disabled={isSaving}
                    onClick={flushDraftSave}
                    data-testid="btn-note-done"
                  >
                    <span
                      key={String(isSaving)}
                      className="animate-morph-blur inline-flex items-center justify-center gap-2"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "End training"}
                    </span>
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </div>

        {editingGroupIndices !== null && editingRoutineIdx === null && (() => {
          const indices = editingGroupIndices;
          return (
            <div className="absolute inset-0 z-30 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingGroupIndices(null); }}>
              <div className="flex flex-col w-full max-w-md max-h-full bg-background rounded-2xl border border-border shadow-black/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
                  <span className="text-sm font-semibold">Connected Group</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 px-3 rounded-xl text-xs" onClick={() => setEditingGroupIndices(null)}>Done</Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {indices.map((realIdx) => {
                    const item = selectedSkills[realIdx];
                    if (!item) return null;
                    if (item.id === -2) {
                      const r = routines?.find(rt => rt.id === item.routineId);
                      return (
                        <button type="button" key={realIdx} className="w-full flex items-center justify-between px-4 py-3 border-b border-border/20 hover:bg-white/[0.02] active:bg-white/[0.04] text-left" onClick={() => setEditingRoutineIdx(realIdx)}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="px-2 py-0.5 h-5 font-mono text-[9px] bg-primary text-primary-foreground border-none shrink-0">ROUTINE</Badge>
                            <span className="text-sm font-semibold text-primary">{r?.name || item.routineName}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    }
                    if (item.id === -3) {
                      const fc = allItems?.find(s => s.id === item.fcId);
                      const isPart = fc?.isDrill === 3;
                      return (
                        <button type="button" key={realIdx} className="w-full flex items-center justify-between px-4 py-3 border-b border-border/20 hover:bg-white/[0.02] active:bg-white/[0.04] text-left" onClick={() => setEditingRoutineIdx(realIdx)}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] border-none shrink-0", isPart ? "bg-secondary text-secondary-foreground" : "bg-red-500 text-white")}>{isPart ? "PART" : "CONN"}</Badge>
                            <span className={cn("text-sm font-semibold", isPart ? "text-muted-foreground" : "text-red-500 dark:text-red-400")}>{fc?.name || item.fcName}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    }
                    const sk = allItems?.find(s => s.id === item.id);
                    return (
                      <div key={realIdx} className="flex items-center justify-between px-4 py-3 border-b border-border/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[10px] bg-background normal-case shrink-0", sk?.isDrill === 1 ? "border-yellow-400/60 text-yellow-600 dark:border-yellow-600/60 dark:text-yellow-400" : "border-white/[0.09] text-foreground/70")}>{skillDisplayCode(sk, allItems)}</Badge>
                          <span className="text-sm truncate">{skillDisplayName(sk, allItems)}</span>
                        </div>
                        <button type="button" className="ml-2 text-muted-foreground/50 hover:text-destructive shrink-0" onClick={() => {
                          setSelectedSkills(prev => {
                            const ns = prev.filter((_, i) => i !== realIdx);
                            const newIndices = indices.filter(i => i !== realIdx).map(i => i > realIdx ? i - 1 : i);
                            form.setValue('skills', JSON.stringify(ns));
                            if (newIndices.length === 0) setEditingGroupIndices(null);
                            else setEditingGroupIndices(newIndices);
                            return ns;
                          });
                        }}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="px-3 py-2 border-t border-border/30 shrink-0">
                  <div className="h-11 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                    {(() => {
                      const sortFn = (a: Skill, b: Skill) => {
                        const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                        if (oA !== oB) return oA - oB;
                        return b.difficulty - a.difficulty;
                      };
                      const skillsList = pickableSkills(allItems, 0).slice().sort(sortFn);
                      const drillsList = pickableSkills(allItems, 1).slice().sort(sortFn);
                      const addToGroup = (skillId: number) => {
                        setSelectedSkills(prev => {
                          const ns = [...prev];
                          const lastIdx = indices[indices.length - 1];
                          ns.splice(lastIdx + 1, 0, { id: skillId });
                          setEditingGroupIndices([...indices, lastIdx + 1]);
                          form.setValue('skills', JSON.stringify(ns));
                          return ns;
                        });
                        setGroupPickerOpen(false);
                      };
                      return (
                        <SearchPicker
                          open={groupPickerOpen}
                          onOpenChange={setGroupPickerOpen}
                          placeholder="Add skill..."
                          container={dialogBodyRef.current}
                          className="w-full h-full"
                          inputClassName="text-xs"
                          inputRef={groupPickerInputRef}
                        >
                          <CommandList className="max-h-[260px]">
                            <CommandEmpty>No matches.</CommandEmpty>
                            {skillsList.length > 0 && (
                              <CommandGroup heading="Skills">
                                {skillsList.map(item => (
                                  <CommandItem
                                    key={`gs-${item.id}`}
                                    value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} skill`}
                                    onSelect={() => addToGroup(item.id)}
                                  >
                                    <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(item, allItems)}</span>
                                    <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            {drillsList.length > 0 && (
                              <CommandGroup heading="Drills">
                                {drillsList.map(item => (
                                  <CommandItem
                                    key={`gd-${item.id}`}
                                    value={`${skillDisplayCode(item, allItems)} ${skillDisplayName(item, allItems)} drill`}
                                    onSelect={() => addToGroup(item.id)}
                                  >
                                    <span className="font-mono text-xs font-semibold text-yellow-600 dark:text-yellow-400 mr-2">{skillDisplayCode(item, allItems)}</span>
                                    <span className="text-muted-foreground">- {skillDisplayName(item, allItems)}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </SearchPicker>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {editingRoutineIdx !== null && (selectedSkills[editingRoutineIdx]?.id === -2 || selectedSkills[editingRoutineIdx]?.id === -3) && (() => {
          const rItem = selectedSkills[editingRoutineIdx];
          const isFC = rItem.id === -3;
          const fcSkill = isFC ? allItems?.find(s => s.id === rItem.fcId) : undefined;
          const isPart = fcSkill?.isDrill === 3;
          const baseSkillIds = isFC
            ? (fcSkill?.skillIds ?? [])
            : routineLineupFor(rItem.routineId);
          const displaySkillIds = rItem.customSkillIds ?? baseSkillIds;
          const liveName = isFC
            ? fcSkill?.name
            : routines?.find(r => r.id === rItem.routineId)?.name;
          const title = liveName || (isFC ? (rItem.fcName || "Edit Connection") : (rItem.routineName || "Edit Routine"));
          const typeLabel = isFC ? (isPart ? "PART" : "CONN") : "ROUTINE";
          const typeColor = isFC
            ? (isPart ? "bg-secondary text-secondary-foreground" : "bg-red-500 text-white")
            : "bg-primary text-primary-foreground";

          return (
            <div className="absolute inset-0 z-40 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingRoutineIdx(null); }}>
              <div className="flex flex-col w-full max-w-md max-h-full bg-background rounded-2xl border border-border shadow-black/30 p-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={cn("px-2 py-0.5 h-5 font-mono text-[9px] border-none shrink-0", typeColor)}>{typeLabel}</Badge>
                    <span className="text-sm font-bold truncate">{title}</span>
                  </div>
                </div>
              <SkillEditorOverlay
                title="Session skills"
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
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={discardConfirmOpen}
      onOpenChange={setDiscardConfirmOpen}
      title="Discard this training session?"
      description="This session has not been saved. Keep editing to preserve it, or discard it permanently."
      confirmLabel="Discard session"
      cancelLabel="Keep editing"
      variant="destructive"
      onConfirm={() => {
        setDiscardConfirmOpen(false);
        onOpenChange(false);
      }}
    />

    </>
  );
}
