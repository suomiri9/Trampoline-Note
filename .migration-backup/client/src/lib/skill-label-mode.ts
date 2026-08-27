const KEY = 'showSkillNames';

const subscribers = new Set<() => void>();

// Default OFF: skill chips show their short CODE (e.g. "4-o", "Ba"). When ON,
// those chips show the skill's NAME instead. Only "on" when explicitly set.
export function getShowSkillNames(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowSkillNames(v: boolean) {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
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

export function subscribeShowSkillNames(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
