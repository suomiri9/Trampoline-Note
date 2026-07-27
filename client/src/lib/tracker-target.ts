import type { Routine, Skill } from "@shared/schema";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";

// A ToF/Execution session's target: a whole routine, a library item (skill,
// drill, connection, routine part), or an ad-hoc "connect skills" sequence
// stored inline on the session row (no library item created). Exactly one of
// routineId/skillId/skillIds is set on the session — these helpers keep the
// two trackers' pages in agreement about how positions map to skills.
export type TrackerTarget =
  | { kind: "routine"; routine: Routine }
  | { kind: "skill"; skill: Skill }
  | { kind: "adhoc"; skillIds: number[] };

export function resolveTarget(
  s: { routineId: number | null; skillId: number | null; skillIds?: number[] | null },
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
  if (s.skillIds && s.skillIds.length > 0) return { kind: "adhoc", skillIds: s.skillIds };
  return undefined;
}

// Which skill was performed at position `index`? Sequence targets (routine,
// connection, routine part, ad-hoc connection) map positions through their
// skill list; a single skill/drill target means every value is another
// attempt of that same skill (e.g. a swing series).
export function targetSkillIdAt(target: TrackerTarget | undefined, index: number): number | undefined {
  if (!target) return undefined;
  if (target.kind === "routine") return target.routine.skillIds[index] ?? undefined;
  if (target.kind === "adhoc") return target.skillIds[index] ?? undefined;
  const seq = target.skill.skillIds;
  if (seq && seq.length > 0) return seq[index] ?? undefined;
  return target.skill.id;
}

// Sequence length of the target, or null for a single skill/drill
// (attempt mode: any number of values, all the same skill).
export function targetSeqLength(target: TrackerTarget | undefined): number | null {
  if (!target) return null;
  if (target.kind === "routine") return target.routine.skillIds.length;
  if (target.kind === "adhoc") return target.skillIds.length;
  const seq = target.skill.skillIds;
  return seq && seq.length > 0 ? seq.length : null;
}

export function targetName(
  target: TrackerTarget | undefined,
  allSkills: Skill[] | undefined | null,
): string | undefined {
  if (!target) return undefined;
  if (target.kind === "routine") return target.routine.name;
  if (target.kind === "adhoc") {
    return target.skillIds
      .map(id => {
        const sk = allSkills?.find(s => s.id === id);
        return sk ? skillDisplayCode(sk, allSkills ?? undefined) : "?";
      })
      .join(" + ");
  }
  return skillDisplayName(target.skill, allSkills ?? undefined);
}

export function skillKindLabel(s: Pick<Skill, "isDrill">): string {
  switch (s.isDrill) {
    case 1: return "Drill";
    case 2: return "Connection";
    case 3: return "Routine Part";
    default: return "Skill";
  }
}

// Select-value encoding for the shared target picker ("r:12" / "s:34"; the
// picker's ad-hoc option uses the special value "adhoc", handled page-side).
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
