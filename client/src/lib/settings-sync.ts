// Sync general app preferences (theme, time format, skill-name display,
// turn tracking, archive cascade) with the user account so they follow the
// user across devices. localStorage stays the source for instant/offline
// reads; the account copy wins on login.
//
// Device-specific settings (offline mode) are intentionally NOT synced.

import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { getShowSkillNames, setShowSkillNames } from "@/lib/skill-label-mode";
import { getTrackTurns, setTrackTurns } from "@/lib/track-turns";
import { getArchivePartsWithRoutine, setArchivePartsWithRoutine } from "@/lib/archive-cascade";
import { getTimeFormat, setTimeFormatGlobal, type TimeFormat } from "@/hooks/use-time-format";

export interface AppSettings {
  theme?: Theme;
  timeFormat?: TimeFormat;
  showSkillNames?: boolean;
  trackTurns?: boolean;
  archiveCascade?: boolean;
}

export function collectAppSettings(): AppSettings {
  return {
    theme: getTheme(),
    timeFormat: getTimeFormat(),
    showSkillNames: getShowSkillNames(),
    trackTurns: getTrackTurns(),
    archiveCascade: getArchivePartsWithRoutine(),
  };
}

/** Apply the account's stored settings to the local stores (account wins). */
export function applyAccountSettings(raw: string | null | undefined) {
  if (!raw) return;
  let s: AppSettings;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    s = parsed as AppSettings;
  } catch {
    return;
  }
  if ((s.theme === "dark" || s.theme === "light") && s.theme !== getTheme()) setTheme(s.theme);
  if ((s.timeFormat === "12h" || s.timeFormat === "24h") && s.timeFormat !== getTimeFormat()) setTimeFormatGlobal(s.timeFormat);
  if (typeof s.showSkillNames === "boolean" && s.showSkillNames !== getShowSkillNames()) setShowSkillNames(s.showSkillNames);
  if (typeof s.trackTurns === "boolean" && s.trackTurns !== getTrackTurns()) setTrackTurns(s.trackTurns);
  if (typeof s.archiveCascade === "boolean" && s.archiveCascade !== getArchivePartsWithRoutine()) setArchivePartsWithRoutine(s.archiveCascade);
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChanges: AppSettings = {};

/** Cancel any queued push (call on logout/account switch so a pending write
 * from the previous session can't land on another account). */
export function cancelPendingSettingsPush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pendingChanges = {};
}

/**
 * Debounced best-effort push of CHANGED settings to the account. Only the
 * fields passed here are sent; the server merges them into the stored blob,
 * so two devices changing different settings can't overwrite each other.
 */
export function pushAccountSettings(changed: AppSettings) {
  pendingChanges = { ...pendingChanges, ...changed };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const body = pendingChanges;
    pendingChanges = {};
    if (Object.keys(body).length === 0) return;
    fetch("/api/auth/app-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ appSettings: body }),
    }).catch(() => {
      // offline — local copy already saved; will sync on the next change
    });
  }, 600);
}
