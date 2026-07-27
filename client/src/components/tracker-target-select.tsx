import { useMemo } from "react";
import type { Routine, Skill } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pickableSkills, skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import { encodeTarget } from "@/lib/tracker-target";

// Grouped target picker shared by the ToF and Execution trackers: pick a
// routine OR any loggable library item (skill, drill, connection, routine
// part). Values are encoded "r:<routineId>" / "s:<skillId>".
export function TrackerTargetSelect({
  value,
  onValueChange,
  routines,
  allSkills,
  currentFallback,
  testId,
  placeholder = "Pick target...",
}: {
  value: string;
  onValueChange: (v: string) => void;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
  /** Keeps an archived/deleted current selection visible while editing. */
  currentFallback?: { value: string; label: string } | null;
  testId?: string;
  placeholder?: string;
}) {
  const groups = useMemo(() => {
    const bySort = (a: Skill, b: Skill) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    const itemLabel = (s: Skill) => {
      const code = skillDisplayCode(s, allSkills);
      const name = skillDisplayName(s, allSkills);
      return code && code !== name ? `${code} · ${name}` : name;
    };
    const skillGroup = (label: string, kind: number) => ({
      label,
      items: pickableSkills(allSkills, kind)
        .slice()
        .sort(bySort)
        .map(s => ({ value: encodeTarget("skill", s.id), label: itemLabel(s) })),
    });
    return [
      {
        label: "Routines",
        items: (routines ?? [])
          .filter(r => r.archived !== 1)
          .map(r => ({ value: encodeTarget("routine", r.id), label: r.name })),
      },
      skillGroup("Skills", 0),
      skillGroup("Drills", 1),
      skillGroup("Connections", 2),
      skillGroup("Routine Parts", 3),
    ].filter(g => g.items.length > 0);
  }, [routines, allSkills]);

  const known = groups.some(g => g.items.some(i => i.value === value));

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map(g => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.items.map(i => (
              <SelectItem key={i.value} value={i.value} data-testid={`option-target-${i.value.replace(":", "-")}`}>
                {i.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {currentFallback && !known && currentFallback.value === value && (
          <SelectItem value={currentFallback.value}>{currentFallback.label}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
