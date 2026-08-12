/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#ffffff",
      "foreground": "#0a0f14",
      "border": "#e8eaed",
      "card": "#ffffff",
      "cardForeground": "#0a0f14",
      "popover": "#ffffff",
      "popoverForeground": "#0a0f14",
      "primary": "#0284c7",
      "primaryForeground": "#ffffff",
      "secondary": "#f2f4f6",
      "secondaryForeground": "#1a2028",
      "muted": "#f2f4f6",
      "mutedForeground": "#64707d",
      "accent": "#e8f4fd",
      "accentForeground": "#075985",
      "destructive": "#e11d48",
      "destructiveForeground": "#ffffff",
      "input": "#e2e5e9",
      "ring": "#0284c7",
      "chart1": "#0284c7",
      "chart2": "#059669",
      "chart3": "#d97706",
      "chart4": "#6366f1",
      "chart5": "#e11d48",
      "sidebar": "#f7f8f9",
      "sidebarForeground": "#40474f",
      "sidebarBorder": "#e8eaed",
      "sidebarPrimary": "#0284c7",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#e8f4fd",
      "sidebarAccentForeground": "#075985",
      "sidebarRing": "#0284c7"
    },
    "dark": {
      "background": "#050505",
      "foreground": "#f7f8f8",
      "border": "#1a1d21",
      "card": "#0b0c0e",
      "cardForeground": "#f7f8f8",
      "popover": "#0e0f12",
      "popoverForeground": "#f7f8f8",
      "primary": "#7dd3fc",
      "primaryForeground": "#06111a",
      "secondary": "#15171a",
      "secondaryForeground": "#d8dce1",
      "muted": "#131518",
      "mutedForeground": "#8b919a",
      "accent": "#0c1a26",
      "accentForeground": "#7dd3fc",
      "destructive": "#f43f5e",
      "destructiveForeground": "#ffffff",
      "input": "#1c1f24",
      "ring": "#7dd3fc",
      "chart1": "#38bdf8",
      "chart2": "#34d399",
      "chart3": "#fbbf24",
      "chart4": "#818cf8",
      "chart5": "#fb7185",
      "sidebar": "#0a0b0d",
      "sidebarForeground": "#9ba1aa",
      "sidebarBorder": "#1a1d21",
      "sidebarPrimary": "#7dd3fc",
      "sidebarPrimaryForeground": "#06111a",
      "sidebarAccent": "#0c1a26",
      "sidebarAccentForeground": "#7dd3fc",
      "sidebarRing": "#7dd3fc"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "IBM Plex Mono",
      "ui-monospace",
      "monospace"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem",
  "motion": {
    "easeOutStrong": "cubic-bezier(0.23, 1, 0.32, 1)",
    "easeInOutStrong": "cubic-bezier(0.77, 0, 0.175, 1)",
    "easeDrawer": "cubic-bezier(0.32, 0.72, 0, 1)"
  }
} as const;

export type Tokens = typeof tokens;
export default tokens;
