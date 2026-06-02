import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { SortableSkillRow } from "@/components/sortable-skill-row";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Skill } from "@shared/schema";

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

  const addSkill = (val: string) => {
    onSkillIdsChange([...skillIds, parseInt(val)]);
  };

  const availableSkills = filterSkills
    ? allSkills.filter(filterSkills).sort((a, b) => b.difficulty - a.difficulty)
    : [...allSkills].sort((a, b) => b.difficulty - a.difficulty);

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
                    code={sk?.code}
                    name={sk?.name}
                    isDrill={sk?.isDrill}
                    onRemove={() => removeSkill(i)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="shrink-0 mt-2">
        <Select key={skillIds.length} onValueChange={addSkill}>
          <SelectTrigger className="h-9 text-xs rounded-xl border-border bg-background">
            <SelectValue placeholder="Add skill..." />
          </SelectTrigger>
          <SelectContent>
            {availableSkills.map(s => (
              <SelectItem key={s.id} value={s.id.toString()}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    "font-mono text-[10px]",
                    s.isDrill === 3 ? "border-gray-400 text-gray-600" :
                    s.isDrill === 2 ? "border-red-300 text-red-500" : ""
                  )}>{s.code}</Badge>
                  <span className="text-xs">{s.name}</span>
                  {s.isDrill === 2 && <span className="text-[10px] text-red-500 font-medium">(Connection)</span>}
                  {s.isDrill === 3 && <span className="text-[10px] text-gray-600 font-medium">(Routine Part)</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
