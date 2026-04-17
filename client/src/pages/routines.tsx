import { useState } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { PageLayout } from "@/components/page-layout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, GripVertical, Pencil, X, Layers, Archive, ArchiveRestore, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { type Routine } from "@shared/schema";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableSkillSlot({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 group"
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing flex items-center justify-center w-5 h-5 text-muted-foreground/40 hover:text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
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
  const [selectedSkillIds, setSelectedSkillIds] = useState<(number | null)[]>(new Array(10).fill(null));
  const [showArchived, setShowArchived] = useState(false);

  const routines = allRoutines?.filter(r => showArchived ? r.archived === 1 : r.archived !== 1);
  const archivedCount = allRoutines ? allRoutines.filter(r => r.archived === 1).length : 0;

  const toggleArchive = async (routine: Routine) => {
    await updateRoutine({ id: routine.id, archived: routine.archived === 1 ? 0 : 1 });
  };

  const sensors = useDndSensors();

  const handleAddSkill = (index: number, skillId: string) => {
    const newIds = [...selectedSkillIds];
    newIds[index] = parseInt(skillId);
    setSelectedSkillIds(newIds);
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
    if (!name || selectedSkillIds.some(id => id === null)) return;
    
    if (editingRoutine) {
      await updateRoutine({
        id: editingRoutine.id,
        name,
        skillIds: selectedSkillIds as number[],
      });
      setEditingRoutine(null);
    } else {
      await createRoutine({
        name,
        skillIds: selectedSkillIds as number[],
      });
    }
    
    setName("");
    setSelectedSkillIds(new Array(10).fill(null));
  };

  const startEditing = (routine: Routine) => {
    setEditingRoutine(routine);
    setName(routine.name);
    setSelectedSkillIds(routine.skillIds);
  };

  const cancelEditing = () => {
    setEditingRoutine(null);
    setName("");
    setSelectedSkillIds(new Array(10).fill(null));
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
            <Input 
              placeholder="Routine Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedSkillIds.map((_, i) => `slot-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                  {selectedSkillIds.map((id, index) => {
                    const selectedSkill = skills?.find(s => s.id === id);
                    return (
                      <SortableSkillSlot key={`slot-${index}`} id={`slot-${index}`}>
                        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                        <Select onValueChange={(val) => handleAddSkill(index, val)} value={id?.toString() || ""}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Skill Code" />
                          </SelectTrigger>
                          <SelectContent>
                            {skills?.slice().sort((a, b) => {
                              const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                              if (oA !== oB) return oA - oB;
                              return b.difficulty - a.difficulty;
                            }).map(skill => (
                              <SelectItem key={skill.id} value={skill.id.toString()}>
                                <span className="font-mono">{skill.code}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="w-16 flex justify-end">
                          {selectedSkill ? (
                            <Badge variant="outline" className="font-mono bg-secondary/50">
                              {selectedSkill.difficulty.toFixed(1)}
                            </Badge>
                          ) : (
                            <div className="w-8 h-4 bg-muted/20 rounded-full" />
                          )}
                        </div>
                      </SortableSkillSlot>
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
                disabled={isCreating || isUpdating || !name || selectedSkillIds.some(id => id === null)}
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
                      <h3 className="font-bold text-lg">{routine.name}</h3>
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
    </PageLayout>
  );
}
