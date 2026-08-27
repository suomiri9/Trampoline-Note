import { useEffect, useState, useCallback } from 'react';
import {
  getTheme,
  setTheme as setThemeStore,
  subscribeTheme,
  type Theme,
} from '@/lib/theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    const cb = () => setThemeState(getTheme());
    cb();
    return subscribeTheme(cb);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeStore(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeStore(getTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, setTheme, toggle } as const;
}
