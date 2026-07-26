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

describe("remapBody('skill', ...) remaps linked ids for offline-created skills", () => {
  it("remaps temp ids inside a connection's skillIds, leaving real ids alone", () => {
    const body = {
      name: "Conn",
      code: "C1",
      isDrill: 2,
      difficulty: 1.2,
      skillIds: [-101, 42, -102],
    };
    const out = remapBody("skill", body, idMap);
    expect(out.skillIds).toEqual([501, 42, 502]);
    expect(out.name).toBe("Conn");
    expect(out.code).toBe("C1");
    expect(out.isDrill).toBe(2);
    expect(out.difficulty).toBe(1.2);
  });

  it("remaps a shape variant's parentSkillId to the synced base id", () => {
    const body = { name: "T", code: "o", shape: "o", difficulty: 0.5, parentSkillId: -101 };
    const out = remapBody("skill", body, idMap);
    expect(out.parentSkillId).toBe(501);
    expect(out.shape).toBe("o");
    expect(out.name).toBe("T");
  });

  it("leaves a real parentSkillId untouched when not in the idMap", () => {
    const body = { name: "T", code: "o", parentSkillId: 42 };
    const out = remapBody("skill", body, idMap);
    expect(out.parentSkillId).toBe(42);
  });

  it("remaps a routine part's sourceRoutineId to the synced routine id", () => {
    const body = {
      name: "Last 5 of Vol",
      code: "L5",
      isDrill: 3,
      skillIds: [-101, 42],
      sourceRoutineId: -201,
    };
    const out = remapBody("skill", body, idMap);
    expect(out.sourceRoutineId).toBe(601);
    expect(out.skillIds).toEqual([501, 42]);
    expect(out.isDrill).toBe(3);
  });

  it("leaves a real sourceRoutineId untouched when not in the idMap", () => {
    const body = { name: "Part", isDrill: 3, sourceRoutineId: 9 };
    const out = remapBody("skill", body, idMap);
    expect(out.sourceRoutineId).toBe(9);
  });

  it("does not add link fields to a body that lacks them", () => {
    const body = { name: "Bs", code: "40", difficulty: 0.5 };
    const out = remapBody("skill", body, idMap);
    expect(out).toEqual(body);
    expect("parentSkillId" in out).toBe(false);
    expect("sourceRoutineId" in out).toBe(false);
    expect("skillIds" in out).toBe(false);
  });

  it("ignores null parentSkillId/sourceRoutineId (no crash, unchanged)", () => {
    const body = { name: "Bs", parentSkillId: null, sourceRoutineId: null };
    const out = remapBody("skill", body, idMap);
    expect(out.parentSkillId).toBeNull();
    expect(out.sourceRoutineId).toBeNull();
  });
});

describe("remapBody('routine', ...) remaps skillIds for offline-created routines", () => {
  it("remaps temp skill ids in a routine's skillIds and keeps other fields", () => {
    const body = { name: "Vol", skillIds: [-101, -102, 42, 7], archived: false };
    const out = remapBody("routine", body, idMap);
    expect(out.skillIds).toEqual([501, 502, 42, 7]);
    expect(out.name).toBe("Vol");
    expect(out.archived).toBe(false);
  });

  it("does not remap parentSkillId/sourceRoutineId on routine bodies (skill-only fields)", () => {
    const body = { name: "Vol", skillIds: [42], parentSkillId: -101, sourceRoutineId: -201 };
    const out = remapBody("routine", body, idMap);
    expect(out.parentSkillId).toBe(-101);
    expect(out.sourceRoutineId).toBe(-201);
  });

  it("returns the body unchanged when idMap is empty", () => {
    const body = { name: "Vol", skillIds: [-101, 42] };
    const out = remapBody("routine", body, new Map());
    expect(out).toBe(body);
  });

  it("leaves a routine without skillIds untouched", () => {
    const body = { name: "Vol" };
    const out = remapBody("routine", body, idMap);
    expect(out).toEqual({ name: "Vol" });
  });
});

