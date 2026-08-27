import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { SortableSkillRow } from "@/components/sortable-skill-row";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchPicker } from "@/components/search-picker";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Skill } from "@shared/schema";
import { skillDisplayCode, skillDisplayName, skillHasShapeChildren } from "@/lib/training-utils";

interface SkillEditorOverlayProps {
  title: string;
  skillIds: number[];
  allSkills: Skill[];
  onSkillIdsChange: (ids: number[]) => void;
  onClose: () => void;
  uidPrefix?: string;
  filterSkills?: (s: Skill) => boolean;
  className?: string;
  closeLabel?: string;
  closeVariant?: "button" | "icon";
}

export function SkillEditorOverlay({
  title,
  skillIds,
  allSkills,
  onSkillIdsChange,
  onClose,
  uidPrefix = "skill",
  filterSkills,
  className,
  closeLabel = "Done",
  closeVariant = "button",
}: SkillEditorOverlayProps) {
  const sensors = useDndSensors();
  const uids = skillIds.map((id, i) => `${uidPrefix}-${id}-${i}`);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = uids.indexOf(active.id as string);
    const newIdx = uids.indexOf(over.id as string);
    onSkillIdsChange(arrayMove(skillIds, oldIdx, newIdx));
  };

  const removeSkill = (idx: number) => {
    onSkillIdsChange(skillIds.filter((_, i) => i !== idx));
  };

  const addSkill = (id: number) => {
    onSkillIdsChange([...skillIds, id]);
    setPickerOpen(false);
  };

  const availableSkills = (filterSkills ? allSkills.filter(filterSkills) : [...allSkills])
    .filter(s => !skillHasShapeChildren(s.id, allSkills))
    .sort((a, b) => b.difficulty - a.difficulty);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="font-semibold text-sm">{title}</span>
        {closeVariant === "button" ? (
          <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs rounded-xl" onClick={onClose}>{closeLabel}</Button>
        ) : (
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={uids} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {skillIds.map((sid, i) => {
                const sk = allSkills.find(s => s.id === sid);
                return (
                  <SortableSkillRow
                    key={uids[i]}
                    uid={uids[i]}
                    code={skillDisplayCode(sk, allSkills)}
                    name={skillDisplayName(sk, allSkills)}
                    isDrill={sk?.isDrill}
                    onRemove={() => removeSkill(i)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="shrink-0 mt-2 h-11 rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
        <SearchPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          placeholder="Add skill..."
          className="w-full h-full"
          inputClassName="text-xs"
        >
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {availableSkills.map(s => (
                <CommandItem
                  key={s.id}
                  value={`${skillDisplayCode(s, allSkills)} ${skillDisplayName(s, allSkills)}`}
                  onSelect={() => addSkill(s.id)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "font-mono text-[10px] normal-case",
                      s.isDrill === 3 ? "border-muted-foreground/40 text-muted-foreground" :
                      s.isDrill === 2 ? "border-destructive/40 text-destructive" : ""
                    )}>{skillDisplayCode(s, allSkills)}</Badge>
                    <span className="text-xs">{skillDisplayName(s, allSkills)}</span>
                    {s.isDrill === 2 && <span className="text-[10px] text-destructive font-medium">(Connection)</span>}
                    {s.isDrill === 3 && <span className="text-[10px] text-muted-foreground font-medium">(Routine Part)</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </SearchPicker>
      </div>
    </div>
  );
}
