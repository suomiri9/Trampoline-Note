import { isNativeApp } from './platform';

const KEY = 'offlineModeEnabled';

const subscribers = new Set<() => void>();

export function getOfflineModeEnabled(): boolean {
  // The iOS app keeps all data on the device, so it never needs offline mode.
  if (isNativeApp) return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setOfflineModeEnabled(v: boolean) {
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

export function subscribeOfflineMode(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
