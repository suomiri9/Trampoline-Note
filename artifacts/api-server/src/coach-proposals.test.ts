import { describe, expect, it } from "vitest";
import {
  extractPointProposal,
  extractSkillProposal,
} from "./coach-proposals";
import type { Skill, Routine } from "@workspace/db";

// Minimal skill/routine factories (only fields the matchers read).
let nextId = 1;
function mkSkill(over: Partial<Skill>): Skill {
  return {
    id: nextId++,
    userId: "u1",
    name: "Skill",
    code: "SK",
    difficulty: 0,
    isDrill: 0,
    skillIds: null,
    sortOrder: null,
    archived: 0,
    parentSkillId: null,
    shape: null,
    sourceRoutineId: null,
    ...over,
  } as Skill;
}
function mkRoutine(over: Partial<Routine>): Routine {
  return {
    id: nextId++,
    userId: "u1",
    name: "Routine",
    code: null,
    skillIds: [],
    archived: 0,
    createdAt: new Date(),
    ...over,
  } as Routine;
}

const block = (tag: string, json: unknown) =>
  `Sure!\n\n\`\`\`${tag}\n${JSON.stringify(json)}\n\`\`\``;

describe("extractSkillProposal", () => {
  it("returns null and leaves the reply untouched when there is no block", () => {
    const { stripped, proposal } = extractSkillProposal("Just a normal reply.", []);
    expect(proposal).toBeNull();
    expect(stripped).toBe("Just a normal reply.");
  });

  it("parses a valid proposal and strips the block", () => {
    const reply = block("skill_proposal", {
      name: "Crash Dive",
      code: "CD",
      difficulty: 0.3,
      type: "drill",
    });
    const { stripped, proposal } = extractSkillProposal(reply, []);
    expect(stripped).toBe("Sure!");
    expect(proposal).toEqual({
      name: "Crash Dive",
      code: "CD",
      difficulty: 0.3,
      type: "drill",
      alreadyExists: false,
    });
  });

  it("defaults bad difficulty/type and rejects missing name or code", () => {
    const ok = extractSkillProposal(
      block("skill_proposal", { name: "X", code: "X1", difficulty: "nope", type: "weird" }),
      [],
    );
    expect(ok.proposal).toMatchObject({ difficulty: 0, type: "skill" });

    const noName = extractSkillProposal(block("skill_proposal", { code: "X1" }), []);
    expect(noName.proposal).toBeNull();
    expect(noName.stripped).toBe("Sure!");

    const badJson = extractSkillProposal("```skill_proposal\nnot json\n```", []);
    expect(badJson.proposal).toBeNull();
  });

  it("flags duplicates against active codes, names, and shape display codes", () => {
    const base = mkSkill({ name: "Back Somersault", code: "4-" });
    const child = mkSkill({ name: "Back Tuck", code: "4-o", parentSkillId: base.id, shape: "o" });
    const archived = mkSkill({ name: "Old One", code: "OLD", archived: 1 });
    const all = [base, child, archived];

    expect(
      extractSkillProposal(block("skill_proposal", { name: "New", code: "4-o" }), all).proposal
        ?.alreadyExists,
    ).toBe(true);
    expect(
      extractSkillProposal(
        block("skill_proposal", { name: "back somersault", code: "ZZ" }),
        all,
      ).proposal?.alreadyExists,
    ).toBe(true);
    // Archived entries don't block re-adding.
    expect(
      extractSkillProposal(block("skill_proposal", { name: "Old One", code: "OLD" }), all)
        .proposal?.alreadyExists,
    ).toBe(false);
  });
});

describe("extractPointProposal", () => {
  const base = mkSkill({ name: "Back Somersault", code: "4-" });
  const child = mkSkill({ name: "Back Tuck", code: "4-o", parentSkillId: base.id, shape: "o" });
  const drill = mkSkill({ name: "Wall Drill", code: "WD", isDrill: 1 });
  const conn = mkSkill({ name: "Combo A", code: "CA", isDrill: 2, skillIds: [child.id] });
  const archivedSkill = mkSkill({ name: "Gone", code: "GN", archived: 1 });
  const all = [base, child, drill, conn, archivedSkill];
  const routine = mkRoutine({ name: "Set Routine", code: "SET" });
  const archivedRoutine = mkRoutine({ name: "Old Routine", code: "OLD-R", archived: 1 });
  const routines = [routine, archivedRoutine];

  it("resolves links by display code or name and drops unresolvable ones", () => {
    const reply = block("point_proposal", {
      name: "Keep arms up",
      skills: ["4-o", "wall drill", "CA", "Nonexistent", "GN"],
      routines: ["set routine", "Old Routine"],
      category: "Backward",
    });
    const { stripped, proposal } = extractPointProposal(reply, all, routines);
    expect(stripped).toBe("Sure!");
    expect(proposal).not.toBeNull();
    expect(proposal!.name).toBe("Keep arms up");
    expect(proposal!.skills.map((l) => l.id)).toEqual([child.id, drill.id, conn.id]);
    expect(proposal!.routines.map((l) => l.id)).toEqual([routine.id]);
    // Archived + unknown references are dropped, reported, never invented.
    expect(proposal!.unresolved).toEqual(["Nonexistent", "GN", "Old Routine"]);
    expect(proposal!.category).toBe("Backward");
  });

  it("defaults invalid categories to General and requires a name", () => {
    const bad = extractPointProposal(
      block("point_proposal", { name: "P", category: "Sideways" }),
      all,
      routines,
    );
    expect(bad.proposal?.category).toBe("General");

    const noName = extractPointProposal(block("point_proposal", { skills: [] }), all, routines);
    expect(noName.proposal).toBeNull();
  });

  it("dedupes repeated links", () => {
    const { proposal } = extractPointProposal(
      block("point_proposal", { name: "P", skills: ["4-o", "Back Tuck"] }),
      all,
      routines,
    );
    expect(proposal!.skills.map((l) => l.id)).toEqual([child.id]);
  });
});
