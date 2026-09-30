import { describe, expect, it } from "vitest";
import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { alignAttemptProfiles, buildAttemptProfiles, jumpDifference, jumpSkillLabel, sharedJumpSkills } from "@/lib/tracker-comparison";

const routine = { id: 1, name: "Set routine", skillIds: [10, 11] } as Routine;
const skill = { id: 10, name: "Jump", code: "A", parentSkillId: null, shape: null } as Skill;
const second = { id: 11, name: "Second jump", code: "B", parentSkillId: null, shape: null } as Skill;
const third = { id: 12, name: "Third jump", code: "C", parentSkillId: null, shape: null } as Skill;

describe("attempt profile comparison", () => {
  it("retains individual identity for attempts on the same date and plots ordered positions", () => {
    const sessions = [
      { id: 7, date: "2026-02-01", routineId: 1, skillId: null, skillIds: null, tofValues: [1.1, 1.2] },
      { id: 8, date: "2026-02-01", routineId: 1, skillId: null, skillIds: null, tofValues: [1.3, 1.4] },
    ] as TofSession[];
    const profiles = buildAttemptProfiles("tof", sessions, [routine], [skill]);
    expect(profiles.map(p => p.key)).toEqual(["tof:7", "tof:8"]);
    expect(profiles.map(p => p.total)).toEqual([2.3, 2.7]);
    const aligned = alignAttemptProfiles(profiles);
    expect(aligned).toHaveLength(10);
    expect(aligned[0]).toEqual({ jump: 1, "tof:7": 1.1, "tof:8": 1.3 });
    expect(aligned[1]).toEqual({ jump: 2, "tof:7": 1.2, "tof:8": 1.4 });
    expect(aligned[2]).toEqual({ jump: 3, "tof:7": null, "tof:8": null });
  });

  it("preserves missing positions instead of shifting or padding with zero", () => {
    const profiles = buildAttemptProfiles("tof", [{
      id: 9, date: "2026-02-02", routineId: null, skillId: 10, skillIds: null,
      tofValues: [1.1, null, 1.5],
    } as unknown as TofSession], [], [skill]);
    expect(profiles[0].values).toEqual([1.1, null, 1.5]);
    expect(alignAttemptProfiles(profiles).slice(0, 4).map(row => row["tof:9"]))
      .toEqual([1.1, null, 1.5, null]);
  });

  it("retains zero deductions and includes recorded landing only in the total", () => {
    const profiles = buildAttemptProfiles("execution", [
      { id: 3, date: "2026-02-01", routineId: 1, skillId: null, skillIds: null, deductions: [0, 0.2], landingDeduction: 0.3 },
      { id: 4, date: "2026-02-01", routineId: 1, skillId: null, skillIds: null, deductions: [0.1], landingDeduction: null },
    ] as ExecutionSession[], [routine], [skill]);
    expect(profiles.map(p => p.key)).toEqual(["execution:3", "execution:4"]);
    expect(profiles.map(p => p.total)).toEqual([0.5, 0.1]);
    expect(profiles.map(p => p.landingRecorded)).toEqual([true, false]);
    expect(profiles[0].values).toEqual([0, 0.2]);
    expect(alignAttemptProfiles(profiles)[0]).toEqual({ jump: 1, "execution:3": 0, "execution:4": 0.1 });
    expect(alignAttemptProfiles(profiles)[2]["execution:3"]).toBeNull();
  });

  it("calculates signed per-jump differences in seconds from the first selected ToF attempt, not chronological order", () => {
    const profiles = buildAttemptProfiles("tof", [
      { id: 1, date: "2026-01-01", routineId: 1, tofValues: [1.1, 1.2, null, 0] },
      { id: 2, date: "2026-01-02", routineId: 1, tofValues: [1.5, 1.2, 1.4, 0] },
    ] as TofSession[], [routine], [skill, second]);
    const selected = [profiles[1], profiles[0]];
    expect(selected[0].key).toBe("tof:2");
    expect(jumpDifference(selected, 1, 0)).toBeCloseTo(-0.4);
    expect([1, 2, 3].map(jump => jumpDifference(selected, 1, jump)))
      .toEqual([0, null, 0]);
    expect(jumpDifference(selected, 0, 0)).toBeNull();
    expect(jumpDifference([profiles[0], profiles[1]], 1, 0)).toBeCloseTo(0.4);
  });

  it("calculates execution deduction points without landing and never invents deltas for missing baseline positions", () => {
    const profiles = buildAttemptProfiles("execution", [
      { id: 3, date: "2026-01-01", routineId: 1, deductions: [0, null, 0.3], landingDeduction: 0.5 },
      { id: 4, date: "2026-01-02", routineId: 1, deductions: [0.2, 0.1, 0], landingDeduction: 0 },
    ] as ExecutionSession[], [routine], [skill, second]);
    expect(jumpDifference(profiles, 1, 0)).toBeCloseTo(0.2);
    expect(jumpDifference(profiles, 1, 1)).toBeNull();
    expect(jumpDifference(profiles, 1, 2)).toBeCloseTo(-0.3);
    expect(jumpDifference(profiles, 1, 3)).toBeNull();
    expect(jumpDifference(profiles, 2, 0)).toBeNull();
  });

  it("shows ordered routine skills only when all selected attempts share the identity", () => {
    const sessions = [
      { id: 1, date: "2026-01-01", routineId: 1, skillId: null, tofValues: [1, 2] },
      { id: 2, date: "2026-01-02", routineId: 1, skillId: null, tofValues: [3, 4] },
    ] as TofSession[];
    const profiles = buildAttemptProfiles("tof", sessions, [routine], [skill, second]);
    expect(profiles[0].jumpSkills.map(s => s.id)).toEqual([10, 11]);
    expect(sharedJumpSkills(profiles).slice(0, 3).map(s => s?.code ?? null)).toEqual(["A", "B", null]);
    expect(jumpSkillLabel(profiles[0].jumpSkills[1], true)).toBe("Second jump");
    expect(jumpSkillLabel(profiles[0].jumpSkills[1], false)).toBe("B");
  });

  it("repeats one skill across single-skill attempts and maps sequence library items in order", () => {
    const connection = { ...skill, id: 20, name: "Connection", skillIds: [11, 10] } as Skill;
    const profiles = buildAttemptProfiles("execution", [
      { id: 1, date: "2026-01-01", routineId: null, skillId: 10, deductions: [0, 0.1] },
      { id: 2, date: "2026-01-01", routineId: null, skillId: 20, deductions: [0, 0.2] },
    ] as ExecutionSession[], [], [skill, second, connection]);
    expect(profiles[0].jumpSkills.map(s => s.id)).toEqual([10, 10]);
    expect(profiles[1].jumpSkills.map(s => s.id)).toEqual([11, 10]);
    expect(sharedJumpSkills(profiles).slice(0, 2).map(s => s?.id ?? null)).toEqual([null, 10]);
  });

  it("resolves dated past lineups with an exclusive change day, not the current lineup", () => {
    const versioned = { ...routine, skillIds: [12, 10], versions: [
      { id: 2, effectiveUntil: "2026-02-01", skillIds: [10, 11] },
    ] };
    const profiles = buildAttemptProfiles("tof", [
      { id: 1, date: "2026-01-31", routineId: 1, skillId: null, tofValues: [1, 2] },
      { id: 2, date: "2026-02-01", routineId: 1, skillId: null, tofValues: [1, 2] },
    ] as TofSession[], [versioned], [skill, second, third]);
    expect(profiles.map(p => p.jumpSkills.map(s => s.id))).toEqual([[10, 11], [12, 10]]);
    expect(sharedJumpSkills(profiles).slice(0, 2)).toEqual([null, null]);
  });

  it("does not invent labels for deleted routines, missing skill ids or unknown sequence positions", () => {
    const profiles = buildAttemptProfiles("tof", [
      { id: 1, date: "2026-01-01", routineId: 99, skillId: null, tofValues: [1] },
      { id: 2, date: "2026-01-01", routineId: 1, skillId: null, tofValues: [1, 2, 3] },
    ] as TofSession[], [routine], [skill]);
    expect(profiles[0].label).toBe("Deleted routine");
    expect(profiles[0].jumpSkills[0].id).toBeNull();
    expect(profiles[1].jumpSkills.map(s => jumpSkillLabel(s, false)))
      .toEqual(["A", "Unknown skill", "Unknown skill"]);
    expect(sharedJumpSkills(profiles).every(s => s == null)).toBe(true);
  });

  it("keeps an ad-hoc sequence in stored order and identifies a deleted single skill as unknown", () => {
    const profiles = buildAttemptProfiles("tof", [
      { id: 3, date: "2026-01-01", routineId: null, skillId: null, skillIds: [11, 10], tofValues: [1, 2] },
      { id: 4, date: "2026-01-01", routineId: null, skillId: 99, skillIds: null, tofValues: [1, 2] },
    ] as TofSession[], [], [skill, second]);
    expect(profiles[0].jumpSkills.map(s => s.code)).toEqual(["B", "A"]);
    expect(profiles[1].label).toBe("Deleted skill");
    expect(profiles[1].jumpSkills.map(s => jumpSkillLabel(s, true))).toEqual(["Unknown skill", "Unknown skill"]);
  });
});