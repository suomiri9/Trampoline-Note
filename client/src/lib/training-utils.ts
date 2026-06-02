import type { Skill } from "@shared/schema";

export interface SkillItem {
  id: number;
  reps?: number;
  note?: string;
  routineId?: number;
  routineName?: string;
  customSkillIds?: number[];
  attempt?: number;
  fcId?: number;
  fcName?: string;
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

export function suggestRoutinePartName(routineName: string, start: number, end: number, total: number): string {
  if (start <= 1 && end >= total) return routineName;
  const len = end - start + 1;
  if (start <= 1) return `First ${len} of ${routineName}`;
  if (end >= total) return `Last ${len} of ${routineName}`;
  return `Middle ${len} of ${routineName}`;
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
      const routine = routines?.find(r => r.id === item.routineId);
      const skillIds = item.customSkillIds ?? routine?.skillIds ?? [];
      const count = item.attempt ?? skillIds.length;
      const routineDD = skillIds.slice(0, count).reduce((acc: number, sId: number) => {
        const skill = allSkills?.find(s => s.id === sId);
        return acc + (skill?.difficulty || 0);
      }, 0);
      currentGroupDD += routineDD;
      currentGroupReps = item.reps || 1;
    } else if (item.id === -3) {
      const fc = allSkills?.find(s => s.id === item.fcId);
      const skillIds = item.customSkillIds ?? fc?.skillIds ?? [];
      const fcDD = skillIds.reduce((acc: number, sId: number) => {
        const skill = allSkills?.find(s => s.id === sId);
        return acc + (skill?.difficulty || 0);
      }, 0);
      currentGroupDD += fcDD;
      currentGroupReps = item.reps || 1;
    } else {
      const skill = allSkills?.find(s => s.id === item.id);
      currentGroupDD += (skill?.difficulty || 0);
      currentGroupReps = item.reps || 1;
    }
  });
  total += currentGroupDD * currentGroupReps;
  return total;
}