describe("remapBody('score', ...) remaps routine links on offline-created scores", () => {
  function scoreBody(extra: Record<string, unknown>) {
    return {
      date: "2026-07-26",
      type: "practice",
      execution: 8.5,
      difficulty: 12.3,
      horizontal: 9.1,
      timeOfFlight: 15.2,
      synchro: false,
      ...extra,
    };
  }

  it("remaps a temp routineId (Set group) and leaves other fields unchanged", () => {
    const body = scoreBody({ routineId: -201 });
    const out = remapBody("score", body, idMap);
    expect(out.routineId).toBe(601);
    expect(out.date).toBe("2026-07-26");
    expect(out.type).toBe("practice");
    expect(out.execution).toBe(8.5);
    expect(out.difficulty).toBe(12.3);
    expect(out.horizontal).toBe(9.1);
    expect(out.timeOfFlight).toBe(15.2);
    expect(out.synchro).toBe(false);
  });

  it("remaps a temp routineIdVol (Vol group) independently of routineId", () => {
    const body = scoreBody({ routineId: 9, routineIdVol: -201 });
    const out = remapBody("score", body, idMap);
    expect(out.routineId).toBe(9);
    expect(out.routineIdVol).toBe(601);
  });

  it("remaps both groups when both reference temp routines", () => {
    const extendedMap = new Map(idMap);
    extendedMap.set(-202, 602);
    const body = scoreBody({ routineId: -201, routineIdVol: -202 });
    const out = remapBody("score", body, extendedMap);
    expect(out.routineId).toBe(601);
    expect(out.routineIdVol).toBe(602);
  });

  it("leaves real routine ids untouched when not in the idMap", () => {
    const body = scoreBody({ routineId: 9, routineIdVol: 11 });
    const out = remapBody("score", body, idMap);
    expect(out.routineId).toBe(9);
    expect(out.routineIdVol).toBe(11);
  });

  it("ignores null/missing routine links (no crash, unchanged)", () => {
    const body = scoreBody({ routineId: null });
    const out = remapBody("score", body, idMap);
    expect(out.routineId).toBeNull();
    expect("routineIdVol" in out).toBe(false);
  });

  it("returns the body unchanged when idMap is empty", () => {
    const body = scoreBody({ routineId: -201 });
    const out = remapBody("score", body, new Map());
    expect(out).toBe(body);
    expect(out.routineId).toBe(-201);
  });
});

describe("remapBody('tofSession', ...) remaps the routine link on offline-created ToF sessions", () => {
  function tofBody(extra: Record<string, unknown>) {
    return {
      date: "2026-07-26",
      tofValues: [1.6, 1.55, 1.58],
      preJumpTof: 1.71,
      note: "morning set",
      ...extra,
    };
  }

  it("remaps a temp routineId and keeps tofValues/preJumpTof/note untouched", () => {
    const body = tofBody({ routineId: -201 });
    const out = remapBody("tofSession", body, idMap);
    expect(out.routineId).toBe(601);
    expect(out.tofValues).toEqual([1.6, 1.55, 1.58]);
    expect(out.preJumpTof).toBe(1.71);
    expect(out.note).toBe("morning set");
    expect(out.date).toBe("2026-07-26");
  });

  it("leaves a real routineId untouched when not in the idMap", () => {
    const body = tofBody({ routineId: 9 });
    const out = remapBody("tofSession", body, idMap);
    expect(out).toBe(body);
    expect(out.routineId).toBe(9);
  });

  it("returns the body unchanged when idMap is empty", () => {
    const body = tofBody({ routineId: -201 });
    const out = remapBody("tofSession", body, new Map());
    expect(out).toBe(body);
  });
});

describe("remapBody('focusMemo', ...) remaps ids inside the focusMemo JSON string", () => {
  it("remaps temp skillIds and routineIds per point, preserving other point fields", () => {
    const points = [
      { id: "p1", text: "fix kickout", skillIds: [-101, 42], routineIds: [-201, 9] },
      { id: "p2", text: "no links" },
    ];
    const body = { focusMemo: JSON.stringify(points), pendingPointIds: ["p1"] };
    const out = remapBody("focusMemo", body, idMap);
    const parsed = JSON.parse(out.focusMemo);
    expect(parsed).toEqual([
      { id: "p1", text: "fix kickout", skillIds: [501, 42], routineIds: [601, 9] },
      { id: "p2", text: "no links" },
    ]);
    expect(out.pendingPointIds).toEqual(["p1"]);
  });

  it("leaves real ids untouched and points without arrays unchanged", () => {
    const points = [{ id: "p1", text: "keep", skillIds: [7], routineIds: [9] }];
    const body = { focusMemo: JSON.stringify(points) };
    const parsed = JSON.parse(remapBody("focusMemo", body, idMap).focusMemo);
    expect(parsed).toEqual(points);
  });

  it("leaves a legacy plain-text (non-JSON) focusMemo untouched", () => {
    const body = { focusMemo: "just some notes" };
    const out = remapBody("focusMemo", body, idMap);
    expect(out).toBe(body);
  });

  it("leaves a non-array JSON focusMemo untouched", () => {
    const body = { focusMemo: JSON.stringify({ not: "an array" }) };
    const out = remapBody("focusMemo", body, idMap);
    expect(out).toBe(body);
  });

  it("returns the body unchanged when focusMemo is not a string", () => {
    const body = { focusMemo: 123 };
    const out = remapBody("focusMemo", body, idMap);
    expect(out).toBe(body);
  });

  it("returns the body unchanged when idMap is empty", () => {
    const points = [{ id: "p1", skillIds: [-101] }];
    const body = { focusMemo: JSON.stringify(points) };
    const out = remapBody("focusMemo", body, new Map());
    expect(out).toBe(body);
  });
});
