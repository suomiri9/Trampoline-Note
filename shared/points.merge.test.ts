import { describe, it, expect } from "vitest";
import { mergePoints, type PointToFix } from "./points";

const pt = (id: string, name: string, extra: Partial<PointToFix> = {}): PointToFix => ({
  id,
  name,
  skillIds: [],
  routineIds: [],
  ...extra,
});

describe("mergePoints — three-way merge of concurrent Points-to-Fix edits", () => {
  it("keeps both edits when two devices edit different points", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("a", "A renamed"), pt("b", "B")]; // I renamed a
    const theirs = [pt("a", "A"), pt("b", "B renamed")]; // they renamed b
    expect(mergePoints(base, mine, theirs)).toEqual([
      pt("a", "A renamed"),
      pt("b", "B renamed"),
    ]);
  });

  it("keeps their edit when I delete a different point", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("b", "B")]; // I deleted a
    const theirs = [pt("a", "A"), pt("b", "B renamed")];
    expect(mergePoints(base, mine, theirs)).toEqual([pt("b", "B renamed")]);
  });

  it("keeps a point they added while I was editing", () => {
    const base = [pt("a", "A")];
    const mine = [pt("a", "A renamed")];
    const theirs = [pt("a", "A"), pt("c", "C new")];
    expect(mergePoints(base, mine, theirs)).toEqual([
      pt("a", "A renamed"),
      pt("c", "C new"),
    ]);
  });

  it("keeps my added point plus their concurrent state", () => {
    const base = [pt("a", "A")];
    const mine = [pt("a", "A"), pt("m", "Mine new")];
    const theirs = [pt("a", "A renamed")];
    expect(mergePoints(base, mine, theirs)).toEqual([
      pt("a", "A renamed"),
      pt("m", "Mine new"),
    ]);
  });

  it("my delete wins even if they edited the same point", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("b", "B")];
    const theirs = [pt("a", "A renamed"), pt("b", "B")];
    expect(mergePoints(base, mine, theirs)).toEqual([pt("b", "B")]);
  });

  it("their delete sticks when I did not touch the point", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("a", "A"), pt("b", "B renamed")];
    const theirs = [pt("b", "B")]; // they deleted a
    expect(mergePoints(base, mine, theirs)).toEqual([pt("b", "B renamed")]);
  });

  it("restores my edited version when they deleted the point I edited", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("a", "A renamed"), pt("b", "B")];
    const theirs = [pt("b", "B")];
    expect(mergePoints(base, mine, theirs)).toEqual([
      pt("b", "B"),
      pt("a", "A renamed"),
    ]);
  });

  it("mine wins when both edited the same point", () => {
    const base = [pt("a", "A")];
    const mine = [pt("a", "A mine")];
    const theirs = [pt("a", "A theirs")];
    expect(mergePoints(base, mine, theirs)).toEqual([pt("a", "A mine")]);
  });

  it("merges category and link changes independently", () => {
    const base = [
      pt("a", "A", { category: "General" }),
      pt("b", "B", { skillIds: [1] }),
    ];
    const mine = [
      pt("a", "A", { category: "Landing" }), // I changed category
      pt("b", "B", { skillIds: [1] }),
    ];
    const theirs = [
      pt("a", "A", { category: "General" }),
      pt("b", "B", { skillIds: [1, 2] }), // they added a link
    ];
    expect(mergePoints(base, mine, theirs)).toEqual([
      pt("a", "A", { category: "Landing" }),
      pt("b", "B", { skillIds: [1, 2] }),
    ]);
  });

  it("no concurrent changes → my write applies as-is", () => {
    const base = [pt("a", "A"), pt("b", "B")];
    const mine = [pt("b", "B renamed")];
    expect(mergePoints(base, mine, base)).toEqual([pt("b", "B renamed")]);
  });

  it("empty base treats everything of mine as additions", () => {
    const mine = [pt("m", "Mine")];
    const theirs = [pt("t", "Theirs")];
    expect(mergePoints([], mine, theirs)).toEqual([pt("t", "Theirs"), pt("m", "Mine")]);
  });
});
