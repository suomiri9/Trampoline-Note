import { useEffect, useState, useCallback } from 'react';
import {
  getOfflineModeEnabled,
  setOfflineModeEnabled,
  subscribeOfflineMode,
} from '@/lib/offline-mode';

export function useOfflineMode(): readonly [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getOfflineModeEnabled());

  useEffect(() => {
    const cb = () => setEnabled(getOfflineModeEnabled());
    cb();
    return subscribeOfflineMode(cb);
  }, []);

  const update = useCallback((v: boolean) => {
    setOfflineModeEnabled(v);
  }, []);

  return [enabled, update] as const;
}
