import { useSyncExternalStore } from "react";
import {
  getKeyboardInsetBottom,
  subscribeKeyboardInset,
} from "@/lib/keyboard-inset";

/**
 * Height (px) of the strip at the bottom of the layout viewport occluded by
 * the on-screen keyboard; 0 while it is closed. Re-renders on open/close and
 * on keyboard size changes (e.g. the QuickType bar toggling).
 */
export function useKeyboardInsetBottom(): number {
  return useSyncExternalStore(
    subscribeKeyboardInset,
    getKeyboardInsetBottom,
    () => 0,
  );
}
