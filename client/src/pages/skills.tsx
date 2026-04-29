import { useState } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRecentSkills, addRecentSkill } from "@/hooks/use-recent-skills";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { useDndSensors, useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { SortableChip } from "@/components/sortable-chip";
import { PageLayout } from "@/components/page-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil, X, Target, GripVertical, ArrowUpDown, Check, Archive, ArchiveRestore, MoreVertical, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSkillSchema, type Skill } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
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
  const recentSkillIds = useRecentSkills();
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  
  const [connName, setConnName] = useState("");
  const [connSkillIds, setConnSkillIds] = useState<number[]>([]);
  const [connSkillPickerOpen, setConnSkillPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string; kind: string } | null>(null);

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
  const skills = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 0 && archivedFilter(item))) : undefined;
  const drills = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 1 && archivedFilter(item))) : undefined;
  const frequentConnections = allItems ? sortByOrder(allItems.filter(item => item.isDrill === 2 && archivedFilter(item))) : undefined;
  const archivedCount = allItems ? allItems.filter(i => i.archived === 1).length : 0;

  const activeSkills = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 0 && i.archived !== 1)) : [];
  const activeDrills = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 1 && i.archived !== 1)) : [];
  const activeConnections = allItems ? sortByOrder(allItems.filter(i => i.isDrill === 2 && i.archived !== 1)) : [];

  const toggleArchive = async (skill: Skill) => {
    if (skill.archived === 1) {
      await updateSkill({ id: skill.id, archived: 0 });
    } else {
      const kind = skill.isDrill === 1 ? "drill" : skill.isDrill === 2 ? "connection" : "skill";
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

  const onSkillSubmit = async (values: any) => {
    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...values });
      setEditingSkill(null);
    } else {
      await createSkill({ ...values, isDrill: 0 });
    }
    skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
  };

  const onDrillSubmit = async (values: any) => {
    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...values });
      setEditingSkill(null);
    } else {
      await createSkill({ ...values, isDrill: 1 });
    }
    drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
  };

  const onConnectionSubmit = async () => {
    if (!connName || connSkillIds.length === 0) return;
    
    const totalDifficulty = calcDDFromSkillIds(connSkillIds, skills || []);

    const payload = {
      name: connName,
      code: connName,
      difficulty: totalDifficulty,
      isDrill: 2,
      skillIds: connSkillIds
    };

    if (editingSkill) {
      await updateSkill({ id: editingSkill.id, ...payload });
      setEditingSkill(null);
    } else {
      await createSkill(payload);
    }
    
    setConnName("");
    setConnSkillIds([]);
  };

  const startEditing = (skill: Skill) => {
    setEditingSkill(skill);
    if (skill.isDrill === 2) {
      setConnName(skill.name);
      setConnSkillIds(skill.skillIds || []);
    } else if (skill.isDrill === 1) {
      drillForm.reset({
        name: skill.name,
        code: skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
    } else {
      skillForm.reset({
        name: skill.name,
        code: skill.code,
        difficulty: skill.difficulty,
        isDrill: skill.isDrill,
      });
    }
  };

  const cancelEditing = () => {
    const isDrill = editingSkill?.isDrill;
    setEditingSkill(null);
    setConnSkillPickerOpen(false);
    if (isDrill === 2) {
      setConnName("");
      setConnSkillIds([]);
    } else if (isDrill === 1) {
      drillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 1 });
    } else {
      skillForm.reset({ name: "", code: "", difficulty: 0, isDrill: 0 });
    }
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

  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl shrink-0 icon-3d">
          <Target className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold">Skills</h1>
          <p className="text-muted-foreground text-sm">Manage your skills, drills, and frequent connections.</p>
        </div>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowArchived(v => !v); cancelEditing(); setReorderMode(false); }}
          className="gap-1.5 shrink-0"
          data-testid="button-toggle-archived"
        >
          {showArchived ? <><ArchiveRestore className="h-4 w-4" /> Active</> : <><Archive className="h-4 w-4" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}</>}
        </Button>
      </div>
      <Tabs defaultValue="skills" className="space-y-8" onValueChange={() => { cancelEditing(); setReorderMode(false); }}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="drills">Drills</TabsTrigger>
          <TabsTrigger value="connections">
            <span className="hidden sm:inline">Connections</span>
            <span className="sm:hidden">Connections</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {!reorderMode && (
              <Card className="md:col-span-1 h-fit">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex justify-between items-center text-lg">
                    {editingSkill ? "Edit Skill" : "Add New Skill"}
                    {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {!editingSkill && activeSkills.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                      <Select value="" onValueChange={(v) => {
                        const src = activeSkills.find(s => s.id === parseInt(v));
                        if (!src) return;
                        skillForm.reset({ name: `${src.name} (copy)`, code: src.code, difficulty: src.difficulty, isDrill: 0 });
                      }}>
                        <SelectTrigger data-testid="select-duplicate-skill"><SelectValue placeholder="Pick a skill to copy..." /></SelectTrigger>
                        <SelectContent>
                          {activeSkills.map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              <span className="font-mono mr-2">{s.code}</span> {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Form {...skillForm}>
                    <form onSubmit={skillForm.handleSubmit(onSkillSubmit)} className="space-y-3">
                      <FormField control={skillForm.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Back Tuck" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={skillForm.control} name="code" render={({ field }) => (
                        <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} placeholder="BT" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={skillForm.control} name="difficulty" render={({ field }) => (
                        <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {editingSkill && (
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
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                          {editingSkill ? "Update" : "Add Skill"}
                        </Button>
                        {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
            <Card className={reorderMode ? "md:col-span-3" : "md:col-span-2"}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Skills Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(skills)}>
                  <Table>
                    <TableHeader><TableRow>{reorderMode && <TableHead className="w-8" />}<TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Difficulty</TableHead>{!reorderMode && <TableHead />}</TableRow></TableHeader>
                    <SortableContext items={(skills || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {skills?.map((skill) => (
                          <SortableRow
                            key={skill.id}
                            id={`skill-${skill.id}`}
                            reorderMode={reorderMode}
                            className={cn(
                              !reorderMode && "cursor-pointer",
                              editingSkill?.id === skill.id ? "bg-muted/50" : !reorderMode && "hover:bg-muted/30"
                            )}
                            onClick={() => navigate(`/skills/${skill.id}`)}
                            testId={`row-skill-${skill.id}`}
                          >
                            <TableCell className="font-medium">{skill.name}</TableCell>
                            <TableCell>{skill.code}</TableCell>
                            <TableCell>{skill.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${skill.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(skill)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(skill)} data-testid={`button-archive-skill-${skill.id}`}>{skill.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
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

        <TabsContent value="drills" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {!reorderMode && (
              <Card className="md:col-span-1 h-fit">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex justify-between items-center text-lg">
                    {editingSkill ? "Edit Drill" : "Add New Drill"}
                    {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {!editingSkill && activeDrills.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                      <Select value="" onValueChange={(v) => {
                        const src = activeDrills.find(s => s.id === parseInt(v));
                        if (!src) return;
                        drillForm.reset({ name: `${src.name} (copy)`, code: src.code, difficulty: src.difficulty, isDrill: 1 });
                      }}>
                        <SelectTrigger data-testid="select-duplicate-drill"><SelectValue placeholder="Pick a drill to copy..." /></SelectTrigger>
                        <SelectContent>
                          {activeDrills.map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              <span className="font-mono mr-2">{s.code}</span> {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Form {...drillForm}>
                    <form onSubmit={drillForm.handleSubmit(onDrillSubmit)} className="space-y-3">
                      <FormField control={drillForm.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Tuck Jump" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={drillForm.control} name="code" render={({ field }) => (
                        <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} placeholder="TJ" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={drillForm.control} name="difficulty" render={({ field }) => (
                        <FormItem><FormLabel>Difficulty</FormLabel><FormControl><Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {editingSkill && (
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
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={isCreating || isUpdating}>
                          {editingSkill ? "Update" : "Add Drill"}
                        </Button>
                        {editingSkill && <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>}
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
            <Card className={reorderMode ? "md:col-span-3" : "md:col-span-2"}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Drills Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(drills)}>
                  <Table>
                    <TableHeader><TableRow>{reorderMode && <TableHead className="w-8" />}<TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Difficulty</TableHead>{!reorderMode && <TableHead />}</TableRow></TableHeader>
                    <SortableContext items={(drills || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {drills?.map((drill) => (
                          <SortableRow
                            key={drill.id}
                            id={`skill-${drill.id}`}
                            reorderMode={reorderMode}
                            className={cn(
                              !reorderMode && "cursor-pointer",
                              editingSkill?.id === drill.id ? "bg-muted/50" : !reorderMode && "hover:bg-muted/30"
                            )}
                            onClick={() => navigate(`/skills/${drill.id}`)}
                            testId={`row-drill-${drill.id}`}
                          >
                            <TableCell className="font-medium">{drill.name}</TableCell>
                            <TableCell>{drill.code}</TableCell>
                            <TableCell>{drill.difficulty.toFixed(1)}</TableCell>
                            {!reorderMode && (
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-skill-${drill.id}`}><MoreVertical className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(drill)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(drill)} data-testid={`button-archive-skill-${drill.id}`}>{drill.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: drill.id, name: drill.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
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

        <TabsContent value="connections" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {!reorderMode && (
              <Card className="md:col-span-1 h-fit">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex justify-between items-center text-lg">
                    {editingSkill ? "Edit Connection" : "Add New Connection"}
                    {editingSkill && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-3">
                    {!editingSkill && activeConnections.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                        <Select value="" onValueChange={(v) => {
                          const src = activeConnections.find(s => s.id === parseInt(v));
                          if (!src) return;
                          setConnName(`${src.name} (copy)`);
                          setConnSkillIds(src.skillIds || []);
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
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Build Sequence</label>
                      <Popover open={connSkillPickerOpen} onOpenChange={setConnSkillPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" role="combobox" className="w-full justify-start font-normal text-muted-foreground" data-testid="btn-open-conn-skill-picker">
                            <Search className="h-4 w-4 mr-2 opacity-60" />
                            Add skill to sequence...
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                          <Command filter={(value, search) => { const v = value.toLowerCase(); const s = search.toLowerCase(); return v.includes(s) ? 1 : 0; }}>
                            <CommandInput placeholder="Search by name or code..." className="h-10" />
                            <CommandList className="max-h-[320px]">
                              <CommandEmpty>No matches.</CommandEmpty>
                              {(() => {
                                const recents = recentSkillIds
                                  .map(id => skills?.find(s => s.id === id))
                                  .filter((s): s is NonNullable<typeof s> => !!s);
                                if (recents.length === 0) return null;
                                return (
                                  <CommandGroup heading="Recent">
                                    {recents.map(s => (
                                      <CommandItem
                                        key={`recent-${s.id}`}
                                        value={`${s.code} ${s.name} recent`}
                                        onSelect={() => { addSkillToConn(s.id.toString()); setConnSkillPickerOpen(false); }}
                                        data-testid={`pick-conn-recent-${s.id}`}
                                      >
                                        <span className="font-mono text-xs font-semibold text-foreground mr-2">{s.code}</span>
                                        {s.code !== s.name && <span className="text-muted-foreground">- {s.name}</span>}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                );
                              })()}
                              <CommandGroup heading="Skills">
                                {skills?.slice().sort((a, b) => {
                                  const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                                  if (oA !== oB) return oA - oB;
                                  return b.difficulty - a.difficulty;
                                }).map(s => (
                                  <CommandItem
                                    key={s.id}
                                    value={`${s.code} ${s.name} skill`}
                                    onSelect={() => { addSkillToConn(s.id.toString()); setConnSkillPickerOpen(false); }}
                                    data-testid={`pick-conn-skill-${s.id}`}
                                  >
                                    <span className="font-mono text-xs font-semibold text-foreground mr-2">{s.code}</span>
                                    {s.code !== s.name && <span className="text-muted-foreground">- {s.name}</span>}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleConnChipDragEnd}>
                      <SortableContext items={connSkillIds.map((_, i) => `cs-${i}`)} strategy={rectSortingStrategy}>
                        <div className="min-h-[80px] rounded-lg p-2 bg-muted/30 flex flex-wrap gap-2 items-start">
                          {connSkillIds.map((id, idx) => {
                            const s = skills?.find(sk => sk.id === id);
                            return (
                              <SortableChip key={`cs-${idx}`} uid={`cs-${idx}`}>
                                <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-conn-skill-${idx}`}>
                                  <span className="py-0.5 pl-2.5 pr-1.5 flex items-center">{s?.code}</span>
                                  <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => removeSkillFromConn(idx)} className="px-2.5 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-conn-skill-${idx}`} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                                </Badge>
                              </SortableChip>
                            );
                          })}
                          {connSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-sm font-medium">Total DD:</span>
                      <span className="font-bold text-primary">
                        {calcDDFromSkillIds(connSkillIds, skills || []).toFixed(1)}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={onConnectionSubmit} disabled={isCreating || isUpdating || !connName || connSkillIds.length === 0}>
                        {editingSkill ? "Update Connection" : "Save Connection"}
                      </Button>
                      {editingSkill && <Button variant="outline" onClick={cancelEditing}>Cancel</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className={reorderMode ? "md:col-span-3" : "md:col-span-2"}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Connections Library</CardTitle>
                {renderReorderButton()}
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(frequentConnections)}>
                  <Table>
                    <TableHeader><TableRow>{reorderMode && <TableHead className="w-8" />}<TableHead>Name</TableHead><TableHead>Sequence</TableHead><TableHead>DD</TableHead>{!reorderMode && <TableHead />}</TableRow></TableHeader>
                    <SortableContext items={(frequentConnections || []).map(s => `skill-${s.id}`)} strategy={verticalListSortingStrategy}>
                      <TableBody>
                        {frequentConnections?.map((conn) => (
                          <SortableRow
                            key={conn.id}
                            id={`skill-${conn.id}`}
                            reorderMode={reorderMode}
                            className={editingSkill?.id === conn.id ? "bg-muted/50" : ""}
                            testId={`row-connection-${conn.id}`}
                          >
                            <TableCell className="font-medium">{conn.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {conn.skillIds?.map((sid, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] px-1">{skills?.find(s => s.id === sid)?.code || "?"}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{conn.difficulty.toFixed(1)}</TableCell>
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
      </Tabs>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        onConfirm={() => { if (deleteTarget) { deleteSkill(deleteTarget.id); setDeleteTarget(null); } }}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
        title={`Archive "${archiveTarget?.name}"?`}
        description={`This ${archiveTarget?.kind ?? "item"} will be hidden from active lists. You can restore it later from the Archived view.`}
        onConfirm={confirmArchive}
        confirmLabel="Archive"
        variant="default"
      />
    </PageLayout>
  );
}
