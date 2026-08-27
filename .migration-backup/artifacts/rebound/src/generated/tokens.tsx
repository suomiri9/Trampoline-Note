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
      "primary": "#2563eb",
      "primaryForeground": "#ffffff",
      "secondary": "#f2f4f6",
      "secondaryForeground": "#1a2028",
      "muted": "#f2f4f6",
      "mutedForeground": "#64707d",
      "accent": "#e0efff",
      "accentForeground": "#1043b1",
      "destructive": "#e11d48",
      "destructiveForeground": "#ffffff",
      "input": "#e2e5e9",
      "ring": "#2563eb",
      "chart1": "#2563eb",
      "chart2": "#059669",
      "chart3": "#d97706",
      "chart4": "#4d50ee",
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
      "background": "#000000",
      "foreground": "#f7f8f8",
      "border": "#1a1a1a",
      "card": "#090909",
      "cardForeground": "#f7f8f8",
      "popover": "#0d0d0d",
      "popoverForeground": "#f7f8f8",
      "primary": "#3b82f6",
      "primaryForeground": "#ffffff",
      "secondary": "#141414",
      "secondaryForeground": "#d8dce1",
      "muted": "#121212",
      "mutedForeground": "#8b919a",
      "accent": "#0f1724",
      "accentForeground": "#60a5fa",
      "destructive": "#f43f5e",
      "destructiveForeground": "#ffffff",
      "input": "#1c1c1c",
      "ring": "#3b82f6",
      "chart1": "#60a5fa",
      "chart2": "#34d399",
      "chart3": "#fbbf24",
      "chart4": "#818cf8",
      "chart5": "#fb7185",
      "sidebar": "#080808",
      "sidebarForeground": "#9ba1aa",
      "sidebarBorder": "#1a1a1a",
      "sidebarPrimary": "#3b82f6",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#0f1724",
      "sidebarAccentForeground": "#60a5fa",
      "sidebarRing": "#3b82f6"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Inter",
      "sans-serif"
    ],
    "mono": [
      "Inter",
      "sans-serif"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
