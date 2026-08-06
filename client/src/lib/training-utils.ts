import type { Skill } from "@shared/schema";

// DD math + note parsing live in shared/dd.ts (single source of truth shared
// with the server-side coach context); re-exported here so existing client
// imports keep working.
export {
  parseNoteSkills,
  calcDDFromSkillIds,
  calculateTotalDD,
  type SkillItem,
} from "@shared/dd";
import type { SkillItem } from "@shared/dd";

// Split a practice list into rows (groups) with their original indices.
export function buildRowsWithIndices(items: SkillItem[]): { items: SkillItem[]; indices: number[] }[] {
  const rows: { items: SkillItem[]; indices: number[] }[] = [];
  let cur: SkillItem[] = [];
  let curIdx: number[] = [];
  items.forEach((item, idx) => {
    if (item.id === -1) {
      if (cur.length > 0) rows.push({ items: cur, indices: curIdx });
      cur = []; curIdx = [];
    } else {
      cur.push(item); curIdx.push(idx);
    }
  });
  if (cur.length > 0) rows.push({ items: cur, indices: curIdx });
  return rows;
}

// Single source of truth for turn numbering: returns the 1-based turn number
// of each row and the total turn count. Consecutive rows sharing the same
// non-null `turn` marker (on the row's first item) form one turn; unmarked
// rows are each their own turn.
export function computeTurns(items: SkillItem[]): { rowTurns: number[]; totalTurns: number } {
  const rows = buildRowsWithIndices(items);
  const rowTurns: number[] = [];
  let turnNo = 0;
  let prevMarker: number | null = null;
  rows.forEach((row) => {
    const marker = typeof row.items[0]?.turn === "number" ? row.items[0].turn! : null;
    if (marker !== null && prevMarker !== null && marker === prevMarker) {
      rowTurns.push(turnNo);
    } else {
      turnNo += 1;
      rowTurns.push(turnNo);
    }
    prevMarker = marker;
  });
  return { rowTurns, totalTurns: turnNo };
}

export function noteTurnCount(items: SkillItem[]): number {
  return computeTurns(items).totalTurns;
}

export function shapeParentOf(
  skill: Pick<Skill, "parentSkillId"> | undefined | null,
  allSkills: Skill[] | undefined | null,
): Skill | undefined {
  if (!skill || skill.parentSkillId == null || !allSkills) return undefined;
  return allSkills.find(s => s.id === skill.parentSkillId);
}

export function skillDisplayCode(
  skill: Pick<Skill, "code" | "parentSkillId" | "shape"> | undefined | null,
  allSkills: Skill[] | undefined | null,
): string {
  if (!skill) return "";
  const parent = shapeParentOf(skill, allSkills);
  // A shape's combined code is baseCode + the SHAPE code. Prefer the explicit
  // `shape` field (set by both the inline Shapes editor and "Assign as shape")
  // and fall back to the row's own `code` for legacy/inline shapes where they
  // coincide. Using `shape` keeps the original code intact (so Detach restores
  // it) instead of concatenating the base code with the child's leftover code.
  return parent ? `${parent.code}${skill.shape || skill.code}` : skill.code;
}

// When a shape variant is DETACHED from its base, give it a sensible standalone
// code: keep its own raw `code` when present, otherwise fall back to the combined
// display code so an empty-coded shape (raw `code` blank, only `shape` set) does
// not become a blank-coded standalone skill.
export function detachedCode(
  skill: Pick<Skill, "code" | "parentSkillId" | "shape"> | undefined | null,
  allSkills: Skill[] | undefined | null,
): string {
  if (!skill) return "";
  return skill.code || skillDisplayCode(skill, allSkills);
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

// True when a shape child carries its OWN independent identity (it was an
// existing skill relinked under a base via "Assign as shape" / the in-form
// picker) rather than being a generated variant. A generated variant stores its
// shape symbol AS its code (`code === shape`) or has no code; an assigned skill
// keeps its original, distinct `code`. This is intentionally CONSERVATIVE — any
// shape child with a non-empty code that differs from its shape symbol counts,
// so even a legacy row assigned before shapes were required is protected. Used to
// (a) preserve the original code when re-saving a base and (b) DETACH rather than
// delete such a child when it is removed from the Shapes editor — its
// notes/history must survive.
export function isAssignedShapeChild(
  skill: Pick<Skill, "parentSkillId" | "code" | "shape"> | undefined | null,
): boolean {
  if (!skill || skill.parentSkillId == null) return false;
  const code = (skill.code ?? "").trim();
  if (!code) return false;
  return code !== (skill.shape ?? "");
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
