import { useEffect, type RefObject } from "react";

/**
 * "Type anywhere to search": when enabled and the picker is closed, pressing
 * a printable character (outside of any other input) focuses the given
 * SearchPicker input. Focusing opens the popover and the pressed key lands
 * in the input natively, so no external search state is needed.
 */
export function useTypeToSearch(
  enabled: boolean,
  open: boolean,
  inputRef: RefObject<HTMLInputElement>,
) {
  useEffect(() => {
    if (!enabled || open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (!/[\w\-+]/.test(e.key)) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
      }
      const input = inputRef.current;
      if (!input || input.disabled) return;
      input.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, open, inputRef]);
}
