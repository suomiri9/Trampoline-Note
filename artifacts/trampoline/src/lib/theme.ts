import { syncStatusBar } from '@/lib/native-app';

export type Theme = 'dark' | 'light';

const KEY = 'theme';
const DARK_BG = '#050505';
const LIGHT_BG = '#ffffff';

const subscribers = new Set<() => void>();

// Default DARK: the app ships as a near-black theme. Light is opt-in and only
// active when the preference is explicitly stored as 'light'.
export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// Reflect the theme on <html>: toggle the `.dark` class (Tailwind's darkMode is
// class-based) and paint the matching background + status-bar color.
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('dark', theme === 'dark');
  const bg = theme === 'dark' ? DARK_BG : LIGHT_BG;
  el.style.backgroundColor = bg;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bg);
  syncStatusBar(theme);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function subscribeTheme(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
