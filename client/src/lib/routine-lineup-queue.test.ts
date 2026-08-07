// Offline queue behavior for routine "change from this day" lineup edits.
//
// `applyFromDay` PUTs are ORDERED mutations: the server snapshots whatever
// lineup is current when each one lands, so the queue must never collapse
// them (the boundary an earlier one creates would be lost) and later plain
// edits (rename/archive) must not replace them. Only plain-over-plain PUTs
// collapse. These tests cover the review-flagged loss paths: multiple
// offline lineup changes, and a lineup change followed by another routine
// update before reconnect.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { enqueueEntityChange, drainQueue, clearOfflineDataAndQueue } from "./offline-queue";
import { queueAll, queueDelete } from "./offline-db";

// offline-mode reads localStorage, which doesn't exist in node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const ROUTINE_ID = 7;

// Bodies mirror what routines.tsx sends: full payload + applyFromDay +
// client-precomputed versions (the server ignores `versions`; it only keeps
// the offline mirror correct while the edit is queued).
const fromDayEdit1 = {
  name: "Voluntary",
  code: "V",
  skillIds: [1, 2, 3],
  applyFromDay: "2026-07-10",
  versions: [{ skillIds: [9, 9, 9], effectiveUntil: "2026-07-10" }],
};
const fromDayEdit2 = {
  name: "Voluntary",
  code: "V",
  skillIds: [4, 5, 6],
  applyFromDay: "2026-07-20",
  versions: [
    { skillIds: [9, 9, 9], effectiveUntil: "2026-07-10" },
    { skillIds: [1, 2, 3], effectiveUntil: "2026-07-20" },
  ],
};
const rename = { name: "Voluntary v2", code: "V2", skillIds: [1, 2, 3] };

async function routineItems() {
  const items = (await queueAll()).filter((i) => i.kind === "routine");
  items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  return items;
}

beforeEach(async () => {
  await clearOfflineDataAndQueue();
  for (const i of await queueAll()) if (i.id != null) await queueDelete(i.id);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueEntityChange ordering around applyFromDay lineup edits", () => {
  it("keeps BOTH queued PUTs when two from-day lineup edits stack offline", async () => {
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit2);
    const items = await routineItems();
    expect(items).toHaveLength(2);
    expect((items[0].body as any).applyFromDay).toBe("2026-07-10");
    expect((items[0].body as any).skillIds).toEqual([1, 2, 3]);
    expect((items[1].body as any).applyFromDay).toBe("2026-07-20");
    expect((items[1].body as any).skillIds).toEqual([4, 5, 6]);
  });

  it("a later plain edit (rename) does NOT replace a queued from-day lineup change", async () => {
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", rename);
    const items = await routineItems();
    expect(items).toHaveLength(2);
    expect((items[0].body as any).applyFromDay).toBe("2026-07-10");
    expect((items[1].body as any).applyFromDay).toBeUndefined();
    expect((items[1].body as any).name).toBe("Voluntary v2");
  });

  it("an incoming from-day edit applies AFTER an already-queued plain edit (no collapse)", async () => {
    // The plain edit may carry a lineup rewrite; the from-day snapshot
    // depends on the state it produces, so order must be preserved.
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", rename);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    const items = await routineItems();
    expect(items).toHaveLength(2);
    expect((items[0].body as any).name).toBe("Voluntary v2");
    expect((items[1].body as any).applyFromDay).toBe("2026-07-10");
  });

  it("plain-over-plain still collapses to the latest body", async () => {
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", { ...rename, name: "first" });
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", rename);
    const items = await routineItems();
    expect(items).toHaveLength(1);
    expect((items[0].body as any).name).toBe("Voluntary v2");
  });

  it("does not disturb queued changes for OTHER routines", async () => {
    await enqueueEntityChange("routine", 99, "PUT", { ...rename, name: "other" });
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", rename);
    const items = await routineItems();
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.tempId === 99)).toHaveLength(1);
  });

  it("a DELETE supersedes the routine's whole queued history, including from-day edits", async () => {
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit2);
    await enqueueEntityChange("routine", ROUTINE_ID, "DELETE");
    const items = await routineItems();
    expect(items).toHaveLength(1);
    expect(items[0].method).toBe("DELETE");
  });
});

describe("drainQueue replays ordered lineup mutations", () => {
  it("sends each queued PUT in enqueue order with its body intact", async () => {
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit1);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", fromDayEdit2);
    await enqueueEntityChange("routine", ROUTINE_ID, "PUT", rename);

    const calls: Array<{ url: string; method?: string; body: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ id: ROUTINE_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await drainQueue();
    expect(result.synced).toBe(3);
    expect(result.failed).toBe(0);

    const puts = calls.filter((c) => c.url === `/api/routines/${ROUTINE_ID}`);
    expect(puts).toHaveLength(3);
    expect(puts.every((c) => c.method === "PUT")).toBe(true);
    // Order is the athlete's edit order — the server chains version
    // snapshots from it, reproducing the client's optimistic result.
    expect(puts[0].body.applyFromDay).toBe("2026-07-10");
    expect(puts[0].body.skillIds).toEqual([1, 2, 3]);
    expect(puts[1].body.applyFromDay).toBe("2026-07-20");
    expect(puts[1].body.skillIds).toEqual([4, 5, 6]);
    expect(puts[2].body.applyFromDay).toBeUndefined();
    expect(puts[2].body.name).toBe("Voluntary v2");
    expect(await queueAll()).toHaveLength(0);
  });
});
