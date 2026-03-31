import type { Skill } from "@shared/schema";

export interface SkillItem {
  id: number;
  reps?: number;
  note?: string;
  routineId?: number;
  routineName?: string;
  customSkillIds?: number[];
  attempt?: number;
}

export function parseNoteSkills(skillsString: string | null | undefined): SkillItem[] {
  if (!skillsString) return [];
  try {
    const parsed = JSON.parse(skillsString);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) =>
        typeof item === 'number' ? { id: item } : (item as SkillItem)
      );
    }
    return skillsString.split(',').map(s => ({ id: parseInt(s) }));
  } catch {
    return skillsString.split(',').map(s => ({ id: parseInt(s) }));
  }
}

export function calcDDFromSkillIds(skillIds: number[], skills: Skill[]): number {
  return skillIds.reduce((acc, sId) => {
    const sk = skills.find(s => s.id === sId);
    return acc + (sk?.difficulty || 0);
  }, 0);
}

export function calculateTotalDD(
  items: SkillItem[],
  allSkills: Skill[] | undefined,
  routines: { id: number; skillIds: number[] }[] | undefined
): number {
  let total = 0;
  let currentGroupDD = 0;
  let currentGroupReps = 1;

  items.forEach((item) => {
    if (item.id === -1) {
      total += currentGroupDD * currentGroupReps;
      currentGroupDD = 0;
      currentGroupReps = 1;
    } else if (item.id === -2) {
      total += currentGroupDD * currentGroupReps;
      currentGroupDD = 0;
      currentGroupReps = 1;
      const routine = routines?.find(r => r.id === item.routineId);
      const skillIds = item.customSkillIds ?? routine?.skillIds ?? [];
      const count = item.attempt ?? skillIds.length;
      total += skillIds.slice(0, count).reduce((acc: number, sId: number) => {
        const skill = allSkills?.find(s => s.id === sId);
        return acc + (skill?.difficulty || 0);
      }, 0);
    } else {
      const skill = allSkills?.find(s => s.id === item.id);
      currentGroupDD += (skill?.difficulty || 0);
      currentGroupReps = item.reps || 1;
    }
  });
  total += currentGroupDD * currentGroupReps;
  return total;
}
