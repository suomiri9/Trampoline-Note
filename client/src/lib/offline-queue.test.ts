import { describe, it, expect } from "vitest";
import { remapBody } from "./offline-queue";

// Turn markers (`turn`) group skills into turns inside a note's `skills` JSON.
// These tests guard remapBody('note', ...) against ever stripping `turn` (or any
// other field) during offline-sync id remapping.

const idMap = new Map<number, number>([
  [-101, 501], // temp skill id -> real id
  [-102, 502],
  [-201, 601], // temp routine id -> real id
  [-301, 701], // temp connection (fc) id -> real id
]);

function noteBody(skills: unknown[]) {
  return {
    date: "2026-07-26",
    place: "Gym",
    skills: JSON.stringify(skills),
    comment: "test note",
  };
}

describe("remapBody('note', ...) preserves turn markers through id remapping", () => {
  it("keeps turn and all other fields on plain skills while remapping temp ids", () => {
    const items = [
      { id: -101, count: 3, turn: 1, note: "keep me" },
      { id: 42, count: 1, turn: 1 },
      { id: -102, count: 2, turn: 2 },
    ];
    const out = remapBody("note", noteBody(items), idMap);
    const parsed = JSON.parse(out.skills);
    expect(parsed).toEqual([
      { id: 501, count: 3, turn: 1, note: "keep me" },
      { id: 42, count: 1, turn: 1 },
      { id: 502, count: 2, turn: 2 },
    ]);
    // other body fields untouched
    expect(out.date).toBe("2026-07-26");
    expect(out.place).toBe("Gym");
    expect(out.comment).toBe("test note");
  });

  it("keeps turn on routine refs (id -2) while remapping routineId and customSkillIds", () => {
    const items = [
      {
        id: -2,
        routineId: -201,
        customSkillIds: [-101, 42, -102],
        count: 1,
        turn: 3,
      },
      { id: -2, routineId: 9, count: 2, turn: 3 },
    ];
    const parsed = JSON.parse(remapBody("note", noteBody(items), idMap).skills);
    expect(parsed).toEqual([
      { id: -2, routineId: 601, customSkillIds: [501, 42, 502], count: 1, turn: 3 },
      { id: -2, routineId: 9, count: 2, turn: 3 },
    ]);
  });

  it("keeps turn on connection refs (id -3) while remapping fcId and customSkillIds", () => {
    const items = [
      { id: -3, fcId: -301, customSkillIds: [-102, 7], count: 4, turn: 2 },
      { id: -3, fcId: 11, count: 1, turn: 5 },
    ];
    const parsed = JSON.parse(remapBody("note", noteBody(items), idMap).skills);
    expect(parsed).toEqual([
      { id: -3, fcId: 701, customSkillIds: [502, 7], count: 4, turn: 2 },
      { id: -3, fcId: 11, count: 1, turn: 5 },
    ]);
  });

  it("leaves separators (id -1) fully untouched, including turn", () => {
    const items = [
      { id: -101, count: 1, turn: 1 },
      { id: -1, turn: 1 },
      { id: -102, count: 2, turn: 2 },
    ];
    const parsed = JSON.parse(remapBody("note", noteBody(items), idMap).skills);
    expect(parsed[1]).toEqual({ id: -1, turn: 1 });
  });

  it("survives a realistic mixed note with turn groupings intact", () => {
    const items = [
      { id: -101, count: 2, turn: 1 },
      { id: -1 },
      { id: -2, routineId: -201, customSkillIds: [-101, -102], count: 1, turn: 2 },
      { id: -3, fcId: -301, customSkillIds: [42], count: 3, turn: 2 },
      { id: 42, count: 5, turn: 3, note: "solid" },
    ];
    const parsed = JSON.parse(remapBody("note", noteBody(items), idMap).skills);
    expect(parsed.map((it: any) => it.turn)).toEqual([1, undefined, 2, 2, 3]);
    expect(parsed).toEqual([
      { id: 501, count: 2, turn: 1 },
      { id: -1 },
      { id: -2, routineId: 601, customSkillIds: [501, 502], count: 1, turn: 2 },
      { id: -3, fcId: 701, customSkillIds: [42], count: 3, turn: 2 },
      { id: 42, count: 5, turn: 3, note: "solid" },
    ]);
  });

  it("returns the body unchanged when idMap is empty (turns still intact)", () => {
    const items = [{ id: 42, count: 1, turn: 1 }];
    const body = noteBody(items);
    const out = remapBody("note", body, new Map());
    expect(out).toBe(body);
    expect(JSON.parse(out.skills)).toEqual(items);
  });

  it("leaves a non-JSON skills string untouched", () => {
    const body = { ...noteBody([]), skills: "not json" };
    const out = remapBody("note", body, idMap);
    expect(out.skills).toBe("not json");
  });
});
