import type { CSSProperties } from "react";

/**
 * Per-page accent identities, keyed to the bottom-nav icon colors in App.tsx.
 * Each entry is a pair of HSL triplets (Tailwind palette): `a` drives glows,
 * kickers and tints via `--page-accent`; `b` is the gradient partner via
 * `--page-accent-2` (used by `.text-gradient-page` and friends).
 *
 * Home/Training intentionally has no entry — the `:root` defaults keep it on
 * the primary blue. Detail pages inherit their section's accent.
 */
export type PageAccentName =
  | "score"
  | "progress"
  | "skills"
  | "routines"
  | "whoop"
  | "coach"
  | "tof"
  | "execution"
  | "settings";

export const PAGE_ACCENTS: Record<PageAccentName, { a: string; b: string }> = {
  score:     { a: "48 96% 53%",  b: "27 96% 61%" },  // yellow-400 → orange-400 (Trophy)
  progress:  { a: "142 69% 58%", b: "158 64% 52%" }, // green-400 → emerald-400 (BarChart3)
  skills:    { a: "0 91% 71%",   b: "351 95% 71%" }, // red-400 → rose-400 (Target)
  routines:  { a: "270 95% 75%", b: "292 91% 73%" }, // purple-400 → fuchsia-400 (Layers)
  whoop:     { a: "351 95% 71%", b: "329 86% 70%" }, // rose-400 → pink-400 (HeartPulse)
  coach:     { a: "188 86% 53%", b: "198 93% 60%" }, // cyan-400 → sky-400 (Bot)
  tof:       { a: "43 96% 56%",  b: "25 95% 53%" },  // amber-400 → orange-500 (Timer)
  execution: { a: "158 64% 52%", b: "172 66% 50%" }, // emerald-400 → teal-400 (ClipboardCheck)
  settings:  { a: "215 20% 65%", b: "213 27% 84%" }, // slate-400 → slate-300 (Settings)
};

/** Inline style that scopes the page-accent CSS variables to a subtree. */
export function pageAccentStyle(name?: PageAccentName): CSSProperties | undefined {
  if (!name) return undefined;
  const { a, b } = PAGE_ACCENTS[name];
  return { "--page-accent": a, "--page-accent-2": b } as CSSProperties;
}
