const KEY = 'archivePartsWithRoutine';

const subscribers = new Set<() => void>();

// Default ON: archiving/unarchiving a routine also archives/unarchives its
// own routine parts. The preference is only "off" when explicitly set to '0'.
export function getArchivePartsWithRoutine(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setArchivePartsWithRoutine(v: boolean) {
  try {
    if (v) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '0');
  } catch {
    // ignore
  }
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function subscribeArchivePartsWithRoutine(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
