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

export function shapeParentOf(
  skill: Pick<Skill, "parentSkillId"> | undefined | null,
  allSkills: Skill[] | undefined | null,
): Skill | undefined {
  if (!skill || skill.parentSkillId == null || !allSkills) return undefined;
  return allSkills.find(s => s.id === skill.parentSkillId);
}

export function skillDisplayCode(
  skill: Pick<Skill, "code" | "parentSkillId"> | undefined | null,
  allSkills: Skill[] | undefined | null,
): string {
  if (!skill) return "";
  const parent = shapeParentOf(skill, allSkills);
  return parent ? `${parent.code}${skill.code}` : skill.code;
}

export function skillDisplayName(
  skill: Pick<Skill, "name" | "parentSkillId"> | undefined | null,
  _allSkills?: Skill[] | undefined | null,
): string {
  // Shape NAME is independent: a shape shows its OWN name (e.g. "Tuck"), NOT
  // parentName+shapeName. (The CODE is still combined via skillDisplayCode.)
  if (!skill) return "";
  return skill.name;
}

// A skill is "shapeable" when it is itself a shape variant (has a parent base).
export function isShapeableSkill(
  skill: Pick<Skill, "parentSkillId"> | undefined | null,
): boolean {
  return !!skill && skill.parentSkillId != null;
}

// True when `skillId` owns >=1 non-archived shape child. Such a base is a PURE
// grouping (no DD, not directly loggable), so it must NOT appear in any skill
// picker — only its shape children + non-shape skills are pickable.
export function skillHasShapeChildren(
  skillId: number,
  allSkills: Pick<Skill, "parentSkillId" | "archived">[] | undefined | null,
): boolean {
  return !!allSkills && allSkills.some(s => s.parentSkillId === skillId && s.archived !== 1);
}

// Flat list of pickable/loggable skills of a given kind for use in EVERY skill
// picker: shape children (shown with combined codes via skillDisplayCode) +
// non-shape skills, EXCLUDING parent grouping bases. Not sorted.
export function pickableSkills(
  allSkills: Skill[] | undefined | null,
  isDrill: number,
): Skill[] {
  return (allSkills || []).filter(
    s => s.isDrill === isDrill && s.archived !== 1 && !skillHasShapeChildren(s.id, allSkills),
  );
}

// Resolve a single skill id to its sibling variant carrying `targetShape`.
// - Non-shapeable skills (no parent) are returned unchanged.
// - A shapeable skill with no sibling for that shape returns null (missing).
export function swapSkillIdToShape(
  id: number,
  targetShape: string,
  allSkills: Skill[] | undefined | null,
): number | null {
  const skill = allSkills?.find(s => s.id === id);
  if (!skill || skill.parentSkillId == null) return id;
  const sibling = (allSkills || []).find(
    s =>
      s.parentSkillId === skill.parentSkillId &&
      s.archived !== 1 &&
      (s.shape ?? s.code) === targetShape,
  );
  return sibling ? sibling.id : null;
}

// Swap a list of skill ids to `targetShape`, leaving non-shapeable skills and
// any shapeable skill missing that shape unchanged.
export function swapSkillIdsToShape(
  ids: number[],
  targetShape: string,
  allSkills: Skill[] | undefined | null,
): number[] {
  return ids.map(id => {
    const swapped = swapSkillIdToShape(id, targetShape, allSkills);
    return swapped == null ? id : swapped;
  });
}

export interface ShapeAvailability {
  shape: string; // shape value, e.g. "o" / "<" / "/"
  word: string; // human label, e.g. Tuck / Pike / Straight
  available: boolean; // every shapeable skill in the set has this shape
  missing: number[]; // shapeable skill ids lacking this shape
}

// For a set of skill ids, report whether any are shapeable and, per shape,
// which shapeable skills are missing it (to drive disabling + warnings).
export function shapeSwapInfo(
  ids: number[],
  allSkills: Skill[] | undefined | null,
  shapeOptions: { value: string; word: string }[],
): { hasShapeable: boolean; options: ShapeAvailability[] } {
  const shapeableIds = ids.filter(id => isShapeableSkill(allSkills?.find(s => s.id === id)));
  const options = shapeOptions.map(opt => {
    const missing = shapeableIds.filter(id => swapSkillIdToShape(id, opt.value, allSkills) == null);
    return {
      shape: opt.value,
      word: opt.word,
      available: shapeableIds.length > 0 && missing.length === 0,
      missing,
    };
  });
  return { hasShapeable: shapeableIds.length > 0, options };
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
