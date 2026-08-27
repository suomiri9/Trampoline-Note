// Single shared DD (degree of difficulty) calculator used by BOTH the client
// stats/screens and the server-side coach context. Any change to DD rules
// (new item types, rep semantics, …) happens here once — the coach can no
// longer drift out of sync with what the athlete sees in the app.

import type { Skill } from "./schema";
import { lineupOnDate, type RoutineVersionLite } from "./routine-versions";

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
  // Optional turn marker: rows (groups split by {id:-1}) whose FIRST item
  // carries the same non-null `turn` value AND are consecutive belong to the
  // same trampoline turn. Rows without a marker each count as their own turn
  // (legacy fallback). Reps/skill counts never multiply turns.
  turn?: number;
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
  routines: { id: number; skillIds: number[]; versions?: RoutineVersionLite[] }[] | undefined,
  // Athlete-local yyyy-mm-dd of the entry being valued: routine refs resolve
  // to the lineup in effect on that day (omitted = current lineup).
  date?: string | null,
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
      const skillIds = item.customSkillIds ??
        (routine ? lineupOnDate(routine.skillIds, routine.versions, date) : []);
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
