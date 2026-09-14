import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { impliedEScore, totalDeductionPoints } from "@shared/execution";
import { skillDisplayCode, skillDisplayName } from "@/lib/training-utils";
import {
  resolveTarget,
  targetSkillIdAt,
  type TrackerTarget,
} from "@/lib/tracker-target";

export type ComparisonTracker = "tof" | "execution";
export type ComparisonTargetKind = "routine" | "skill";
export type ComparisonMetric = "total" | "skill" | "eScore";

export interface ComparisonMetricDefinition {
  id: ComparisonMetric;
  label: string;
  description: string;
  unit: "seconds" | "points";
  targetKind: ComparisonTargetKind;
  higherIsBetter: boolean;
}

export const COMPARISON_METRICS: Record<
  ComparisonTracker,
  ComparisonMetricDefinition[]
> = {
  tof: [
    {
      id: "total",
      label: "Routine total ToF",
      description: "One total per routine session",
      unit: "seconds",
      targetKind: "routine",
      higherIsBetter: true,
    },
    {
      id: "skill",
      label: "Skill ToF",
      description: "Recorded jumps for one skill",
      unit: "seconds",
      targetKind: "skill",
      higherIsBetter: true,
    },
  ],
  execution: [
    {
      id: "total",
      label: "Total deductions",
      description: "Routine deductions, including landing when recorded",
      unit: "points",
      targetKind: "routine",
      higherIsBetter: false,
    },
    {
      id: "eScore",
      label: "E score",
      description: "Complete routine attempts with a landing",
      unit: "points",
      targetKind: "routine",
      higherIsBetter: true,
    },
    {
      id: "skill",
      label: "Skill deduction",
      description: "Recorded deductions for one skill",
      unit: "points",
      targetKind: "skill",
      higherIsBetter: false,
    },
  ],
};

export interface ComparisonTargetOption {
  key: string;
  id: number;
  kind: ComparisonTargetKind;
  label: string;
  description: string;
  recordCount: number;
}

export interface ComparisonSample {
  date: string;
  value: number;
  /** Number of records collapsed into this date. */
  count?: number;
}

export interface ComparisonSeries {
  key: string;
  label: string;
  kind: ComparisonTargetKind;
  unit: "seconds" | "points";
  points: ComparisonSample[];
}

export interface AlignedComparisonPoint {
  date: string;
  [seriesKey: string]: string | number | null;
}

export function comparisonMetric(
  tracker: ComparisonTracker,
  metric: ComparisonMetric,
): ComparisonMetricDefinition {
  const definition = COMPARISON_METRICS[tracker].find(item => item.id === metric);
  return definition ?? COMPARISON_METRICS[tracker][0];
}

export function filterComparisonTargets(
  options: ComparisonTargetOption[],
  metric: ComparisonMetricDefinition,
): ComparisonTargetOption[] {
  return options.filter(option => option.kind === metric.targetKind);
}

export function comparisonTargetKey(kind: ComparisonTargetKind, id: number): string {
  return `${kind}:${id}`;
}

export function parseComparisonTargetKey(
  key: string,
): { kind: ComparisonTargetKind; id: number } | null {
  const [kind, rawId] = key.split(":");
  const id = Number(rawId);
  if ((kind !== "routine" && kind !== "skill") || !Number.isInteger(id) || id <= 0) {
    return null;
  }
  return { kind, id };
}

type ComparisonSession = TofSession | ExecutionSession;

function sessionValues(session: ComparisonSession): number[] {
  return "tofValues" in session ? session.tofValues ?? [] : session.deductions ?? [];
}

function sessionTarget(
  session: ComparisonSession,
  routineById: Map<number, Routine>,
  allSkills: Skill[] | undefined,
): TrackerTarget | undefined {
  return resolveTarget(session, routineById, allSkills);
}

function skillRecordCount(
  sessions: ComparisonSession[],
  skillId: number,
  routineById: Map<number, Routine>,
  allSkills: Skill[] | undefined,
): number {
  let count = 0;
  for (const session of sessions) {
    const target = sessionTarget(session, routineById, allSkills);
    if (!target) continue;
    const values = sessionValues(session);
    for (let index = 0; index < values.length; index += 1) {
      if (targetSkillIdAt(target, index) === skillId) count += 1;
    }
  }
  return count;
}

function routineRecordCount(sessions: ComparisonSession[], routineId: number): number {
  return sessions.filter(session => session.routineId === routineId && sessionValues(session).length > 0).length;
}

/**
 * Build the picker options from the actual user's library. Options without
 * matching records stay visible but are disabled by the UI, which makes it
 * clear why a new skill/routine cannot produce a graph yet.
 */
