import { describe, expect, it } from "vitest";
import type { ExecutionSession, Routine, Skill, TofSession } from "@shared/schema";
import { alignAttemptProfiles, buildAttemptProfiles } from "@/lib/tracker-comparison";

const routine = { id: 1, name: "Set routine", skillIds: [10, 11] } as Routine;
const skill = { id: 10, name: "Jump", code: "A", parentSkillId: null, shape: null } as Skill;

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
});