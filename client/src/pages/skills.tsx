import { useState, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useRecentSkills, addRecentSkill } from "@/hooks/use-recent-skills";
import { useToast } from "@/hooks/use-toast";
import { calcDDFromSkillIds, suggestRoutinePartName, skillDisplayCode, skillDisplayName, swapSkillIdsToShape, shapeSwapInfo, pickableSkills, detachedCode, isAssignedShapeChild } from "@/lib/training-utils";
import { SkillCode } from "@/components/skill-code";
import { ShapeSwapPicker } from "@/components/shape-swap-picker";
import { useDndSensors, useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
import { SortableChip } from "@/components/sortable-chip";
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil, X, Link2, GripVertical, ArrowUpDown, Check, Archive, ArchiveRestore, MoreVertical, Search, ChevronRight, ChevronDown, Shapes, Unlink } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSkillSchema, type Skill } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { ShapeDraftsEditor, SHAPE_OPTIONS, type ShapeDraft } from "@/components/shape-drafts-editor";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

function SortableRow({ id, children, className, onClick, testId, reorderMode }: {
  id: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  testId?: string;
  reorderMode?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !reorderMode });
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={className}
      onClick={reorderMode ? undefined : onClick}
      data-testid={testId}
    >
      {reorderMode && (
        <TableCell className="w-8 px-1">
          <button
            type="button"
            className="touch-none cursor-grab active:cursor-grabbing flex items-center justify-center w-6 h-6 text-muted-foreground/40 hover:text-muted-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </TableCell>
      )}
      {children}
    </TableRow>
  );
}

function sortByOrder(items: Skill[]): Skill[] {
  return [...items].sort((a, b) => {
    const aOrder = a.sortOrder ?? 999999;
    const bOrder = b.sortOrder ?? 999999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.difficulty - a.difficulty;
  });
}

