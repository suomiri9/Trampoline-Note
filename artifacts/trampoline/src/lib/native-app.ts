// Native touches for the iOS app (artifacts/ios-app), which loads this web
// app inside a Capacitor shell. Every helper is a no-op in a normal browser,
// so callers never need to check where they run.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNativeApp = Capacitor.isNativePlatform();

function run(fn: () => Promise<unknown>) {
  if (!isNativeApp) return;
  fn().catch(() => {
    // Haptics/status bar are cosmetic; never surface failures.
  });
}

export const haptics = {
  /** A light tap, e.g. picking a star rating. */
  tap: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** A selection tick, e.g. starting a drag. */
  select: () => run(() => Haptics.selectionChanged()),
  success: () => run(() => Haptics.notification({ type: NotificationType.Success })),
  error: () => run(() => Haptics.notification({ type: NotificationType.Error })),
};

/** Opens the iOS share sheet. Resolves false when not in the iOS app. */
export async function shareText(title: string, text: string): Promise<boolean> {
  if (!isNativeApp) return false;
  try {
    await Share.share({ title, text, dialogTitle: title });
  } catch {
    // Dismissing the share sheet rejects; that's not an error for the user.
  }
  return true;
}

/** Matches the status bar text color to the app theme. */
export function syncStatusBar(theme: "dark" | "light") {
  run(() => StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light }));
}
