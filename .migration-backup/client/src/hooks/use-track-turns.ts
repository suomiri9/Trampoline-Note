import { useEffect, useState, useCallback } from 'react';
import { getTrackTurns, setTrackTurns, subscribeTrackTurns } from '@/lib/track-turns';

export function useTrackTurns(): readonly [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getTrackTurns());

  useEffect(() => {
    const cb = () => setEnabled(getTrackTurns());
    cb();
    return subscribeTrackTurns(cb);
  }, []);

  const update = useCallback((v: boolean) => {
    setTrackTurns(v);
  }, []);

  return [enabled, update] as const;
}
