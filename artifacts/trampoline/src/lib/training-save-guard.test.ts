import { describe, expect, it, vi } from "vitest";
import { persistBeforeClose, startLockedSave } from "./training-save-guard";

describe("persistBeforeClose", () => {
  it("closes only after a confirmed server save", async () => {
    const close = vi.fn();
    const failed = vi.fn();

    await expect(
      persistBeforeClose(async () => ({ id: 42 }), close, failed),
    ).resolves.toBe(true);

    expect(close).toHaveBeenCalledWith({ id: 42 });
    expect(failed).not.toHaveBeenCalled();
  });

  it("treats confirmed offline queueing as a safe save", async () => {
    const queued = { _queuedOffline: true as const, tempId: -1 };
    const close = vi.fn();

    await expect(
      persistBeforeClose(async () => queued, close, vi.fn()),
    ).resolves.toBe(true);

    expect(close).toHaveBeenCalledWith(queued);
  });

  it("keeps the editor open when persistence fails so retry remains possible", async () => {
    const close = vi.fn();
    const failed = vi.fn();

    await expect(
      persistBeforeClose(
        async () => {
          throw new Error("network unavailable");
        },
        close,
        failed,
      ),
    ).resolves.toBe(false);

    expect(close).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: "network unavailable" }));
  });
});

describe("startLockedSave", () => {
  it("ignores repeated End Training taps until the first attempt settles", async () => {
    const lock = { current: false };
    const setSaving = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const attempt = vi.fn(() => pending);

    expect(startLockedSave(lock, setSaving, attempt)).toBe(true);
    expect(startLockedSave(lock, setSaving, attempt)).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);

    finish();
    await pending;
    await Promise.resolve();

    expect(lock.current).toBe(false);
    expect(setSaving).toHaveBeenLastCalledWith(false);
  });

  it("ignores an accidental second tap even when a fast failure already settled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T10:00:00Z"));
    const lock = { current: false };
    const attempt = vi.fn(async () => undefined);

    expect(startLockedSave(lock, vi.fn(), attempt)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.current).toBe(false);

    expect(startLockedSave(lock, vi.fn(), attempt)).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(750);
    expect(startLockedSave(lock, vi.fn(), attempt)).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("releases the lock after validation or save failure so the user can retry", async () => {
    const lock = { current: false };
    const failedAttempt = vi.fn(async () => {
      throw new Error("invalid");
    });

    expect(startLockedSave(lock, vi.fn(), failedAttempt)).toBe(true);
    await vi.waitFor(() => expect(lock.current).toBe(false));

    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(startLockedSave(lock, vi.fn(), async () => undefined)).toBe(true);
  });
});