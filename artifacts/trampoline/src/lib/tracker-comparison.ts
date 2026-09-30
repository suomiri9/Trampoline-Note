import type { ExecutionSession, RoutineWithVersions, Skill, TofSession } from "@shared/schema";
import { totalDeductionPoints } from "@shared/execution";
import { lineupOnDate } from "@shared/routine-versions";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import { resolveTarget, targetName, targetSkillIdAt } from "@/lib/tracker-target";

export type ComparisonTracker = "tof" | "execution";
export type ComparisonSession = TofSession | ExecutionSession;

export interface JumpSkill {
  id: number | null;
  code: string;
  name: string;
}

export interface AttemptProfile {
  key: string;
  label: string;
  date: string;
  /** Each index is the original jump position, even for missing measurements. */
  values: (number | null)[];
  /** Skill at each measured position; null id means the identity cannot be established. */
  jumpSkills: JumpSkill[];
  total: number;
  landingRecorded?: boolean;
}

/** There is no recorded time-of-day on tracker sessions: only a date column. */
export function buildAttemptProfiles(
  tracker: "tof",
  sessions: TofSession[] | undefined,
  routines: RoutineWithVersions[] | undefined,
  allSkills: Skill[] | undefined,
): AttemptProfile[];
export function buildAttemptProfiles(
  tracker: "execution",
  sessions: ExecutionSession[] | undefined,
  routines: RoutineWithVersions[] | undefined,
  allSkills: Skill[] | undefined,
): AttemptProfile[];
export function buildAttemptProfiles(
  tracker: ComparisonTracker,
  sessions: ComparisonSession[] | undefined,
  routines: RoutineWithVersions[] | undefined,
  allSkills: Skill[] | undefined,
): AttemptProfile[] {
  const routineById = new Map((routines ?? []).map(r => [r.id, r]));
  return (sessions ?? []).flatMap(session => {
    const raw = tracker === "tof"
      ? (session as TofSession).tofValues
      : (session as ExecutionSession).deductions;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const values = raw.map(value =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null,
    );
    if (!values.some(value => value != null)) return [];
    const target = resolveTarget(session, routineById, allSkills);
    // Routine versions are date-exclusive; a session on a change day uses the
    // new lineup. Other sequence targets retain their own stored order.
    const routineIds = target?.kind === "routine"
      ? lineupOnDate(target.routine.skillIds, target.routine.versions, session.date)
      : null;
    const jumpSkills = values.map((_, index) => {
      const id = routineIds ? routineIds[index] : targetSkillIdAt(target, index);
      const skill = id == null ? undefined : allSkills?.find(sk => sk.id === id);
      return {
        id: skill?.id ?? null,
        code: skill ? skillDisplayCode(skill, allSkills) : "",
        name: skill ? skillDisplayName(skill, allSkills) : "",
      };
    });
    const label = targetName(target, allSkills) ?? (
      session.routineId != null ? "Deleted routine" :
      session.skillId != null ? "Deleted skill" : "Recorded attempt"
    );
    const measured = values.filter((value): value is number => value != null);
    const landing = tracker === "execution" ? (session as ExecutionSession).landingDeduction : null;
    return [{
      key: `${tracker}:${session.id}`,
      label,
      date: session.date,
      values,
      jumpSkills,
      total: tracker === "tof"
        ? measured.reduce((sum, value) => sum + value, 0)
        : totalDeductionPoints(measured, landing),
      ...(tracker === "execution" ? { landingRecorded: landing != null } : {}),
    }];
  });
}

export function jumpSkillLabel(skill: JumpSkill | undefined, showNames: boolean): string {
  if (!skill || skill.id == null) return "Unknown skill";
  return (showNames ? skill.name || skill.code : skill.code || skill.name) || "Unknown skill";
}

/** Only identify an axis position as a skill when EVERY attempt agrees. */
export function sharedJumpSkills(profiles: AttemptProfile[]): (JumpSkill | null)[] {
  return Array.from({ length: 10 }, (_, index) => {
    const first = profiles[0]?.jumpSkills[index];
    return first?.id != null && profiles.every(p => p.jumpSkills[index]?.id === first.id)
      ? first : null;
  });
}

export interface JumpComparisonRow {
  jump: number;
  [attemptKey: string]: number | null;
}

/** Fixed positional axis; null never becomes zero and never shifts a later jump. */
export function alignAttemptProfiles(profiles: AttemptProfile[]): JumpComparisonRow[] {
  return Array.from({ length: 10 }, (_, index) => {
    const row: JumpComparisonRow = { jump: index + 1 };
    for (const profile of profiles) row[profile.key] = profile.values[index] ?? null;
    return row;
  });
}