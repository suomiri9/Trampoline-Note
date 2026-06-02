import { useState } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
import { PageLayout } from "@/components/page-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, GripVertical, Pencil, X, Layers, Archive, ArchiveRestore, MoreVertical, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { type Routine } from "@shared/schema";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableFilledSlot({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 flex-1 min-w-0"
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing flex items-center justify-center w-5 h-5 text-muted-foreground/60 hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
        data-testid={`btn-grip-routine-${id}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

export default function RoutinesPage() {
  const [, navigate] = useLocation();
  const { data: allItems } = useSkills();
  const skills = allItems?.filter(item => item.isDrill === 0 && item.archived !== 1);
  const { data: allRoutines, createRoutine, deleteRoutine, updateRoutine, isCreating, isUpdating } = useRoutines();
  
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string } | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [topPickerOpen, setTopPickerOpen] = useState(false);
  const [topPickerSearch, setTopPickerSearch] = useState("");
  useTypeToSearch(true, topPickerOpen, setTopPickerOpen, setTopPickerSearch);

  const routines = allRoutines?.filter(r => showArchived ? r.archived === 1 : r.archived !== 1);
  const archivedCount = allRoutines ? allRoutines.filter(r => r.archived === 1).length : 0;

  const toggleArchive = async (routine: Routine) => {
    if (routine.archived === 1) {
      await updateRoutine({ id: routine.id, archived: 0 });
    } else {
      setArchiveTarget({ id: routine.id, name: routine.name });
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    await updateRoutine({ id: archiveTarget.id, archived: 1 });
    setArchiveTarget(null);
  };

  const sensors = useDndSensors();

  const handleAddSkill = (skillId: number) => {
    setSelectedSkillIds(prev => prev.length >= 10 ? prev : [...prev, skillId]);
  };

  const handleRemoveSkill = (index: number) => {
    setSelectedSkillIds(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = parseInt(String(active.id).replace("slot-", ""));
    const newIdx = parseInt(String(over.id).replace("slot-", ""));
    if (isNaN(oldIdx) || isNaN(newIdx)) return;
    setSelectedSkillIds(prev => arrayMove([...prev], oldIdx, newIdx));
  };

  const handleCreate = async () => {
    if (!name || selectedSkillIds.length !== 10) return;

    if (editingRoutine) {
      await updateRoutine({
        id: editingRoutine.id,
        name,
        code: name,
        skillIds: selectedSkillIds,
      });
      setEditingRoutine(null);
    } else {
      await createRoutine({
        name,
        code: name,
        skillIds: selectedSkillIds,
      });
    }

    setName("");
    setSelectedSkillIds([]);
  };

  const startEditing = (routine: Routine) => {
    setEditingRoutine(routine);
    setName(routine.name);
    setSelectedSkillIds(routine.skillIds.slice(0, 10));
  };

  const cancelEditing = () => {
    setEditingRoutine(null);
    setName("");
    setSelectedSkillIds([]);
    setTopPickerOpen(false);
  };


  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/30 rounded-2xl shrink-0 icon-3d">
          <Layers className="w-6 h-6 text-zinc-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold">Routines</h1>
          <p className="text-muted-foreground text-sm">Build and manage your competition routines.</p>
        </div>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowArchived(v => !v); cancelEditing(); }}
          className="gap-1.5 shrink-0"
          data-testid="button-toggle-archived"
        >
          {showArchived ? <><ArchiveRestore className="h-4 w-4" /> Active</> : <><Archive className="h-4 w-4" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}</>}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              {editingRoutine ? "Edit Routine" : "Create Routine (10 Skills)"}
              {editingRoutine && <Button variant="ghost" size="icon" onClick={cancelEditing}><X className="h-4 w-4" /></Button>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!editingRoutine && allRoutines && allRoutines.filter(r => r.archived !== 1).length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Duplicate from existing</label>
                <Select value="" onValueChange={(v) => {
                  const src = allRoutines?.find(r => r.id === parseInt(v));
                  if (!src) return;
                  setName(`${src.name} (copy)`);
                  setSelectedSkillIds(src.skillIds.slice(0, 10));
                }}>
                  <SelectTrigger data-testid="select-duplicate-routine"><SelectValue placeholder="Pick a routine to copy..." /></SelectTrigger>
                  <SelectContent>
                    {allRoutines.filter(r => r.archived !== 1).map(r => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Input 
              placeholder="Routine Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div className="flex items-center gap-2">
              <Popover open={topPickerOpen} onOpenChange={(v) => { if (selectedSkillIds.length >= 10) return; setTopPickerOpen(v); if (!v) setTopPickerSearch(""); }}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={selectedSkillIds.length >= 10}
                    className="h-10 flex-1 justify-start font-normal text-muted-foreground"
                    data-testid="btn-open-routine-top-picker"
                  >
                    <Search className="h-3.5 w-3.5 mr-2 opacity-60" />
                    {selectedSkillIds.length >= 10 ? "Maximum 10 skills reached" : "Add skill to routine..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command filter={(value, search) => { const v = value.toLowerCase(); const s = search.toLowerCase(); return v.includes(s) ? 1 : 0; }}>
                    <CommandInput placeholder="Search by name or code..." className="h-10" value={topPickerSearch} onValueChange={setTopPickerSearch} />
                    <CommandList className="max-h-[280px]">
                      <CommandEmpty>No matches.</CommandEmpty>
                      <CommandGroup heading="Skills">
                        {skills?.slice().sort((a, b) => {
                          const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                          if (oA !== oB) return oA - oB;
                          return b.difficulty - a.difficulty;
                        }).map(skill => (
                          <CommandItem
                            key={skill.id}
                            value={`${skill.code} ${skill.name} skill`}
                            onSelect={() => { handleAddSkill(skill.id); setTopPickerOpen(false); }}
                            data-testid={`pick-routine-skill-${skill.id}`}
                          >
                            <span className="font-mono text-xs font-semibold text-foreground mr-2">{skill.code}</span>
                            {skill.code !== skill.name && <span className="text-muted-foreground">- {skill.name}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <span className={cn("text-xs shrink-0 font-mono", selectedSkillIds.length >= 10 ? "text-red-500 font-bold" : "text-muted-foreground")} data-testid="text-routine-count">{selectedSkillIds.length}/10</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedSkillIds.map((_, i) => `slot-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, index) => {
                    const id = selectedSkillIds[index];
                    const skill = id !== undefined ? skills?.find(s => s.id === id) : null;
                    return (
                      <div key={index} className="flex items-center gap-2 min-h-[40px]" data-testid={`row-routine-slot-${index}`}>
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                        {skill ? (
                          <SortableFilledSlot id={`slot-${index}`}>
                            <Badge variant="outline" className="font-mono bg-secondary/50 px-2 py-1">
                              {skill.code}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{skill.name}</span>
                            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                              {skill.difficulty.toFixed(1)}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => handleRemoveSkill(index)}
                              className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                              data-testid={`btn-remove-routine-slot-${index}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </SortableFilledSlot>
                        ) : (
                          <div className="flex-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
            <div className="pt-4 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total Difficulty</span>
              <span className="text-2xl font-bold text-primary">
                {calcDDFromSkillIds(selectedSkillIds.filter((id): id is number => id !== null), allItems || []).toFixed(1)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button 
                className="flex-1 h-11" 
                onClick={handleCreate} 
                disabled={isCreating || isUpdating || !name || selectedSkillIds.length !== 10}
              >
                {isCreating || isUpdating ? "Saving..." : editingRoutine ? "Update Routine" : "Save Routine"}
              </Button>
              {editingRoutine && (
                <Button variant="outline" className="h-11" onClick={cancelEditing}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Saved Routines</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {routines?.map((routine) => (
                <Card key={routine.id} className={cn("overflow-hidden cursor-pointer hover:shadow-md transition-shadow", editingRoutine?.id === routine.id && "ring-2 ring-primary")} onClick={() => navigate(`/routines/${routine.id}`)} data-testid={`card-routine-${routine.id}`}>
                  <div className="p-4 flex items-center justify-between bg-muted/30">
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2 flex-wrap">
                        <span>{routine.name}</span>
                        {routine.id < 0 && (
                          <PendingSyncBadge testId={`badge-pending-routine-${routine.id}`} />
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">Total Difficulty: {calcDDFromSkillIds(routine.skillIds, allItems || []).toFixed(1)}</p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-routine-${routine.id}`}><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 rounded-xl">
                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(routine)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(routine)} data-testid={`button-archive-routine-${routine.id}`}>{routine.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: routine.id, name: routine.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="p-4 flex flex-wrap gap-4">
                    {routine.skillIds.map((id, idx) => {
                      const skill = skills?.find(s => s.id === id);
                      return (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <Badge variant="outline" className="px-2 py-1 font-mono">
                            {skill?.code || "???"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {skill?.difficulty.toFixed(1) || "0.0"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        onConfirm={() => { if (deleteTarget) { deleteRoutine(deleteTarget.id); setDeleteTarget(null); } }}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
        title={`Archive "${archiveTarget?.name}"?`}
        description="This routine will be hidden from active lists. You can restore it later from the Archived view."
        onConfirm={confirmArchive}
        confirmLabel="Archive"
        variant="default"
      />
    </PageLayout>
  );
}