export function buildComparisonTargetOptions({
  tracker: _tracker,
  routines,
  allSkills,
  sessions,
}: {
  tracker: ComparisonTracker;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
  sessions: ComparisonSession[] | undefined;
}): ComparisonTargetOption[] {
  const rows = sessions ?? [];
  const routineOptions = (routines ?? [])
    .map(routine => ({
      key: comparisonTargetKey("routine", routine.id),
      id: routine.id,
      kind: "routine" as const,
      label: routine.name,
      description: routine.archived === 1 ? "Routine · archived" : "Routine",
      recordCount: routineRecordCount(rows, routine.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const skillOptions = (allSkills ?? [])
    .map(skill => ({
      key: comparisonTargetKey("skill", skill.id),
      id: skill.id,
      kind: "skill" as const,
      label: skillDisplayCode(skill, allSkills),
      description: `${skillDisplayName(skill, allSkills)}${skill.archived === 1 ? " · archived" : ""}`,
      recordCount: skillRecordCount(rows, skill.id, new Map((routines ?? []).map(r => [r.id, r])), allSkills),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...routineOptions, ...skillOptions];
}

/**
 * Collapse several recordings on the same date into a daily mean. Detail
 * charts still show every historical record; a comparison needs one x-axis
 * position per date, so averaging avoids misleading duplicate points while
 * preserving the record count for the tooltip.
 */
export function collapseDuplicateDates(points: ComparisonSample[]): ComparisonSample[] {
  const grouped = new Map<string, { sum: number; count: number }>();
  for (const point of points) {
    if (!point.date || !Number.isFinite(point.value)) continue;
    const count = point.count && point.count > 0 ? point.count : 1;
    const current = grouped.get(point.date) ?? { sum: 0, count: 0 };
    current.sum += point.value * count;
    current.count += count;
    grouped.set(point.date, current);
  }
  return [...grouped.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, aggregate]) => ({
      date,
      value: aggregate.sum / aggregate.count,
      count: aggregate.count,
    }));
}

/**
 * Align series on a shared, sorted date axis. A missing recording is null,
 * never zero: zero is meaningful for an execution deduction and must not be
 * invented for a date on which a series was not recorded.
 */
export function alignComparisonSeries(series: ComparisonSeries[]): AlignedComparisonPoint[] {
  const dates = new Set<string>();
  const byDate = series.map(item => {
    const points = collapseDuplicateDates(item.points);
    points.forEach(point => dates.add(point.date));
    return { item, points: new Map(points.map(point => [point.date, point])) };
  });

  return [...dates]
    .sort((dateA, dateB) => dateA.localeCompare(dateB))
    .map(date => {
      const row: AlignedComparisonPoint = { date };
      for (const { item, points } of byDate) {
        row[item.key] = points.get(date)?.value ?? null;
      }
      return row;
    });
}

function routineSeriesLabel(
  routineId: number,
  routines: Routine[] | undefined,
): string {
  return routines?.find(routine => routine.id === routineId)?.name ?? "Deleted routine";
}

function skillSeriesLabel(skillId: number, allSkills: Skill[] | undefined): string {
  const skill = allSkills?.find(item => item.id === skillId);
  return skill ? skillDisplayCode(skill, allSkills) : "Deleted skill";
}

export function buildTofComparisonSeries({
  selectedKeys,
  sessions,
  routines,
  allSkills,
  metric,
}: {
  selectedKeys: string[];
  sessions: TofSession[] | undefined;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
  metric: Extract<ComparisonMetric, "total" | "skill">;
}): ComparisonSeries[] {
  const rows = sessions ?? [];
  const routineById = new Map((routines ?? []).map(routine => [routine.id, routine]));
  const definition = comparisonMetric("tof", metric);

  return selectedKeys.flatMap<ComparisonSeries>(key => {
    const target = parseComparisonTargetKey(key);
    if (!target || target.kind !== definition.targetKind) return [];
    const points: ComparisonSample[] = [];
    if (target.kind === "routine") {
      for (const session of rows) {
        if (session.routineId !== target.id || (session.tofValues ?? []).length === 0) continue;
        points.push({
          date: session.date,
          value: (session.tofValues ?? []).reduce((sum, value) => sum + value, 0),
        });
      }
      return [{
        key,
        label: routineSeriesLabel(target.id, routines),
        kind: target.kind,
        unit: definition.unit,
        points: collapseDuplicateDates(points),
      }];
    }

    for (const session of rows) {
      const resolved = sessionTarget(session, routineById, allSkills);
      if (!resolved) continue;
      for (let index = 0; index < (session.tofValues ?? []).length; index += 1) {
        if (targetSkillIdAt(resolved, index) !== target.id) continue;
        points.push({ date: session.date, value: session.tofValues[index] });
      }
    }
    return [{
      key,
      label: skillSeriesLabel(target.id, allSkills),
      kind: target.kind,
      unit: definition.unit,
      points: collapseDuplicateDates(points),
    }];
  });
}

export function buildExecutionComparisonSeries({
  selectedKeys,
  sessions,
  routines,
  allSkills,
  metric,
}: {
  selectedKeys: string[];
  sessions: ExecutionSession[] | undefined;
  routines: Routine[] | undefined;
  allSkills: Skill[] | undefined;
  metric: ComparisonMetric;
}): ComparisonSeries[] {
  const rows = sessions ?? [];
  const routineById = new Map((routines ?? []).map(routine => [routine.id, routine]));
  const definition = comparisonMetric("execution", metric);

  return selectedKeys.flatMap<ComparisonSeries>(key => {
    const target = parseComparisonTargetKey(key);
    if (!target || target.kind !== definition.targetKind) return [];
    const points: ComparisonSample[] = [];
    if (target.kind === "routine") {
      for (const session of rows) {
        if (session.routineId !== target.id) continue;
        const value = metric === "eScore"
          ? impliedEScore(session.deductions ?? [], session.landingDeduction)
          : totalDeductionPoints(session.deductions ?? [], session.landingDeduction);
        // Incomplete E-score attempts are intentionally gaps, not zeroes.
        if (value == null) continue;
        points.push({ date: session.date, value });
      }
      return [{
        key,
        label: routineSeriesLabel(target.id, routines),
        kind: target.kind,
        unit: definition.unit,
        points: collapseDuplicateDates(points),
      }];
    }

    for (const session of rows) {
      const resolved = sessionTarget(session, routineById, allSkills);
      if (!resolved) continue;
      for (let index = 0; index < (session.deductions ?? []).length; index += 1) {
        if (targetSkillIdAt(resolved, index) !== target.id) continue;
        points.push({ date: session.date, value: session.deductions[index] });
      }
    }
    return [{
      key,
      label: skillSeriesLabel(target.id, allSkills),
      kind: target.kind,
      unit: definition.unit,
      points: collapseDuplicateDates(points),
    }];
  });
}
