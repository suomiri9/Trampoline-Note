import type { Routine, Skill } from "@shared/schema";
import { skillDisplayName } from "@/lib/training-utils";

// A ToF/Execution session's target: a whole routine OR a library item
// (skill, drill, connection, routine part). Exactly one of routineId/skillId
// is set on the session row — these helpers keep the two trackers' pages in
// agreement about how positions map to skills.
export type TrackerTarget =
  | { kind: "routine"; routine: Routine }
  | { kind: "skill"; skill: Skill };

export function resolveTarget(
  s: { routineId: number | null; skillId: number | null },
  routineById: Map<number, Routine>,
  allSkills: Skill[] | undefined | null,
): TrackerTarget | undefined {
  if (s.routineId != null) {
    const routine = routineById.get(s.routineId);
    return routine ? { kind: "routine", routine } : undefined;
  }
  if (s.skillId != null) {
    const skill = allSkills?.find(sk => sk.id === s.skillId);
    return skill ? { kind: "skill", skill } : undefined;
  }
  return undefined;
}

// Which skill was performed at position `index`? Sequence targets (routine,
// connection, routine part — anything with a skillIds list) map positions
// through the list; a single skill/drill target means every value is another
// attempt of that same skill (e.g. a swing series).
export function targetSkillIdAt(target: TrackerTarget | undefined, index: number): number | undefined {
  if (!target) return undefined;
  if (target.kind === "routine") return target.routine.skillIds[index] ?? undefined;
  const seq = target.skill.skillIds;
  if (seq && seq.length > 0) return seq[index] ?? undefined;
  return target.skill.id;
}

// Sequence length of the target, or null for a single skill/drill
// (attempt mode: any number of values, all the same skill).
export function targetSeqLength(target: TrackerTarget | undefined): number | null {
  if (!target) return null;
  if (target.kind === "routine") return target.routine.skillIds.length;
  const seq = target.skill.skillIds;
  return seq && seq.length > 0 ? seq.length : null;
}

export function targetName(
  target: TrackerTarget | undefined,
  allSkills: Skill[] | undefined | null,
): string | undefined {
  if (!target) return undefined;
  return target.kind === "routine" ? target.routine.name : skillDisplayName(target.skill, allSkills ?? undefined);
}

export function skillKindLabel(s: Pick<Skill, "isDrill">): string {
  switch (s.isDrill) {
    case 1: return "Drill";
    case 2: return "Connection";
    case 3: return "Routine Part";
    default: return "Skill";
  }
}

// Select-value encoding for the shared target picker ("r:12" / "s:34").
export function encodeTarget(kind: "routine" | "skill", id: number): string {
  return `${kind === "routine" ? "r" : "s"}:${id}`;
}

export function decodeTarget(value: string): { routineId: number | null; skillId: number | null } {
  const [k, idStr] = value.split(":");
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) return { routineId: null, skillId: null };
  if (k === "r") return { routineId: id, skillId: null };
  if (k === "s") return { routineId: null, skillId: id };
  return { routineId: null, skillId: null };
}
