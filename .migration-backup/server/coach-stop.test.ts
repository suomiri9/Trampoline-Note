// Stop contract for the streaming coach chat: aborting the signal at ANY
// point before persistence must throw CoachStoppedError and persist nothing —
// no coach messages, no menu-guide update.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createMock, storageMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  storageMock: {
    getNotes: vi.fn(async () => []),
    getSkills: vi.fn(async () => []),
    getRoutines: vi.fn(async () => []),
    getScores: vi.fn(async () => []),
    getUser: vi.fn(async () => undefined),
    getCoachMessages: vi.fn(async () => []),
    createCoachMessage: vi.fn(async () => ({})),
    updateUserMenuGuide: vi.fn(async () => {}),
    commitCoachExchange: vi.fn(async () => {}),
  },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));
vi.mock("./storage", () => ({ storage: storageMock }));
const { storeCoachImagesMock, deleteCoachImagesMock } = vi.hoisted(() => ({
  storeCoachImagesMock: vi.fn(async () => [] as { key: string; contentType: string }[]),
  deleteCoachImagesMock: vi.fn(async () => {}),
}));
vi.mock("./coach-images", () => ({
  storeCoachImages: storeCoachImagesMock,
  deleteCoachImages: deleteCoachImagesMock,
  serveCoachImage: vi.fn(),
}));
vi.mock("./whoop", () => ({
  WhoopNotConnectedError: class WhoopNotConnectedError extends Error {},
  getWhoopDashboardDataCached: vi.fn(async () => {
    const { WhoopNotConnectedError } = await import("./whoop");
    throw new WhoopNotConnectedError();
  }),
}));

import { coachChat, CoachStoppedError } from "./coach";

// An async-iterable "stream" that yields the given text chunks as OpenAI
// delta parts, optionally running a hook before ending.
function fakeStream(chunks: string[], onEnd?: () => void) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield { choices: [{ delta: { content: c } }] };
      }
      onEnd?.();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("coachChat stop contract", () => {
  it("aborting after the last delta but before persistence discards everything", async () => {
    const aborter = new AbortController();
    // The full reply streams out, INCLUDING a menu_guide block — then the
    // stop lands before any write happens.
    createMock.mockImplementation(async () =>
      fakeStream(
        ["Updated your guide.", "\n```menu_guide\ncr = TJ (Tuck Jump)\n```"],
        () => aborter.abort(),
      ),
    );

    await expect(
      coachChat("user-1", "remember cr means tuck jump", undefined, undefined, () => {}, undefined, aborter.signal),
    ).rejects.toBeInstanceOf(CoachStoppedError);

    expect(storageMock.commitCoachExchange).not.toHaveBeenCalled();
    expect(storageMock.updateUserMenuGuide).not.toHaveBeenCalled();
  });

  it("aborting during suggestion generation, after the full reply, still discards everything", async () => {
    // The reply (with a menu_guide block) streams fully; the stop lands while
    // generateSuggestions' model call is in flight — i.e. after all parsing
    // but before the commit transaction. Nothing may be written.
    const aborter = new AbortController();
    createMock
      .mockImplementationOnce(async () =>
        fakeStream(["Updated your guide.", "\n```menu_guide\ncr = TJ (Tuck Jump)\n```"]),
      )
      // generateSuggestions call: abort mid-flight, then return normally.
      .mockImplementationOnce(async () => {
        aborter.abort();
        return { choices: [{ message: { content: "```suggestions\n[]\n```" } }] };
      });

    await expect(
      coachChat("user-1", "remember cr means tuck jump", undefined, undefined, () => {}, undefined, aborter.signal),
    ).rejects.toBeInstanceOf(CoachStoppedError);

    expect(storageMock.commitCoachExchange).not.toHaveBeenCalled();
    expect(storageMock.updateUserMenuGuide).not.toHaveBeenCalled();
    expect(storageMock.createCoachMessage).not.toHaveBeenCalled();
  });

  it("aborting during the photo upload deletes the uploaded blobs and commits nothing", async () => {
    const aborter = new AbortController();
    const refs = [{ key: "coach-images/user-1/x.jpg", contentType: "image/jpeg" }];
    createMock
      .mockImplementationOnce(async () => fakeStream(["Nice menu."]))
      .mockImplementationOnce(async () => ({
        choices: [{ message: { content: "```suggestions\n[]\n```" } }],
      }));
    // Stop lands while the upload is in flight; the upload still finishes,
    // so the compensation must delete the now-orphaned blobs.
    storeCoachImagesMock.mockImplementationOnce(async () => {
      aborter.abort();
      return refs;
    });

    await expect(
      coachChat(
        "user-1",
        "log this menu",
        undefined,
        ["data:image/jpeg;base64,aGk="],
        () => {},
        undefined,
        aborter.signal,
      ),
    ).rejects.toBeInstanceOf(CoachStoppedError);

    expect(deleteCoachImagesMock).toHaveBeenCalledWith(refs);
    expect(storageMock.commitCoachExchange).not.toHaveBeenCalled();
    expect(storageMock.createCoachMessage).not.toHaveBeenCalled();
  });

  it("aborting after the commit started does not undo it (reply is committed)", async () => {
    const aborter = new AbortController();
    createMock
      .mockImplementationOnce(async () => fakeStream(["All good."]))
      .mockImplementationOnce(async () => ({
        choices: [{ message: { content: "```suggestions\n[]\n```" } }],
      }));
    storageMock.commitCoachExchange.mockImplementationOnce(async () => {
      aborter.abort(); // late stop mid-transaction — commit wins
    });

    const res = await coachChat("user-1", "hi", undefined, undefined, () => {}, undefined, aborter.signal);
    expect(res.reply).toBe("All good.");
    expect(storageMock.commitCoachExchange).toHaveBeenCalledTimes(1);
  });

  it("aborting mid-stream discards everything", async () => {
    const aborter = new AbortController();
    let onDeltaCount = 0;
    createMock.mockImplementation(async () => fakeStream(["Hello ", "athlete"]));

    await expect(
      coachChat(
        "user-1",
        "hi",
        undefined,
        undefined,
        () => {
          onDeltaCount++;
          if (onDeltaCount === 1) aborter.abort();
        },
        undefined,
        aborter.signal,
      ),
    ).rejects.toBeInstanceOf(CoachStoppedError);

    expect(storageMock.commitCoachExchange).not.toHaveBeenCalled();
    expect(storageMock.updateUserMenuGuide).not.toHaveBeenCalled();
  });

  it("without a stop, both turns persist in one commit", async () => {
    // First call: the chat stream; second call: generateSuggestions (non-stream).
    createMock
      .mockImplementationOnce(async () => fakeStream(["All good."]))
      .mockImplementationOnce(async () => ({
        choices: [{ message: { content: "```suggestions\n[]\n```" } }],
      }));

    const res = await coachChat("user-1", "hi", undefined, undefined, () => {}, undefined, new AbortController().signal);
    expect(res.reply).toBe("All good.");
    expect(storageMock.commitCoachExchange).toHaveBeenCalledTimes(1);
    const [, exchange] = storageMock.commitCoachExchange.mock.calls[0];
    expect(exchange.userMessage.content).toBe("hi");
    expect(exchange.assistantMessage.content).toBe("All good.");
    expect(exchange.menuGuide).toBeNull();
  });
});
