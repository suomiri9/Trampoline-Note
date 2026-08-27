import { useEffect, useState, useCallback } from 'react';
import {
  getArchivePartsWithRoutine,
  setArchivePartsWithRoutine,
  subscribeArchivePartsWithRoutine,
} from '@/lib/archive-cascade';

export function useArchiveCascade(): readonly [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getArchivePartsWithRoutine());

  useEffect(() => {
    const cb = () => setEnabled(getArchivePartsWithRoutine());
    cb();
    return subscribeArchivePartsWithRoutine(cb);
  }, []);

  const update = useCallback((v: boolean) => {
    setArchivePartsWithRoutine(v);
  }, []);

  return [enabled, update] as const;
}
