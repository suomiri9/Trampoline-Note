import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import type { SafeUser } from "@shared/models/auth";
import { cacheClearAll, cacheGet, cacheSet, queueAdd, queueCount } from "@/lib/offline-db";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "./use-auth";

let capturedQueryFn: (() => Promise<SafeUser | null>) | undefined;
// Exercise the real QueryClient and QueryObserver without mounting React.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => queryClient,
    useQuery: ({ queryFn }: { queryFn: () => Promise<SafeUser | null> }) => {
      capturedQueryFn = queryFn;
      return { data: null, isLoading: false };
    },
    useMutation: ({ mutationFn, onMutate, onSuccess, onError }: any) => ({
      mutateAsync: async (input: unknown) => {
        await onMutate();
        try {
          const result = await mutationFn(input);
          await onSuccess(result);
          return result;
        } catch (error) {
          onError(error);
          throw error;
        }
      },
      mutate: (input: unknown) => {
        void (async () => {
          await onMutate();
          try {
            await onSuccess(await mutationFn(input));
          } catch (error) {
            onError(error);
          }
        })();
      },
      error: null,
      isPending: false,
    }),
  };
});
vi.mock("@/lib/settings-sync", () => ({ cancelPendingSettingsPush: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const key = ["/api/auth/user"];
const user = (id: string) => ({ id, email: `${id}@example.com` }) as SafeUser;
const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

function response(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  queryClient.clear();
  await cacheClearAll();
  storage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  queryClient.clear();
});

describe("auth identity observer", () => {
  for (const action of ["login", "register", "logout"] as const) {
    it(`updates an already subscribed observer after ${action} without losing pending offline entries`, async () => {
      const before = user("previous");
      const after = user("next");
      queryClient.setQueryData(key, action === "logout" ? before : null);
      await cacheSet("skills", ["old user data"]);
      await queueAdd({ kind: "note", url: "/api/notes", method: "POST", body: {},
        tempId: -1, createdAt: 1 });
      const observer = new QueryObserver<SafeUser | null>(queryClient, {
        queryKey: key, enabled: false,
      });
      const seen: Array<SafeUser | null | undefined> = [];
      const unsubscribe = observer.subscribe((result) => seen.push(result.data));
      globalThis.fetch = vi.fn(async () => response(after));
      const auth = useAuth();

      if (action === "logout") {
        auth.logout();
        await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeNull());
        expect(await queueCount()).toBe(0);
        expect(await cacheGet("skills")).toBeNull();
      } else {
        await auth[action]({ email: "next@example.com", password: "password" });
        expect(observer.getCurrentResult().data).toEqual(after);
        expect(await cacheGet("user")).toEqual(after);
        // Signing in must not silently discard offline entries.
        expect(await queueCount()).toBe(1);
      }
      expect(seen.at(-1)).toEqual(action === "logout" ? null : after);
      expect(queryClient.getQueryCache().find({ queryKey: key })).toBe(observer.getCurrentQuery());
      unsubscribe();
    });
  }

  for (const [action, lateStatus] of [["login", 401], ["logout", 200]] as const) {
    it(`ignores a late ${lateStatus} from an old read after ${action}`, async () => {
      const oldRead = deferred<Response>();
      const after = user("new");
      const before = user("previous");
      queryClient.setQueryData(key, action === "logout" ? before : null);
      const observer = new QueryObserver<SafeUser | null>(queryClient, {
        queryKey: key, queryFn: async () => {
          // Use the actual auth query function registered by useAuth.
          return authQueryFn();
        }, enabled: false,
      });
      const unsubscribe = observer.subscribe(() => {});
      let authQueryFn!: () => Promise<SafeUser | null>;
      // The mocked useQuery above captures the production queryFn.
      const auth = useAuth();
      authQueryFn = capturedQueryFn!;
      globalThis.fetch = vi.fn((url: string) =>
        url === "/api/auth/user" ? oldRead.promise : Promise.resolve(response(after)));
      const reading = observer.refetch();
      await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/user", expect.anything()));
      await queueAdd({ kind: "note", url: "/api/notes", method: "POST", body: {},
        tempId: -1, createdAt: 1 });
      if (action === "login") {
        await auth.login({ email: "new@example.com", password: "password" });
      } else {
        // useAuth deliberately exposes logout as mutate (not mutateAsync).
        auth.logout();
        await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeNull());
      }
      oldRead.resolve(response(lateStatus === 401 ? null : before, lateStatus));
      await reading;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(observer.getCurrentResult().data).toEqual(action === "login" ? after : null);
      expect(await cacheGet("user")).toEqual(action === "login" ? after : null);
      expect(await queueCount()).toBe(action === "login" ? 1 : 0);
      expect(storage.get("tn-session-active")).toBe(action === "login" ? "1" : undefined);
      unsubscribe();
    });
  }

  it("still serves the verified cached identity when a read fails offline", async () => {
    const cached = user("offline");
    storage.set("tn-session-active", "1");
    storage.set("offlineModeEnabled", "1");
    await cacheSet("user", cached);
    useAuth();
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Network unavailable"); });
    const observer = new QueryObserver<SafeUser | null>(queryClient, {
      queryKey: key, queryFn: capturedQueryFn, enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    expect(observer.getCurrentResult().data).toEqual(cached);
    unsubscribe();
  });
});