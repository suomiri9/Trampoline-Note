const KEY = 'trackTurns';

const subscribers = new Set<() => void>();

// Default ON: the note dialog, session cards, and stats show turn numbers and
// counts. The preference is only "off" when explicitly set to '0'. Turning it
// off hides all turn UI without touching saved turn markers.
export function getTrackTurns(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setTrackTurns(v: boolean) {
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

export function subscribeTrackTurns(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
