import { useState } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { calcDDFromSkillIds } from "@/lib/training-utils";
import { useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, Pencil, X, Layers, Archive, ArchiveRestore, MoreVertical, Search, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { type Routine } from "@shared/schema";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableChip } from "@/components/sortable-chip";
import { useRecentSkills, addRecentSkill } from "@/hooks/use-recent-skills";

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
  const [showBuilder, setShowBuilder] = useState(false);
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

  const longPressSensors = useLongPressDndSensors();
  const recentSkillIds = useRecentSkills();

  const handleAddSkill = (skillId: number) => {
    addRecentSkill(skillId);
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
    setShowBuilder(false);
  };

  const startEditing = (routine: Routine) => {
    setEditingRoutine(routine);
    setName(routine.name);
    setSelectedSkillIds(routine.skillIds.slice(0, 10));
    setShowBuilder(true);
  };

  const cancelEditing = () => {
    if (editingRoutine) {
      setEditingRoutine(null);
      setName("");
      setSelectedSkillIds([]);
    }
    setTopPickerOpen(false);
    setShowBuilder(false);
  };

  const openBuilder = () => {
    setEditingRoutine(null);
    setShowBuilder(true);
  };


  return (
    <PageLayout>
      <PageHeader
        eyebrow="Routine Builder"
        title="My Routines"
        accent="Routines"
        subtitle="Build and manage your 10-skill competition routines."
        actions={
          <>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowArchived(v => !v); cancelEditing(); }}
              className="gap-1.5 shrink-0 h-12 rounded-xl"
              data-testid="button-toggle-archived"
            >
              {showArchived ? <><ArchiveRestore className="h-4 w-4" /> Active</> : <><Archive className="h-4 w-4" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}</>}
            </Button>
            <Button onClick={openBuilder} className={primaryActionClass} data-testid="button-new-routine">
              <Plus className="w-5 h-5" /> New Routine
            </Button>
          </>
        }
      />
      <Dialog open={showBuilder || !!editingRoutine} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoutine ? "Edit Routine" : "Create Routine (10 Skills)"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
            {(() => {
              const recents = recentSkillIds
                .map(id => skills?.find(s => s.id === id))
                .filter((s): s is NonNullable<typeof s> => !!s);
              if (recents.length === 0) return null;
              return (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                  <div className="flex flex-wrap gap-1.5">
                    {recents.map(s => (
                      <button key={`routine-recent-${s.id}`} type="button" disabled={selectedSkillIds.length >= 10} onClick={() => handleAddSkill(s.id)} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-border/60 text-muted-foreground bg-secondary/30 hover:bg-secondary/50 transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none" data-testid={`btn-routine-recent-${s.id}`}>{s.code}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedSkillIds.map((_, i) => `slot-${i}`)} strategy={rectSortingStrategy}>
                <div className="min-h-[80px] rounded-lg p-2 bg-muted/30 flex flex-wrap gap-2 items-start">
                  {selectedSkillIds.map((id, idx) => {
                    const s = skills?.find(sk => sk.id === id);
                    return (
                      <SortableChip key={`slot-${idx}`} uid={`slot-${idx}`}>
                        <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-routine-skill-${idx}`}>
                          <span className="py-0.5 pl-2.5 pr-1.5 flex items-center">{s?.code}</span>
                          <button type="button" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onClick={() => handleRemoveSkill(idx)} className="px-2.5 flex items-center justify-center hover:bg-muted/60 active:bg-muted" data-testid={`btn-remove-routine-skill-${idx}`} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                        </Badge>
                      </SortableChip>
                    );
                  })}
                  {selectedSkillIds.length === 0 && <span className="text-xs text-muted-foreground p-2">No skills added yet</span>}
                </div>
              </SortableContext>
            </DndContext>
            <div className="pt-4 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total Difficulty</span>
              <span className="text-2xl font-display font-normal text-primary">
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
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {routines?.map((routine) => {
          const dd = calcDDFromSkillIds(routine.skillIds, allItems || []);
          const created = routine.createdAt ? new Date(routine.createdAt) : null;
          const createdLabel = created && !isNaN(created.getTime())
            ? `${String(created.getDate()).padStart(2, "0")}-${String(created.getMonth() + 1).padStart(2, "0")}-${created.getFullYear()}`
            : null;
          return (
            <div
              key={routine.id}
              className={cn(
                "relative card-3d card-3d-hover rounded-2xl p-5 pl-6 cursor-pointer overflow-hidden",
                editingRoutine?.id === routine.id && "ring-1 ring-primary",
              )}
              onClick={() => navigate(`/routines/${routine.id}`)}
              data-testid={`card-routine-${routine.id}`}
            >
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-full" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-base leading-tight flex items-center gap-2 flex-wrap min-w-0 pt-1">
                  <span className="truncate">{routine.name}</span>
                  {createdLabel && (
                    <span className="text-[10px] font-mono font-normal text-muted-foreground shrink-0" data-testid={`text-routine-created-${routine.id}`}>{createdLabel}</span>
                  )}
                  {routine.id < 0 && (
                    <PendingSyncBadge testId={`badge-pending-routine-${routine.id}`} />
                  )}
                </h3>
                <div className="flex items-start gap-1 shrink-0">
                  <div className="text-right leading-none">
                    <div className="text-4xl font-display font-normal text-emerald-400 tracking-tight">{dd.toFixed(1)}</div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">DD</div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 text-muted-foreground/50 hover:text-foreground" data-testid={`button-actions-routine-${routine.id}`}><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36 rounded-xl">
                        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => startEditing(routine)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={() => toggleArchive(routine)} data-testid={`button-archive-routine-${routine.id}`}>{routine.archived === 1 ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: routine.id, name: routine.name })}><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5 mt-4">
                {routine.skillIds.map((id, idx) => {
                  const skill = skills?.find(s => s.id === id);
                  return (
                    <span
                      key={idx}
                      className="text-center text-[11px] font-mono text-muted-foreground bg-secondary/40 border border-border/50 rounded-md px-1 py-1 truncate"
                      title={skill?.name}
                    >
                      {skill?.code || "—"}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {routines?.length === 0 && (
          <div className="col-span-full text-center py-20 card-3d rounded-2xl">
            <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">{showArchived ? "No archived routines." : "No routines yet."}</p>
            {!showArchived && (
              <Button onClick={openBuilder} variant="outline" className="mt-4 rounded-xl" data-testid="button-new-routine-empty">
                <Plus className="w-4 h-4 mr-1" /> New Routine
              </Button>
            )}
          </div>
        )}
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