export default function SkillsPage() {
  const [, navigate] = useLocation();
  const { data: allItems, createSkill, deleteSkill, updateSkill, reorderSkills, isCreating, isUpdating } = useSkills();
  const { data: routines } = useRoutines();
  const { toast } = useToast();
  const recentSkillIds = useRecentSkills();
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expandedBases, setExpandedBases] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => setExpandedBases((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  
  const [connName, setConnName] = useState("");
  const [connSkillIds, setConnSkillIds] = useState<number[]>([]);
  const [connRoutineId, setConnRoutineId] = useState<number | null>(null);
  const [connShapeSwapOpen, setConnShapeSwapOpen] = useState(false);
  const [connSkillPickerOpen, setConnSkillPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("skills");
  const connSkillInputRef = useRef<HTMLInputElement>(null);
  useTypeToSearch(activeTab === "connections" && !reorderMode, connSkillPickerOpen, connSkillInputRef);

  const [partRoutineId, setPartRoutineId] = useState<number | null>(null);
  const [partStart, setPartStart] = useState(1);
  const [partEnd, setPartEnd] = useState(10);
  const [partNameOverride, setPartNameOverride] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string; kind: string } | null>(null);

  const [shapeDrafts, setShapeDrafts] = useState<ShapeDraft[]>([]);
  // Two-step Add/Edit Skill & Drill dialogs: step 1 = basics (Name/Code/DD),
  // step 2 = optional shape variants (hosts the ShapeDraftsEditor).
  const [formStep, setFormStep] = useState<1 | 2>(1);

  const [assignTarget, setAssignTarget] = useState<Skill | null>(null);
  const [assignBaseId, setAssignBaseId] = useState<string>("");
  const [assignShapeLabel, setAssignShapeLabel] = useState("");

  const shapesOf = (parentId: number): Skill[] =>
    allItems ? sortByOrder(allItems.filter(s => s.parentSkillId === parentId && archivedFilter(s))) : [];

  const sensors = useDndSensors();
  const longPressSensors = useLongPressDndSensors();

  const handleConnChipDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = parseInt(String(active.id).split("-")[1]);
    const newIdx = parseInt(String(over.id).split("-")[1]);
    if (isNaN(oldIdx) || isNaN(newIdx)) return;
    setConnSkillIds(prev => arrayMove(prev, oldIdx, newIdx));
  };

  const archivedFilter = (item: Skill) => showArchived ? item.archived === 1 : item.archived !== 1;
  const searchTerm = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: Skill) => {
    if (!searchTerm) return true;
    if (`${item.name} ${item.code ?? ""}`.toLowerCase().includes(searchTerm)) return true;
    return (allItems || []).some(c => c.parentSkillId === item.id && `${c.name} ${c.code ?? ""} ${c.shape ?? ""}`.toLowerCase().includes(searchTerm));
  };
  const skills = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 0 && item.parentSkillId == null && archivedFilter(item) && matchesSearch(item))) : undefined;
  const drills = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 1 && item.parentSkillId == null && archivedFilter(item) && matchesSearch(item))) : undefined;
  const frequentConnections = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 2 && archivedFilter(item) && matchesSearch(item))) : undefined;
  const routineParts = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 3 && archivedFilter(item) && matchesSearch(item))) : undefined;
  const archivedCount = allItems ? allItems.filter(i => i.archived === 1).length : 0;

  const activeSkills = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 0 && i.archived !== 1)) : [];
  const activeDrills = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 1 && i.archived !== 1)) : [];
  const activeConnections = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 2 && i.archived !== 1)) : [];
  const activeRoutines = (routines || []).filter(r => r.archived !== 1);

  const selectedPartRoutine = activeRoutines.find(r => r.id === partRoutineId) || null;
  const selectedRoutineSkillIds = selectedPartRoutine?.skillIds || [];
  const effectivePartStart = Math.max(1, partStart || 1);
  const effectivePartEnd = Math.max(effectivePartStart, partEnd || effectivePartStart);
  const partSliceIds = selectedRoutineSkillIds.slice(effectivePartStart - 1, effectivePartEnd);
  const partAutoName = selectedPartRoutine
    ? suggestRoutinePartName(selectedPartRoutine.name, effectivePartStart, effectivePartEnd, selectedRoutineSkillIds.length || 10)
    : "";
  const partFinalName = (partNameOverride ?? "").trim() || partAutoName;

  const toggleArchive = async (skill: Skill) => {
    if (skill.archived === 1) {
      await updateSkill({ id: skill.id, archived: 0 });
    } else {
      const kind = skill.isDrill === 1 ? "drill" : skill.isDrill === 2 ? "connection" : skill.isDrill === 3 ? "routine part" : "skill";
      setArchiveTarget({ id: skill.id, name: skill.name, kind });
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    await updateSkill({ id: archiveTarget.id, archived: 1 });
    setArchiveTarget(null);
  };

  const handleDragEnd = (items: Skill[] | undefined) => (event: DragEndEvent) => {
    if (!items) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex(s => `skill-${s.id}` === active.id);
    const newIdx = items.findIndex(s => `skill-${s.id}` === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    reorderSkills(reordered.map(s => s.id));
  };

  const toggleReorderMode = () => {
    if (reorderMode) {
      setReorderMode(false);
    } else {
      cancelEditing();
      setReorderMode(true);
    }
  };

  const skillForm = useForm({
    resolver: zodResolver(insertSkillSchema),
    defaultValues: {
      name: "",
      code: "",
      difficulty: 0,
      isDrill: 0,
    }
  });

  const drillForm = useForm({
    resolver: zodResolver(insertSkillSchema),
    defaultValues: {
      name: "",
      code: "",
      difficulty: 0,
      isDrill: 1,
    }
  });

  const isEditingShape = !!editingSkill && editingSkill.parentSkillId != null;

  const syncShapes = async (baseId: number, isDrill: number) => {
    const existing = (allItems || []).filter(s => s.parentSkillId === baseId);
    const keptIds = new Set(shapeDrafts.filter(d => d.id != null).map(d => d.id as number));
    // Remove shapes the user deleted from the editor. A generated shape variant is
    // deleted outright; an assigned existing skill carries its own notes/history, so
    // it is DETACHED (parentSkillId cleared, original code restored) like the library
    // "Detach" action — never destroyed.
    for (const ex of existing) {
      if (!keptIds.has(ex.id)) {
        if (isAssignedShapeChild(ex)) {
          await updateSkill({ id: ex.id, parentSkillId: null, shape: null, code: detachedCode(ex, allItems) });
        } else {
          await deleteSkill(ex.id);
        }
      }
    }
    // create/update drafts (skip empty rows)
    for (const d of shapeDrafts) {
      const label = (d.shape || "").trim();
      const name = (d.name || "").trim();
      if (!label && !name) continue;
      // An "assign existing skill as shape" draft relinks an already-saved skill.
      // Preserve its original code (omit `code`) so Detach restores it cleanly.
      if (d.existing && d.id != null) {
        await updateSkill({
          id: d.id,
          name: name || d.name,
          difficulty: d.difficulty || 0,
          isDrill,
          parentSkillId: baseId,
          shape: label || null,
        });
        continue;
      }
      const payload = {
        name: name || label,
        code: label || name,
        difficulty: d.difficulty || 0,
        isDrill,
        parentSkillId: baseId,
        shape: label || null,
      };
      if (d.id != null) {
        await updateSkill({ id: d.id, ...payload });
      } else {
        await createSkill(payload);
      }
    }
  };

  // For a shape child the Code field is prefilled with the COMBINED code
  // (baseCode + shape). On save we strip the base prefix back off to recover
  // the shape's own portion, which drives the displayed code via `shape`.
  const shapePortionFromCombined = (skill: Skill, combined: string | undefined | null) => {
    const parent = (allItems || []).find(s => s.id === skill.parentSkillId);
    const baseCode = parent?.code ?? "";
    const entered = (combined ?? "").toString();
    return baseCode && entered.startsWith(baseCode) ? entered.slice(baseCode.length) : entered;
  };

  const onSkillSubmit = async (values: any) => {
    if (editingSkill && isEditingShape) {
      const shape = shapePortionFromCombined(editingSkill, values.code);
      await updateSkill({ id: editingSkill.id, name: values.name, difficulty: values.difficulty, shape });
      setEditingSkill(null);
      skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
      setShapeDrafts([]);
      setShowForm(false);
      return;
    }
    const hasRealShapes = !isEditingShape && shapeDrafts.some(d => (d.shape || "").trim() || (d.name || "").trim());
    const baseValues = hasRealShapes ? { ...values, difficulty: 0 } : values;
    if (editingSkill) {
      const base = await updateSkill({ id: editingSkill.id, ...baseValues });
      if (!isEditingShape) {
        await syncShapes(base?.id ?? editingSkill.id, 0);
      }
      setEditingSkill(null);
    } else {
      const created = await createSkill({ ...baseValues, isDrill: 0 });
      if (created?.id != null) {
        await syncShapes(created.id, 0);
      }
    }
    skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
    setShapeDrafts([]);
    setShowForm(false);
  };

  const onDrillSubmit = async (values: any) => {
    if (editingSkill && isEditingShape) {
      const shape = shapePortionFromCombined(editingSkill, values.code);
      await updateSkill({ id: editingSkill.id, name: values.name, difficulty: values.difficulty, shape });
      setEditingSkill(null);
      drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
      setShapeDrafts([]);
      setShowForm(false);
      return;
    }
    const hasRealShapes = !isEditingShape && shapeDrafts.some(d => (d.shape || "").trim() || (d.name || "").trim());
    const baseValues = hasRealShapes ? { ...values, difficulty: 0 } : values;
    if (editingSkill) {
      const base = await updateSkill({ id: editingSkill.id, ...baseValues });
      if (!isEditingShape) {
        await syncShapes(base?.id ?? editingSkill.id, 1);
      }
      setEditingSkill(null);
    } else {
      const created = await createSkill({ ...baseValues, isDrill: 1 });
      if (created?.id != null) {
        await syncShapes(created.id, 1);
      }
    }
    drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
    setShapeDrafts([]);
    setShowForm(false);
  };

  const onRoutinePartSubmit = async () => {
    if (!selectedPartRoutine || partSliceIds.length === 0) return;
    const totalDifficulty = calcDDFromSkillIds(partSliceIds, allItems || []);
    const finalName = partFinalName || partAutoName;
    const payload = {
      name: finalName,
      code: finalName,
      difficulty: totalDifficulty,
      isDrill: 3,
      skillIds: partSliceIds,
      sourceRoutineId: selectedPartRoutine.id,
    };
    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...payload });
      setEditingSkill(null);
    } else {
      await createSkill(payload);
    }
    setPartRoutineId(null);
    setPartStart(1);
    setPartEnd(10);
    setPartNameOverride(null);
    setShowForm(false);
  };

  const onConnectionSubmit = async () => {
    if (!connName || connSkillIds.length === 0) return;
    
    const totalDifficulty = calcDDFromSkillIds(connSkillIds, allItems || []);

    const payload = {
      name: connName,
      code: connName,
      difficulty: totalDifficulty,
      isDrill: 2,
      skillIds: connSkillIds,
      sourceRoutineId: connRoutineId,
    };

    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...payload });
      setEditingSkill(null);
    } else {
      await createSkill(payload);
    }
    
    setConnName("");
    setConnSkillIds([]);
    setConnRoutineId(null);
    setShowForm(false);
  };

  const startEditing = (skill: Skill) => {
    setShowForm(true);
    setEditingSkill(skill);
    if (skill.isDrill === 3) {
      // Routine parts: editing the slice itself isn't reversible; let user adjust name only by re-saving with the existing skill ids.
      // Prefer the stored source routine link; fall back to a fuzzy skill-id match for legacy parts that predate the link.
      const matchedRoutine =
        (skill.sourceRoutineId != null ? (routines || []).find(r => r.id === skill.sourceRoutineId) : null) ||
        (routines || []).find(r => {
          const ids = r.skillIds.slice(0, 10);
          return skill.skillIds && skill.skillIds.length > 0 && skill.skillIds.every((sid, i) => ids.indexOf(sid) !== -1);
        }) || null;
      setPartRoutineId(matchedRoutine?.id ?? null);
      setPartStart(1);
      setPartEnd(skill.skillIds?.length || 1);
      setPartNameOverride(skill.name);
    } else if (skill.isDrill === 2) {
      setConnName(skill.name);
      setConnSkillIds(skill.skillIds || []);
      setConnRoutineId(skill.sourceRoutineId ?? null);
    } else if (skill.isDrill === 1) {
      drillForm.reset({
        name: skill.name,
        code: skill.parentSkillId != null ? skillDisplayCode(skill, allItems) : skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
      // Load this base drill's existing shapes into editable drafts (a shape
      // row itself has no sub-shapes).
      if (skill.parentSkillId == null) {
        const drafts = shapesOf(skill.id).map(s => isAssignedShapeChild(s)
          ? { id: s.id, existing: true, code: s.code, shape: s.shape ?? "", name: s.name, difficulty: s.difficulty }
          : { id: s.id, shape: s.shape ?? s.code, name: s.name, difficulty: s.difficulty });
        setShapeDrafts(drafts);
        // A base that already has shapes opens with them visible (step 2).
        setFormStep(drafts.length > 0 ? 2 : 1);
      } else {
        setShapeDrafts([]);
        setFormStep(1);
      }
    } else {
      skillForm.reset({
        name: skill.name,
        code: skill.parentSkillId != null ? skillDisplayCode(skill, allItems) : skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
      // Load this base skill's existing shapes into editable drafts (a shape
      // row itself has no sub-shapes).
      if (skill.parentSkillId == null) {
        const drafts = shapesOf(skill.id).map(s => isAssignedShapeChild(s)
          ? { id: s.id, existing: true, code: s.code, shape: s.shape ?? "", name: s.name, difficulty: s.difficulty }
          : { id: s.id, shape: s.shape ?? s.code, name: s.name, difficulty: s.difficulty });
        setShapeDrafts(drafts);
        // A base that already has shapes opens with them visible (step 2).
        setFormStep(drafts.length > 0 ? 2 : 1);
      } else {
        setShapeDrafts([]);
        setFormStep(1);
      }
    }
  };

  const cancelEditing = () => {
    if (editingSkill) {
      const isDrill = editingSkill.isDrill;
      if (isDrill === 3) {
        setPartRoutineId(null);
        setPartStart(1);
        setPartEnd(10);
        setPartNameOverride(null);
      } else if (isDrill === 2) {
        setConnName("");
        setConnSkillIds([]);
        setConnRoutineId(null);
      } else if (isDrill === 1) {
        drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
        setShapeDrafts([]);
      } else {
        skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
        setShapeDrafts([]);
      }
    }
    setShowForm(false);
    setEditingSkill(null);
    setFormStep(1);
    setConnSkillPickerOpen(false);
  };

  const addSkillToConn = (idStr: string) => {
    const id = parseInt(idStr);
    addRecentSkill(id);
    setConnSkillIds(prev => [...prev, id]);
  };

  const removeSkillFromConn = (idx: number) => {
    setConnSkillIds(prev => prev.filter((_, i) => i !== idx));
  };

  const renderReorderButton = () => (
    <Button
      variant={reorderMode ? "default" : "outline"}
      size="sm"
      onClick={toggleReorderMode}
      data-testid="button-reorder-toggle"
      className="gap-1.5"
    >
      {reorderMode ? <><Check className="h-4 w-4" /> Done</> : <><ArrowUpDown className="h-4 w-4" /> Edit Order</>}
    </Button>
  );

  const addLabel = activeTab === "drills" ? "Add Drill" : activeTab === "connections" ? "Add Connection" : activeTab === "parts" ? "Add Part" : "Add Skill";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-[350px]">
      <PageHeader
        eyebrow="Skill Library"
        title="My Skills"
        accent="Skills"
        subtitle="Manage your trampoline element library."
        actions={
          <>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowArchived(v => !v); cancelEditing(); setReorderMode(false); }}
              className={cn(headerActionClass, "shrink-0", !showArchived && "text-muted-foreground hover:text-foreground")}
              data-testid="button-toggle-archived"
            >
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
            <Button
              className={cn(primaryActionClass, "shrink-0")}
              onClick={() => { if (showForm || editingSkill) { cancelEditing(); setShowForm(false); } else { cancelEditing(); setReorderMode(false); setShowForm(true); } }}
              data-testid="button-add-skill"
            >
              <Plus className="w-5 h-5" /> {addLabel}
            </Button>
          </>
        }
      />
      <Tabs value={activeTab} className="flex flex-col gap-4 -mt-6" onValueChange={(v) => { setActiveTab(v); cancelEditing(); setReorderMode(false); }}>
        <div
          className="sticky z-20 full-bleed-bar py-2 bg-background/90 backdrop-blur-md border-b border-white/[0.08]"
          style={{ top: "var(--page-header-h, 96px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="inline-flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-white/[0.03] p-1 shrink-0 self-start">
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="drills">Drills</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="parts">
                <span className="hidden sm:inline">Routine Parts</span>
                <span className="sm:hidden">Parts</span>
              </TabsTrigger>
            </TabsList>
            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="h-9 pl-8 rounded-xl text-xs font-mono"
                data-testid="input-library-search"
              />
            </div>
          </div>
        </div>

        <TabsContent value="skills">
          <div>
            <Dialog open={(showForm || !!editingSkill) && !reorderMode} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
              <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8">
                <DialogHeader>
                  <DialogTitle>{editingSkill ? "Edit Skill" : "Add New Skill"}</DialogTitle>
                </DialogHeader>
                  <Form {...skillForm}>
                    <form onSubmit={skillForm.handleSubmit(onSkillSubmit, () => setFormStep(1))} className="space-y-3">
                      {formStep === 1 ? (
                        <>
                          <FormField control={skillForm.control} name="name" render={({ field }) => (
                            <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Bs" /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={skillForm.control} name="code" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Code</FormLabel>
                              <div className="flex gap-2">
                                <FormControl><Input {...field} placeholder="40" /></FormControl>
                                {(isEditingShape || shapeDrafts.length === 0) && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button type="button" variant="outline" className="shrink-0 gap-1 font-mono" data-testid="button-skill-code-shape">
                                        Shape <ChevronDown className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-xl">
                                      {SHAPE_OPTIONS.map(o => (
                                        <DropdownMenuItem key={o.value} className="cursor-pointer gap-2" onClick={() => field.onChange((field.value || "") + o.value)} data-testid={`menu-skill-code-shape-${o.word.toLowerCase()}`}>
                                          <span className="font-mono w-4 text-center">{o.value}</span> {o.word}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )} />
                          {(isEditingShape || shapeDrafts.length === 0) && (
                            <FormField control={skillForm.control} name="difficulty" render={({ field }) => (
                              <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                            )} />
                          )}
                          {!isEditingShape && shapeDrafts.length > 0 && (
                            <p className="text-xs text-muted-foreground" data-testid="text-skill-shapes-hint">
                              This base has {shapeDrafts.length} shape variant{shapeDrafts.length === 1 ? "" : "s"} — it acts as a grouping and difficulty is set per shape.
                            </p>
                          )}
                          {editingSkill && shapeDrafts.length === 0 && (
                            <FormField control={skillForm.control} name="isDrill" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="0">Skill</SelectItem>
                                    <SelectItem value="1">Drill</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Optional: split this skill into tuck / pike / straight variants. Once it has shapes, the base becomes a grouping and difficulty is set per shape.
                          </p>
                          <ShapeDraftsEditor
                            drafts={shapeDrafts}
                            onChange={setShapeDrafts}
                            namePlaceholder="Bs"
                            assignableSkills={(allItems || []).filter(s =>
                              s.isDrill === 0 &&
                              s.parentSkillId == null &&
                              s.archived !== 1 &&
                              (!editingSkill || s.id !== editingSkill.id) &&
                              !(allItems || []).some(c => c.parentSkillId === s.id)
                            )}
                          />
                        </>
                      )}
                      <div className="flex gap-2">
                        {formStep === 2 && (
                          <Button type="button" variant="outline" onClick={() => setFormStep(1)} data-testid="button-skill-shapes-back">
                            Back
                          </Button>
                        )}
                        {formStep === 1 && !isEditingShape && (
                          <Button type="button" variant="outline" onClick={() => setFormStep(2)} data-testid="button-skill-shapes-step">
                            Shape variants{shapeDrafts.length > 0 ? ` (${shapeDrafts.length})` : ""}
                          </Button>
                        )}
                        <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                          {editingSkill ? "Update" : "Add Skill"}
                        </Button>
                        {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                      </div>
                    </form>
                  </Form>
              </DialogContent>
            </Dialog>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle>Skills Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(skills)}>
                  <Table>
                    <TableHeader><TableRow className="border-white/[0.08] hover:bg-transparent">{reorderMode && <TableHead className="w-8" />}<TableHead className="eyebrow w-24">Code</TableHead><TableHead className="eyebrow">Name</TableHead><TableHead className="eyebrow text-right">DD</TableHead>{!reorderMode && <TableHead className="w-10" />}</TableRow></TableHeader>
                    <SortableContext items={(skills || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {skills?.map((skill) => {
                          const shapes = shapesOf(skill.id);
                          const hasShapes = shapes.length > 0;
                          const expanded = expandedBases.has(skill.id);
                          return (
                          <Fragment key={skill.id}>
                          <SortableRow
                            id={`skill-${skill.id}`}
                            reorderMode={reorderMode}
                            className={cn(
                              !reorderMode && "cursor-pointer",
                              editingSkill?.id === skill.id ? "bg-white/[0.04]" : !reorderMode && "hover:bg-white/[0.02]"
                            )}
                            onClick={hasShapes ? () => toggleExpanded(skill.id) : () => navigate(`/skills/${skill.id}`)}
                            testId={`row-skill-${skill.id}`}
                          >
                            <TableCell className="font-mono text-sm text-muted-foreground w-24">
                              <span className="inline-flex items-center gap-1">
                                {hasShapes ? (
                                  expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-foreground" strokeWidth={2.25} /> : <ChevronRight className="h-5 w-5 shrink-0 text-foreground" strokeWidth={2.25} />
                                ) : (
                                  <span className="inline-block w-5 shrink-0" />
                                )}
                                <span>{skill.code}</span>
                              </span>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <span>{skill.name}</span>
                                {skill.id < 0 && (
                                  <PendingSyncBadge size="xs" testId={`badge-pending-skill-${skill.id}`} />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{hasShapes ? (<Badge variant="outline" className="text-[9px] px-1 py-0 font-mono" data-testid={`badge-shapes-${skill.id}`}>{shapes.length} shapes</Badge>) : skill.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${skill.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(skill)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    {!hasShapes && (
                                      <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { setAssignTarget(skill); setAssignBaseId(""); setAssignShapeLabel(""); }} data-testid={`button-assign-shape-${skill.id}`}><Link2 className="h-3.5 w-3.5" /> Assign as shape</DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(skill)} data-testid={`button-archive-skill-${skill.id}`}>{skill.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </SortableRow>
                          {!reorderMode && expanded && shapes.map((shape) => (
                            <TableRow
                              key={shape.id}
                              className={cn("cursor-pointer border-l-2 border-l-primary/40", editingSkill?.id === shape.id ? "bg-primary/20" : "bg-muted/80 hover:bg-accent")}
                              onClick={() => navigate(`/skills/${shape.id}`)}
                              data-testid={`row-shape-${shape.id}`}
                            >
                              <TableCell className="font-mono text-sm text-muted-foreground w-24 pl-14">{skillDisplayCode(shape, allItems)}</TableCell>
                              <TableCell className="font-medium text-foreground">
                                <span className="inline-flex items-center gap-2 flex-wrap">
                                  <span>{skillDisplayName(shape, allItems)}</span>
                                  {shape.id < 0 && (
                                    <PendingSyncBadge size="xs" testId={`badge-pending-skill-${shape.id}`} />
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{shape.difficulty.toFixed(1)}</TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${shape.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(shape)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => updateSkill({ id: shape.id, parentSkillId: null, shape: null, code: detachedCode(shape, allItems) })} data-testid={`button-detach-shape-${shape.id}`}><Unlink className="h-3.5 w-3.5" /> Detach</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: shape.id, name: shape.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                          </Fragment>
                          );
                        })}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="drills">
          <div>
            <Dialog open={(showForm || !!editingSkill) && !reorderMode} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
              <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8">
                <DialogHeader>
                  <DialogTitle>{editingSkill ? "Edit Drill" : "Add New Drill"}</DialogTitle>
                </DialogHeader>
                  <Form {...drillForm}>
                    <form onSubmit={drillForm.handleSubmit(onDrillSubmit, () => setFormStep(1))} className="space-y-3">
                      {formStep === 1 ? (
                        <>
                          <FormField control={drillForm.control} name="name" render={({ field }) => (
                            <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="3/4 F" /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={drillForm.control} name="code" render={({ field }) => (
                            <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} placeholder="30" /></FormControl><FormMessage /></FormItem>
                          )} />
                          {(isEditingShape || shapeDrafts.length === 0) && (
                            <FormField control={drillForm.control} name="difficulty" render={({ field }) => (
                              <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                            )} />
                          )}
                          {!isEditingShape && shapeDrafts.length > 0 && (
                            <p className="text-xs text-muted-foreground" data-testid="text-drill-shapes-hint">
                              This base has {shapeDrafts.length} shape variant{shapeDrafts.length === 1 ? "" : "s"} — it acts as a grouping and difficulty is set per shape.
                            </p>
                          )}
                          {editingSkill && shapeDrafts.length === 0 && (
                            <FormField control={drillForm.control} name="isDrill" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="0">Skill</SelectItem>
                                    <SelectItem value="1">Drill</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Optional: split this drill into tuck / pike / straight variants. Once it has shapes, the base becomes a grouping and difficulty is set per shape.
                          </p>
                          <ShapeDraftsEditor
                            drafts={shapeDrafts}
                            onChange={setShapeDrafts}
                            namePlaceholder="T"
                            testIdPrefix="drill-shape"
                            assignableSkills={(allItems || []).filter(s =>
                              s.isDrill === 1 &&
                              s.parentSkillId == null &&
                              s.archived !== 1 &&
                              (!editingSkill || s.id !== editingSkill.id) &&
                              !(allItems || []).some(c => c.parentSkillId === s.id)
                            )}
                          />
                        </>
                      )}
                      <div className="flex gap-2">
                        {formStep === 2 && (
                          <Button type="button" variant="outline" onClick={() => setFormStep(1)} data-testid="button-drill-shapes-back">
                            Back
                          </Button>
                        )}
                        {formStep === 1 && !isEditingShape && (
                          <Button type="button" variant="outline" onClick={() => setFormStep(2)} data-testid="button-drill-shapes-step">
                            Shape variants{shapeDrafts.length > 0 ? ` (${shapeDrafts.length})` : ""}
                          </Button>
                        )}
                        <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                          {editingSkill ? "Update" : "Add Drill"}
                        </Button>
                        {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                      </div>
                    </form>
                  </Form>
              </DialogContent>
            </Dialog>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle>Drills Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(drills)}>
                  <Table>
                    <TableHeader><TableRow className="border-white/[0.08] hover:bg-transparent">{reorderMode && <TableHead className="w-8" />}<TableHead className="eyebrow w-24">Code</TableHead><TableHead className="eyebrow">Name</TableHead><TableHead className="eyebrow text-right">DD</TableHead>{!reorderMode && <TableHead className="w-10" />}</TableRow></TableHeader>
                    <SortableContext items={(drills || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {drills?.map((drill) => {
                          const shapes = shapesOf(drill.id);
                          const hasShapes = shapes.length > 0;
                          const expanded = expandedBases.has(drill.id);
                          return (
                          <Fragment key={drill.id}>
                          <SortableRow
                            id={`skill-${drill.id}`}
                            reorderMode={reorderMode}
                            className={cn(
                              !reorderMode && "cursor-pointer",
                              editingSkill?.id === drill.id ? "bg-white/[0.04]" : !reorderMode && "hover:bg-white/[0.02]"
                            )}
                            onClick={hasShapes ? () => toggleExpanded(drill.id) : () => navigate(`/skills/${drill.id}`)}
                            testId={`row-drill-${drill.id}`}
                          >
                            <TableCell className="font-mono text-sm text-muted-foreground w-24">
                              <span className="inline-flex items-center gap-1">
                                {hasShapes ? (
                                  expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-foreground" strokeWidth={2.25} /> : <ChevronRight className="h-5 w-5 shrink-0 text-foreground" strokeWidth={2.25} />
                                ) : (
                                  <span className="inline-block w-5 shrink-0" />
                                )}
                                <span>{drill.code}</span>
                              </span>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <span>{drill.name}</span>
                                {drill.id < 0 && (
                                  <PendingSyncBadge size="xs" testId={`badge-pending-drill-${drill.id}`} />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{hasShapes ? (<Badge variant="outline" className="text-[9px] px-1 py-0 font-mono" data-testid={`badge-shapes-${drill.id}`}>{shapes.length} shapes</Badge>) : drill.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${drill.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(drill)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    {!hasShapes && (
                                      <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => { setAssignTarget(drill); setAssignBaseId(""); setAssignShapeLabel(""); }} data-testid={`button-assign-shape-${drill.id}`}><Link2 className="h-3.5 w-3.5" /> Assign as shape</DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(drill)} data-testid={`button-archive-skill-${drill.id}`}>{drill.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: drill.id, name: drill.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </SortableRow>
                          {!reorderMode && expanded && shapes.map((shape) => (
                            <TableRow
                              key={shape.id}
                              className={cn("cursor-pointer border-l-2 border-l-primary/40", editingSkill?.id === shape.id ? "bg-primary/20" : "bg-muted/80 hover:bg-accent")}
                              onClick={() => navigate(`/skills/${shape.id}`)}
                              data-testid={`row-shape-${shape.id}`}
                            >
                              <TableCell className="font-mono text-sm text-muted-foreground w-24 pl-14">{skillDisplayCode(shape, allItems)}</TableCell>
                              <TableCell className="font-medium text-foreground">
                                <span className="inline-flex items-center gap-2 flex-wrap">
                                  <span>{skillDisplayName(shape, allItems)}</span>
                                  {shape.id < 0 && (
                                    <PendingSyncBadge size="xs" testId={`badge-pending-skill-${shape.id}`} />
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{shape.difficulty.toFixed(1)}</TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${shape.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(shape)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => updateSkill({ id: shape.id, parentSkillId: null, shape: null, code: detachedCode(shape, allItems) })} data-testid={`button-detach-shape-${shape.id}`}><Unlink className="h-3.5 w-3.5" /> Detach</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: shape.id, name: shape.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                          </Fragment>
                          );
                        })}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="connections">
          <div>
            <Dialog open={(showForm || !!editingSkill) && !reorderMode} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
              <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8">
                <DialogHeader>
                  <DialogTitle>{editingSkill ? "Edit Connection" : "Add New Connection"}</DialogTitle>
                </DialogHeader>
                  <div className="space-y-3">
                    {!editingSkill && activeConnections.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                        <Select value="" onValueChange={(v) => {
                          const src = activeConnections.find(s => s.id === parseInt(v));
                          if (!src) return;
                          setConnName(`${src.name} (copy)`);
                          setConnSkillIds(src.skillIds || []);
                          setConnRoutineId(src.sourceRoutineId ?? null);
                        }}>
                          <SelectTrigger data-testid="select-duplicate-connection"><SelectValue placeholder="Pick a connection to copy..." /></SelectTrigger>
                          <SelectContent>
                            {activeConnections.map(s => (
                              <SelectItem key={s.id} value={s.id.toString()}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Connection Name</label>
                      <Input value={connName} onChange={e => setConnName(e.target.value)} placeholder="e.g. Ba+BT" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Routine <span className="font-normal text-muted-foreground">(optional)</span></label>
                      <Select
                        value={connRoutineId !== null ? String(connRoutineId) : "none"}
                        onValueChange={(v) => setConnRoutineId(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger data-testid="select-conn-routine"><SelectValue placeholder="No routine" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No routine</SelectItem>
                          {activeRoutines.map(r => (
                            <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Tag a routine to archive this connection together with it.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Build Sequence</label>
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
                                {pickableSkills(allItems, 0).slice().sort((a, b) => {
                                  const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                                  if (oA !== oB) return oA - oB;
                                  return b.difficulty - a.difficulty;
                                }).map(s => (
                                  <CommandItem
                                    key={s.id}
                                    value={`${skillDisplayCode(s, allItems)} ${skillDisplayName(s, allItems)} skill`}
                                    onSelect={() => { addSkillToConn(s.id.toString()); setConnSkillPickerOpen(false); }}
                                    data-testid={`pick-conn-skill-${s.id}`}
                                  >
                                    <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(s, allItems)}</span>
                                    {skillDisplayCode(s, allItems) !== skillDisplayName(s, allItems) && <span className="text-muted-foreground">- {skillDisplayName(s, allItems)}</span>}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                      </SearchPicker>
                      <span className="text-xs shrink-0 text-muted-foreground" data-testid="text-conn-skill-count">{connSkillIds.length} skills</span>
                      </div>
                      {(() => {
                        const recents = recentSkillIds
                          .map(id => pickableSkills(allItems, 0).find(s => s.id === id))
                          .filter((s): s is NonNullable<typeof s> => !!s);
                        if (recents.length === 0) return null;
                        return (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                            <div className="flex flex-wrap gap-1.5">
                              {recents.map(s => (
                                <button key={`conn-recent-${s.id}`} type="button" onClick={() => addSkillToConn(s.id.toString())} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-white/[0.08] text-muted-foreground bg-white/[0.025] hover:bg-white/[0.04] transition-colors active:scale-95" data-testid={`btn-conn-recent-${s.id}`}><SkillCode skill={s} allSkills={allItems} /></button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleConnChipDragEnd}>
                      <SortableContext items={connSkillIds.map((_, i) => `cs-${i}`)} strategy={rectSortingStrategy}>
                        <div className="min-h-[80px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-2 items-start">
                          {connSkillIds.map((id, idx) => {
                            const s = allItems?.find(sk => sk.id === id);
                            return (
                              <SortableChip key={`cs-${idx}`} uid={`cs-${idx}`}>
                                <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-conn-skill-${idx}`}>
                                  <span className="py-0.5 pl-2.5 pr-1.5 flex items-center"><SkillCode skill={s} allSkills={allItems} /></span>
                                  <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => removeSkillFromConn(idx)} className="px-2.5 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-conn-skill-${idx}`} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                                </Badge>
                              </SortableChip>
                            );
                          })}
                          {connSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {shapeSwapInfo(connSkillIds, allItems, SHAPE_OPTIONS).hasShapeable && (
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!connName || isCreating} onClick={() => setConnShapeSwapOpen(true)} data-testid="btn-conn-duplicate-shape">
                        <Shapes className="h-3.5 w-3.5" /> Duplicate w/ shape
                      </Button>
                    )}

                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-sm font-medium">Total DD:</span>
                      <span className="font-mono font-bold text-primary">
                        {calcDDFromSkillIds(connSkillIds, allItems || []).toFixed(1)}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={onConnectionSubmit} disabled={isCreating || isUpdating || !connName || connSkillIds.length === 0}>
                        {editingSkill ? "Update Connection" : "Save Connection"}
                      </Button>
                      {editingSkill && <Button variant="outline" onClick={cancelEditing}>Cancel</Button>}
                    </div>
                  </div>
                  <ShapeSwapPicker
                    open={connShapeSwapOpen}
                    onOpenChange={setConnShapeSwapOpen}
                    ids={connSkillIds}
                    allSkills={allItems}
                    onPick={async (shape) => {
                      const swapped = swapSkillIdsToShape(connSkillIds, shape, allItems);
                      const word = SHAPE_OPTIONS.find(o => o.value === shape)?.word ?? "";
                      const dupName = word ? `${connName} (${word})` : connName;
                      try {
                        await createSkill({
                          name: dupName,
                          code: dupName,
                          difficulty: calcDDFromSkillIds(swapped, allItems || []),
                          isDrill: 2,
                          skillIds: swapped,
                          sourceRoutineId: connRoutineId,
                        });
                        toast({ title: "Connection duplicated", description: `Created "${dupName}"` });
                      } catch {}
                    }}
                  />
              </DialogContent>
            </Dialog>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle>Connections Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(frequentConnections)}>
                  <Table>
                    <TableHeader><TableRow className="border-white/[0.08] hover:bg-transparent">{reorderMode && <TableHead className="w-8" />}<TableHead className="eyebrow">Name</TableHead><TableHead className="eyebrow">Sequence</TableHead><TableHead className="eyebrow text-right">DD</TableHead>{!reorderMode && <TableHead className="w-10" />}</TableRow></TableHeader>
                    <SortableContext items={(frequentConnections || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {frequentConnections?.map((conn) => (
                          <SortableRow
                            key={conn.id}
                            id={`skill-${conn.id}`}
                            reorderMode={reorderMode}
                            className={editingSkill?.id === conn.id ? "bg-white/[0.04]" : ""}
                            testId={`row-connection-${conn.id}`}
                          >
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <span>{conn.name}</span>
                                {conn.id < 0 && (
                                  <PendingSyncBadge size="xs" testId={`badge-pending-connection-${conn.id}`} />
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {conn.skillIds?.map((sid, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] px-1"><SkillCode skill={allItems?.find(s => s.id === sid)} allSkills={allItems} fallback="?" /></Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{conn.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${conn.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(conn)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(conn)} data-testid={`button-archive-skill-${conn.id}`}>{conn.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </SortableRow>
                        ))}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="parts">
          <div>
            <Dialog open={(showForm || !!editingSkill) && !reorderMode} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
              <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8">
                <DialogHeader>
                  <DialogTitle>{editingSkill ? "Edit Routine Part" : "Add New Routine Part"}</DialogTitle>
                </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Routine</label>
                      <Select
                        value={partRoutineId !== null ? String(partRoutineId) : ""}
                        onValueChange={(v) => {
                          const id = parseInt(v);
                          setPartRoutineId(Number.isFinite(id) ? id : null);
                          setPartStart(1);
                          const r = activeRoutines.find(rr => rr.id === id);
                          setPartEnd(r?.skillIds.length || 10);
                          setPartNameOverride(null);
                        }}
                      >
                        <SelectTrigger data-testid="select-part-routine"><SelectValue placeholder="Pick a routine..." /></SelectTrigger>
                        <SelectContent>
                          {activeRoutines.map(r => (
                            <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedPartRoutine && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Start (1–{selectedRoutineSkillIds.length})</label>
                            <Input
                              type="number"
                              min={1}
                              max={selectedRoutineSkillIds.length}
                              value={partStart || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") { setPartStart(0); setPartNameOverride(null); return; }
                                const n = parseInt(raw);
                                if (!Number.isFinite(n)) return;
                                setPartStart(Math.max(0, Math.min(selectedRoutineSkillIds.length, n)));
                                setPartNameOverride(null);
                              }}
                              onBlur={() => {
                                const v = Math.max(1, Math.min(selectedRoutineSkillIds.length, partStart || 1));
                                setPartStart(v);
                                if (v > partEnd) setPartEnd(v);
                              }}
                              data-testid="input-part-start"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">End ({partStart}–{selectedRoutineSkillIds.length})</label>
                            <Input
                              type="number"
                              min={partStart || 1}
                              max={selectedRoutineSkillIds.length}
                              value={partEnd || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") { setPartEnd(0); setPartNameOverride(null); return; }
                                const n = parseInt(raw);
                                if (!Number.isFinite(n)) return;
                                setPartEnd(Math.max(0, Math.min(selectedRoutineSkillIds.length, n)));
                                setPartNameOverride(null);
                              }}
                              onBlur={() => {
                                const start = partStart || 1;
                                const v = Math.max(start, Math.min(selectedRoutineSkillIds.length, partEnd || start));
                                setPartEnd(v);
                              }}
                              data-testid="input-part-end"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Name</label>
                          <Input
                            value={partFinalName}
                            onChange={(e) => setPartNameOverride(e.target.value)}
                            placeholder={partAutoName}
                            data-testid="input-part-name"
                          />
                          {partNameOverride !== null && partAutoName && partNameOverride.trim() !== partAutoName && (
                            <button type="button" className="text-[10px] text-muted-foreground underline" onClick={() => setPartNameOverride(null)}>
                              Reset to "{partAutoName}"
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Skills in this part</label>
                          <div className="min-h-[60px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-1.5 items-start">
                            {partSliceIds.length === 0 ? (
                              <span className="text-xs text-muted-foreground p-1">Empty range</span>
                            ) : (
                              partSliceIds.map((sid, i) => {
                                const s = allItems?.find(sk => sk.id === sid);
                                return (
                                  <Badge key={`pp-${i}`} variant="outline" className="font-mono text-[10px]">
                                    {effectivePartStart + i}. <SkillCode skill={s} allSkills={allItems} fallback="?" />
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="pt-1 flex justify-between items-center">
                          <span className="text-sm font-medium">Total DD:</span>
                          <span className="font-mono font-bold text-primary">
                            {calcDDFromSkillIds(partSliceIds, allItems || []).toFixed(1)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={onRoutinePartSubmit}
                        disabled={isCreating || isUpdating || !selectedPartRoutine || partSliceIds.length === 0 || !partFinalName}
                        data-testid="button-save-part"
                      >
                        {editingSkill ? "Update Part" : "Save Part"}
                      </Button>
                      {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                    </div>
                  </div>
              </DialogContent>
            </Dialog>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle>Routine Parts Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(routineParts)}>
                  <Table>
                    <TableHeader><TableRow className="border-white/[0.08] hover:bg-transparent">{reorderMode && <TableHead className="w-8" />}<TableHead className="eyebrow">Name</TableHead><TableHead className="eyebrow">Sequence</TableHead><TableHead className="eyebrow text-right">DD</TableHead>{!reorderMode && <TableHead className="w-10" />}</TableRow></TableHeader>
                    <SortableContext items={(routineParts || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {routineParts?.map((part) => (
                          <SortableRow
                            key={part.id}
                            id={`skill-${part.id}`}
                            reorderMode={reorderMode}
                            className={editingSkill?.id === part.id ? "bg-white/[0.04]" : ""}
                            testId={`row-part-${part.id}`}
                          >
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <span>{part.name}</span>
                                {part.id < 0 && (
                                  <PendingSyncBadge size="xs" testId={`badge-pending-part-${part.id}`} />
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {part.skillIds?.map((sid, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] px-1"><SkillCode skill={allItems?.find(s => s.id === sid)} allSkills={allItems} fallback="?" /></Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-primary tabular-nums">{part.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${part.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(part)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(part)} data-testid={`button-archive-skill-${part.id}`}>{part.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: part.id, name: part.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </SortableRow>
                        ))}
                        {routineParts && routineParts.length === 0 && (
                          <TableRow><TableCell colSpan={reorderMode ? 4 : 5} className="text-center text-xs text-muted-foreground py-6">No routine parts yet. Pick a routine and a range above to create one.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </SortableContext>
                  </Table>
                </DndContext>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description={deleteTarget && shapesOf(deleteTarget.id).length > 0
          ? `This will also delete its ${shapesOf(deleteTarget.id).length} shape variant(s). This action cannot be undone.`
          : "This action cannot be undone."}
        onConfirm={() => { if (deleteTarget) { deleteSkill(deleteTarget.id); setDeleteTarget(null); } }}
        confirmLabel="Delete"
      />

      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) { setAssignTarget(null); setAssignBaseId(""); setAssignShapeLabel(""); } }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign as shape</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nest <span className="font-medium text-foreground">{assignTarget?.name}</span> under a base {assignTarget?.isDrill === 1 ? "drill" : "skill"} as one of its shape variants. Its notes and history are preserved.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Base {assignTarget?.isDrill === 1 ? "drill" : "skill"}</label>
              <Select value={assignBaseId} onValueChange={setAssignBaseId}>
                <SelectTrigger data-testid="select-assign-base"><SelectValue placeholder={`Pick a base ${assignTarget?.isDrill === 1 ? "drill" : "skill"}...`} /></SelectTrigger>
                <SelectContent>
                  {(allItems || []).filter(s =>
                    !!assignTarget &&
                    s.id !== assignTarget.id &&
                    s.parentSkillId == null &&
                    s.isDrill === assignTarget.isDrill &&
                    s.archived !== 1
                  ).map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      <span className="font-mono mr-2">{s.code}</span> {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Shape</label>
              <Select value={assignShapeLabel || undefined} onValueChange={setAssignShapeLabel}>
                <SelectTrigger className="font-mono" data-testid="select-assign-shape-label"><SelectValue placeholder="Pick a shape..." /></SelectTrigger>
                <SelectContent>
                  {SHAPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-mono mr-2">{o.value}</span>{o.word}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!assignBaseId || !assignShapeLabel || isUpdating}
                onClick={async () => {
                  if (!assignTarget || !assignBaseId || !assignShapeLabel) return;
                  await updateSkill({ id: assignTarget.id, parentSkillId: parseInt(assignBaseId), shape: assignShapeLabel.trim() || null });
                  setAssignTarget(null);
                  setAssignBaseId("");
                  setAssignShapeLabel("");
                }}
                data-testid="button-confirm-assign"
              >
                Assign
              </Button>
              <Button type="button" variant="outline" onClick={() => { setAssignTarget(null); setAssignBaseId(""); setAssignShapeLabel(""); }}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
        title={`Archive "${archiveTarget?.name}"?`}
        description={`This ${archiveTarget?.kind ?? "item"} will be hidden from active lists. You can restore it later from the Archived view.`}
        onConfirm={confirmArchive}
        confirmLabel="Archive"
        variant="default"
      />
    </div>
  );
}
