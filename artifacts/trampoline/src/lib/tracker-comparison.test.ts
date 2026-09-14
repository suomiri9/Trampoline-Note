import { describe, expect, it } from "vitest";
import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import {
  alignComparisonSeries,
  buildExecutionComparisonSeries,
  buildTofComparisonSeries,
  collapseDuplicateDates,
  comparisonMetric,
  filterComparisonTargets,
  type ComparisonSeries,
} from "@/lib/tracker-comparison";

const routine = {
  id: 1,
  name: "Set routine",
  skillIds: [10, 11],
  archived: 0,
} as unknown as Routine;
const skillA = {
  id: 10,
  code: "A",
  name: "Skill A",
  archived: 0,
  parentSkillId: null,
  shape: null,
} as unknown as Skill;
const skillB = {
  id: 11,
  code: "B",
  name: "Skill B",
  archived: 0,
  parentSkillId: null,
  shape: null,
} as unknown as Skill;

describe("tracker comparison transformations", () => {
  it("orders dates and averages duplicate recordings without inventing gaps", () => {
    expect(collapseDuplicateDates([
      { date: "2026-02-03", value: 3 },
      { date: "2026-02-01", value: 1 },
      { date: "2026-02-01", value: 2 },
    ])).toEqual([
      { date: "2026-02-01", value: 1.5, count: 2 },
      { date: "2026-02-03", value: 3, count: 1 },
    ]);
  });

  it("aligns series by date and keeps missing values null", () => {
    const series: ComparisonSeries[] = [
      {
        key: "routine:1",
        label: "Set routine",
        kind: "routine",
        unit: "seconds",
        points: [
          { date: "2026-02-03", value: 3 },
          { date: "2026-02-01", value: 1 },
        ],
      },
      {
        key: "routine:2",
        label: "Vol routine",
        kind: "routine",
        unit: "seconds",
        points: [{ date: "2026-02-02", value: 2 }],
      },
    ];

    expect(alignComparisonSeries(series)).toEqual([
      { date: "2026-02-01", "routine:1": 1, "routine:2": null },
      { date: "2026-02-02", "routine:1": null, "routine:2": 2 },
      { date: "2026-02-03", "routine:1": 3, "routine:2": null },
    ]);
  });

  it("filters routine and skill selections when the metric scope changes", () => {
    const targets = [
      { key: "routine:1", id: 1, kind: "routine" as const, label: "Set", description: "Routine", recordCount: 1 },
      { key: "skill:10", id: 10, kind: "skill" as const, label: "A", description: "Skill A", recordCount: 2 },
    ];
    expect(filterComparisonTargets(targets, comparisonMetric("tof", "total")).map(item => item.key))
      .toEqual(["routine:1"]);
    expect(filterComparisonTargets(targets, comparisonMetric("tof", "skill")).map(item => item.key))
      .toEqual(["skill:10"]);
  });

  it("builds skill ToF history from routine positions and excludes incompatible routine totals", () => {
    const sessions = [
      {
        id: 1,
        date: "2026-02-02",
        routineId: 1,
        skillId: null,
        skillIds: null,
        tofValues: [1.1, 1.2],
      },
    ] as unknown as TofSession[];
    const series = buildTofComparisonSeries({
      selectedKeys: ["skill:10", "routine:1"],
      sessions,
      routines: [routine],
      allSkills: [skillA, skillB],
      metric: "skill",
    });
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("skill:10");
    expect(series[0].points[0]).toMatchObject({ date: "2026-02-02", value: 1.1, count: 1 });
  });

  it("keeps incomplete E-score dates as gaps while retaining zero deductions", () => {
    const sessions = [
      {
        id: 1,
        date: "2026-02-01",
        routineId: 1,
        skillId: null,
        skillIds: null,
        deductions: Array.from({ length: 10 }, () => 0),
        landingDeduction: 0,
      },
      {
        id: 2,
        date: "2026-02-02",
        routineId: 1,
        skillId: null,
        skillIds: null,
        deductions: [0],
        landingDeduction: null,
      },
    ] as unknown as ExecutionSession[];
    const eSeries = buildExecutionComparisonSeries({
      selectedKeys: ["routine:1"],
      sessions,
      routines: [routine],
      allSkills: [skillA, skillB],
      metric: "eScore",
    });
    expect(eSeries[0].points).toEqual([
      { date: "2026-02-01", value: 20, count: 1 },
    ]);

    const skillSeries = buildExecutionComparisonSeries({
      selectedKeys: ["skill:10"],
      sessions,
      routines: [routine],
      allSkills: [skillA, skillB],
      metric: "skill",
    });
    expect(skillSeries[0].points).toEqual([
      { date: "2026-02-01", value: 0, count: 1 },
      { date: "2026-02-02", value: 0, count: 1 },
    ]);
  });
});
