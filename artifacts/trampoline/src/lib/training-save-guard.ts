export type SaveLock = { current: boolean; retryAfter?: number };

const REPEATED_TAP_GUARD_MS = 750;

export function startLockedSave(
  lock: SaveLock,
  setSaving: (saving: boolean) => void,
  attempt: () => Promise<void>,
): boolean {
  const now = Date.now();
  if (lock.current || (lock.retryAfter ?? 0) > now) return false;

  lock.current = true;
  lock.retryAfter = now + REPEATED_TAP_GUARD_MS;
  setSaving(true);
  void attempt()
    .catch(() => undefined)
    .finally(() => {
      lock.current = false;
      setSaving(false);
    });
  return true;
}

export async function persistBeforeClose<T>(
  persist: () => Promise<T>,
  close: (result: T) => void,
  failed: (error: unknown) => void,
): Promise<boolean> {
  try {
    const result = await persist();
    close(result);
    return true;
  } catch (error) {
    failed(error);
    return false;
  }
}