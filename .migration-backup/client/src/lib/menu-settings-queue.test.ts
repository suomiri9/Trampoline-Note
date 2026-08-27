// Tests for offline queuing of menu-settings updates: queued items merge
// into one PATCH (last write wins per field), and drainQueue actually
// replays the PATCH to /api/auth/menu-settings.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  enqueueMenuSettingsUpdate,
  drainQueue,
  clearOfflineDataAndQueue,
  updateQueuedByTempId,
} from "./offline-queue";
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
  const { queueDelete } = await import("./offline-db");
  for (const i of items) if (i.id != null) await queueDelete(i.id);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueMenuSettingsUpdate", () => {
  it("queues a PATCH to /api/auth/menu-settings with the body", async () => {
    await enqueueMenuSettingsUpdate({ menuGuide: "BA = barani" });
    const items = await queueAll();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("menuSettings");
    expect(items[0].url).toBe("/api/auth/menu-settings");
    expect(items[0].method).toBe("PATCH");
    expect(items[0].body).toEqual({ menuGuide: "BA = barani" });
  });

  it("merges prior queued updates so both fields ship in one PATCH", async () => {
    await enqueueMenuSettingsUpdate({ menuGuide: "v1" });
    await enqueueMenuSettingsUpdate({ menuRowConnections: false });
    await enqueueMenuSettingsUpdate({ menuGuide: "v2" });
    const items = (await queueAll()).filter((i) => i.kind === "menuSettings");
    expect(items).toHaveLength(1);
    expect(items[0].body).toEqual({ menuGuide: "v2", menuRowConnections: false });
  });

  it("drainQueue replays the queued PATCH to the server", async () => {
    await enqueueMenuSettingsUpdate({ menuGuide: "synced text" });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "u1", menuGuide: "synced text" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const result = await drainQueue();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/auth/menu-settings");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ menuGuide: "synced text" });
    expect(await queueAll()).toHaveLength(0);
  });
});

describe("updateQueuedByTempId", () => {
  it("merges a partial patch into the queued create body instead of replacing it", async () => {
    const { queueAdd } = await import("./offline-db");
    await queueAdd({
      kind: "skill",
      url: "/api/skills",
      method: "POST",
      body: { name: "Barani", code: "Ba", difficulty: 0.6, isDrill: 0 },
      tempId: -5,
      createdAt: Date.now(),
    });
    // A rename-only patch (valid for PUT) must not strip the create fields.
    const ok = await updateQueuedByTempId(-5, { name: "Barani v2" });
    expect(ok).toBe(true);
    const items = (await queueAll()).filter((i) => i.tempId === -5);
    expect(items).toHaveLength(1);
    expect(items[0].body).toEqual({ name: "Barani v2", code: "Ba", difficulty: 0.6, isDrill: 0 });
  });
});
