import { describe, it, expect } from "vitest";
import { countCachedTargets, getCachedPathnames } from "./offline-control";

describe("countCachedTargets", () => {
  it("counts only targets present in the cached set", () => {
    const cached = new Set(["/", "/assets/a.js"]);
    expect(countCachedTargets(["/", "/assets/a.js", "/assets/b.js"], cached)).toBe(2);
  });

  it("handles empty inputs", () => {
    expect(countCachedTargets([], new Set())).toBe(0);
    expect(countCachedTargets(["/x"], new Set<string>())).toBe(0);
  });
});

describe("getCachedPathnames", () => {
  it("collects pathnames and ignores query strings (chunk retry variants)", async () => {
    const fakeCache = {
      keys: async () => [
        { url: "https://app.test/assets/a.js" },
        { url: "https://app.test/assets/b.js?retry=1" },
        { url: "https://app.test/" },
      ],
    } as unknown as Cache;
    const paths = await getCachedPathnames(fakeCache);
    expect(paths.has("/assets/a.js")).toBe(true);
    expect(paths.has("/assets/b.js")).toBe(true);
    expect(paths.has("/")).toBe(true);
    expect(paths.size).toBe(3);
  });

  it("skips malformed entries instead of failing the whole scan", async () => {
    const fakeCache = {
      keys: async () => [{ url: "not a url" }, { url: "https://app.test/assets/ok.js" }],
    } as unknown as Cache;
    const paths = await getCachedPathnames(fakeCache);
    expect(paths.has("/assets/ok.js")).toBe(true);
    expect(paths.size).toBe(1);
  });
});
