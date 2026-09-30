import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { totalDeductionPoints } from "@shared/execution";
import { resolveTarget, targetName } from "@/lib/tracker-target";

export type ComparisonTracker = "tof" | "execution";
export type ComparisonSession = TofSession | ExecutionSession;

export interface AttemptProfile {
  key: string;
  label: string;
  date: string;
  /** Each index is the original jump position, even for missing measurements. */
  values: (number | null)[];
  total: number;
  landingRecorded?: boolean;
}

/** There is no recorded time-of-day on tracker sessions: only a date column. */
export function buildAttemptProfiles(
  tracker: "tof",
  sessions: TofSession[] | undefined,
  routines: Routine[] | undefined,
  allSkills: Skill[] | undefined,
): AttemptProfile[];
export function buildAttemptProfiles(
  tracker: "execution",
  sessions: ExecutionSession[] | undefined,
  routines: Routine[] | undefined,
  allSkills: Skill[] | undefined,
): AttemptProfile[];
export function buildAttemptProfiles(
  tracker: ComparisonTracker,
  sessions: ComparisonSession[] | undefined,
  routines: Routine[] | undefined,
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
      total: tracker === "tof"
        ? measured.reduce((sum, value) => sum + value, 0)
        : totalDeductionPoints(measured, landing),
      ...(tracker === "execution" ? { landingRecorded: landing != null } : {}),
    }];
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