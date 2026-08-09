import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useSkills } from "@/hooks/use-skills";
import { useRoutines } from "@/hooks/use-routines";
import { useNotes } from "@/hooks/use-notes";
import { calcDDFromSkillIds, parseNoteSkills, skillDisplayCode, skillDisplayName, pickableSkills } from "@/lib/training-utils";
import { SkillCode } from "@/components/skill-code";
import { useLongPressDndSensors } from "@/hooks/use-dnd-sensors";
import { useTypeToSearch } from "@/hooks/use-type-to-search";
import { PageLayout } from "@/components/page-layout";
import { PageHeader, primaryActionClass, headerActionClass } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { SearchPicker } from "@/components/search-picker";
import { Trash2, Pencil, X, Layers, Archive, ArchiveRestore, MoreVertical, Search, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { type Routine, type RoutineWithVersions, type Skill } from "@shared/schema";
import { sameLineup, applyLineupChange } from "@shared/routine-versions";
import { api } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableChip } from "@/components/sortable-chip";
import { useRecentSkills, addRecentSkill } from "@/hooks/use-recent-skills";
import { getArchivePartsWithRoutine } from "@/lib/archive-cascade";

export default function RoutinesPage() {
  const [, navigate] = useLocation();
  const { data: allItems, updateSkill } = useSkills();
  const skills = allItems?.filter(item => item.isDrill === 0 && item.archived !== 1);
  const { data: allRoutines, createRoutine, deleteRoutine, updateRoutine, isCreating, isUpdating } = useRoutines();
  const { data: notes } = useNotes();

  const firstPracticedByRoutine = useMemo(() => {
    const map = new Map<number, string>();
    for (const note of notes ?? []) {
      const ids = new Set<number>();
      for (const it of parseNoteSkills(note.skills)) {
        if (it.id === -2 && typeof it.routineId === "number") ids.add(it.routineId);
      }
      for (const rid of Array.from(ids)) {
        const existing = map.get(rid);
        if (!existing || note.date < existing) map.set(rid, note.date);
      }
    }
    return map;
  }, [notes]);

  const [editingRoutine, setEditingRoutine] = useState<RoutineWithVersions | null>(null);
  const [name, setName] = useState("");
  // "When does this change apply?" dialog for lineup edits on a routine with
  // training history (from-a-day vs rewrite-all).
  const [applyChangeOpen, setApplyChangeOpen] = useState(false);
  const [applyMode, setApplyMode] = useState<"fromDay" | "rewrite">("fromDay");
  const [applyFromDay, setApplyFromDay] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string } | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [topPickerOpen, setTopPickerOpen] = useState(false);
  const topPickerInputRef = useRef<HTMLInputElement>(null);
  useTypeToSearch(true, topPickerOpen, topPickerInputRef);

  const routines = allRoutines?.filter(r => showArchived ? r.archived === 1 : r.archived !== 1);
  const archivedCount = allRoutines ? allRoutines.filter(r => r.archived === 1).length : 0;

  // Cascade a routine's archived flag to its OWN linked items — routine parts
  // (isDrill === 3) AND connections (isDrill === 2) tagged with this routine via
  // sourceRoutineId — when the "Archive Parts With Routine" preference is on
  // (default). Gated client-side so the Settings toggle can disable it.
  const cascadeArchiveToLinked = async (routineId: number, archived: number) => {
    if (!getArchivePartsWithRoutine()) return;
    // Don't treat unloaded skills data as "no linked items" — fetch fresh if needed.
    const items =
      allItems ??
      ((await queryClient.fetchQuery({ queryKey: [api.skills.list.path] })) as Skill[]);
    const linked = (items ?? []).filter(
      (it) => (it.isDrill === 3 || it.isDrill === 2) && it.sourceRoutineId === routineId,
    );
    await Promise.all(linked.map((p) => updateSkill({ id: p.id, archived })));
  };

  const toggleArchive = async (routine: Routine) => {
    if (routine.archived === 1) {
      await updateRoutine({ id: routine.id, archived: 0 });
      await cascadeArchiveToLinked(routine.id, 0);
    } else {
      setArchiveTarget({ id: routine.id, name: routine.name });
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    await updateRoutine({ id: archiveTarget.id, archived: 1 });
    await cascadeArchiveToLinked(archiveTarget.id, 1);
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
      const lineupChanged = !sameLineup(selectedSkillIds, editingRoutine.skillIds);
      // Changing the lineup of a routine that's already been trained would
      // silently rewrite history — ask when the change applies first.
      // Name-only edits (and unpracticed routines) save straight through.
      if (lineupChanged && firstPracticedByRoutine.has(editingRoutine.id)) {
        setApplyMode("fromDay");
        // Athlete-local today (never the server clock).
        setApplyFromDay(format(new Date(), "yyyy-MM-dd"));
        setApplyChangeOpen(true);
        return;
      }
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

  const confirmApplyChange = async () => {
    if (!editingRoutine) return;
    const payload: Parameters<typeof updateRoutine>[0] = {
      id: editingRoutine.id,
      name,
      code: name,
      skillIds: selectedSkillIds,
    };
    if (applyMode === "fromDay" && applyFromDay) {
      payload.applyFromDay = applyFromDay;
      // Precompute the resulting version list so the offline mirror shows the
      // right historical lineups even while the edit is still queued. The
      // server runs the identical pure function and remains the authority.
      payload.versions = applyLineupChange(
        editingRoutine.skillIds,
        editingRoutine.versions,
        applyFromDay,
      );
    } else {
      // Rewrite all history: the new lineup applies everywhere.
      payload.versions = [];
    }
    setApplyChangeOpen(false);
    await updateRoutine(payload);
    setEditingRoutine(null);
    setName("");
    setSelectedSkillIds([]);
    setShowBuilder(false);
  };

  const startEditing = (routine: RoutineWithVersions) => {
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
        subtitle=""
        actions={
          <>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowArchived(v => !v); cancelEditing(); }}
              className={cn(headerActionClass, "shrink-0", !showArchived && "text-muted-foreground hover:text-foreground")}
              data-testid="button-toggle-archived"
            >
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
            <Button onClick={openBuilder} className={primaryActionClass} data-testid="button-new-routine">
              <Plus className="w-5 h-5" /> New Routine
            </Button>
          </>
        }
      />
      <Dialog open={showBuilder || !!editingRoutine} onOpenChange={(o) => { if (!o) cancelEditing(); }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
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
              <SearchPicker
                open={topPickerOpen}
                onOpenChange={(v) => { if (v && selectedSkillIds.length >= 10) return; setTopPickerOpen(v); }}
                disabled={selectedSkillIds.length >= 10}
                placeholder={selectedSkillIds.length >= 10 ? "Maximum 10 skills reached" : "Add skill to routine..."}
                className="h-10 flex-1 rounded-xl border border-input bg-background focus-within:ring-1 focus-within:ring-ring"
                inputTestId="btn-open-routine-top-picker"
                inputRef={topPickerInputRef}
              >
                    <CommandList className="max-h-[280px]">
                      <CommandEmpty>No matches.</CommandEmpty>
                      <CommandGroup heading="Skills">
                        {pickableSkills(allItems, 0).slice().sort((a, b) => {
                          const oA = a.sortOrder ?? 999999, oB = b.sortOrder ?? 999999;
                          if (oA !== oB) return oA - oB;
                          return b.difficulty - a.difficulty;
                        }).map(skill => (
                          <CommandItem
                            key={skill.id}
                            value={`${skillDisplayCode(skill, allItems)} ${skillDisplayName(skill, allItems)} skill`}
                            onSelect={() => { handleAddSkill(skill.id); setTopPickerOpen(false); }}
                            data-testid={`pick-routine-skill-${skill.id}`}
                          >
                            <span className="font-mono text-xs font-semibold text-foreground mr-2">{skillDisplayCode(skill, allItems)}</span>
                            {skillDisplayCode(skill, allItems) !== skillDisplayName(skill, allItems) && <span className="text-muted-foreground">- {skillDisplayName(skill, allItems)}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
              </SearchPicker>
              <span className={cn("text-xs shrink-0 font-mono", selectedSkillIds.length >= 10 ? "text-red-500 font-bold" : "text-muted-foreground")} data-testid="text-routine-count">{selectedSkillIds.length}/10</span>
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
                      <button key={`routine-recent-${s.id}`} type="button" disabled={selectedSkillIds.length >= 10} onClick={() => handleAddSkill(s.id)} className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border border-white/[0.08] text-muted-foreground bg-white/[0.025] hover:bg-white/[0.04] transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none" data-testid={`btn-routine-recent-${s.id}`}><SkillCode skill={s} allSkills={allItems} /></button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <DndContext sensors={longPressSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedSkillIds.map((_, i) => `slot-${i}`)} strategy={rectSortingStrategy}>
                <div className="min-h-[80px] rounded-lg p-2 bg-white/[0.02] flex flex-wrap gap-2 items-start">
                  {selectedSkillIds.map((id, idx) => {
                    const s = skills?.find(sk => sk.id === id);
                    return (
                      <SortableChip key={`slot-${idx}`} uid={`slot-${idx}`}>
                        <Badge variant="secondary" className="gap-0 pr-0 py-0 items-stretch overflow-hidden" data-testid={`chip-routine-skill-${idx}`}>
                          <span className="py-0.5 pl-2.5 pr-1.5 flex items-center"><SkillCode skill={s} allSkills={allItems} /></span>
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

      <Dialog open={applyChangeOpen} onOpenChange={(o) => { if (!o) setApplyChangeOpen(false); }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>When does this change apply?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            “{editingRoutine?.name}” already has training history. Choose when the new lineup takes effect.
          </p>
          <RadioGroup
            value={applyMode}
            onValueChange={(v) => setApplyMode(v as "fromDay" | "rewrite")}
            className="gap-2"
          >
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                applyMode === "fromDay" ? "border-primary/60 bg-primary/5" : "border-white/[0.08]",
              )}
            >
              <RadioGroupItem value="fromDay" className="mt-0.5" data-testid="radio-apply-from-day" />
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-medium leading-none">From a day…</div>
                <p className="text-xs text-muted-foreground">
                  Sessions before this day keep the old lineup; this day onward uses the new one.
                </p>
                <Input
                  type="date"
                  value={applyFromDay}
                  onChange={(e) => setApplyFromDay(e.target.value)}
                  disabled={applyMode !== "fromDay"}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 mt-1"
                  data-testid="input-apply-from-day"
                />
              </div>
            </label>
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                applyMode === "rewrite" ? "border-primary/60 bg-primary/5" : "border-white/[0.08]",
              )}
            >
              <RadioGroupItem value="rewrite" className="mt-0.5" data-testid="radio-apply-rewrite" />
              <div className="flex-1 space-y-1">
                <div className="text-sm font-medium leading-none">Rewrite all history</div>
                <p className="text-xs text-muted-foreground">
                  Every past session counts against the new lineup, as if it was always this way.
                </p>
              </div>
            </label>
          </RadioGroup>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 h-11"
              onClick={confirmApplyChange}
              disabled={isUpdating || (applyMode === "fromDay" && !applyFromDay)}
              data-testid="button-confirm-apply-change"
            >
              {isUpdating ? "Saving..." : "Save Change"}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setApplyChangeOpen(false)}>
              Back
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {routines?.map((routine) => {
          const dd = calcDDFromSkillIds(routine.skillIds, allItems || []);
          const firstPracticed = firstPracticedByRoutine.get(routine.id);
          const practicedLabel = firstPracticed
            ? (() => { const [y, m, d] = firstPracticed.split("-"); return `${d}-${m}-${y}`; })()
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
                  {practicedLabel && (
                    <span className="text-[10px] font-mono font-normal text-muted-foreground shrink-0" data-testid={`text-routine-first-practiced-${routine.id}`}>{practicedLabel}</span>
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
                      className="text-center text-[11px] font-mono text-muted-foreground bg-white/[0.03] border border-white/[0.07] rounded-md px-1 py-1 truncate"
                      title={skillDisplayName(skill, allItems)}
                    >
                      <SkillCode skill={skill} allSkills={allItems} fallback="—" />
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
