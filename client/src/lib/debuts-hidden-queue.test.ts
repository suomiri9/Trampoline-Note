// Tests for offline queuing of Debuts hidden-map updates: queued items
// collapse to the latest whole-map payload (last write wins), and a stale
// queued payload is never left behind alongside newer ones.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { enqueueDebutsHiddenUpdate, clearOfflineDataAndQueue } from "./offline-queue";
import { queueAll } from "./offline-db";

// offline-mode reads localStorage, which doesn't exist in node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(async () => {
  await clearOfflineDataAndQueue();
  const items = await queueAll();
  // clearOfflineDataAndQueue clears caches; make sure the queue is empty too.
  const { queueDelete } = await import("./offline-db");
  for (const i of items) if (i.id != null) await queueDelete(i.id);
});

describe("enqueueDebutsHiddenUpdate", () => {
  it("queues a PATCH to /api/auth/debuts-hidden with the whole map", async () => {
    const map = JSON.stringify({ "debut-skill": ["a"] });
    await enqueueDebutsHiddenUpdate(map);
    const items = await queueAll();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("debutsHidden");
    expect(items[0].url).toBe("/api/auth/debuts-hidden");
    expect(items[0].method).toBe("PATCH");
    expect(items[0].body).toEqual({ debutsHidden: map });
  });

  it("collapses prior queued updates so only the latest map ships", async () => {
    await enqueueDebutsHiddenUpdate(JSON.stringify({ "debut-skill": ["a"] }));
    await enqueueDebutsHiddenUpdate(JSON.stringify({ "debut-skill": ["a", "b"] }));
    const latest = JSON.stringify({ "debut-skill": ["a", "b"], "debut-routine": ["r1"] });
    await enqueueDebutsHiddenUpdate(latest);
    const items = (await queueAll()).filter((i) => i.kind === "debutsHidden");
    expect(items).toHaveLength(1);
    expect(items[0].body).toEqual({ debutsHidden: latest });
  });

  it("does not touch other queued kinds", async () => {
    const { queueAdd } = await import("./offline-db");
    await queueAdd({
      kind: "note",
      url: "/api/notes",
      method: "POST",
      body: { comment: "x" },
      tempId: -1,
      createdAt: Date.now(),
    });
    await enqueueDebutsHiddenUpdate(JSON.stringify({ "debut-skill": [] }));
    const items = await queueAll();
    expect(items.filter((i) => i.kind === "note")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "debutsHidden")).toHaveLength(1);
  });
});
