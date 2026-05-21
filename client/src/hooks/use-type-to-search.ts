import { useEffect, useRef } from "react";

export function useTypeToSearch(
  enabled: boolean,
  open: boolean,
  setOpen: (b: boolean) => void,
  setSearch: (s: string) => void
) {
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setSearch("");
    }
    prevOpenRef.current = open;
  }, [open, setSearch]);
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
      e.preventDefault();
      const key = e.key;
      setSearch(key);
      setOpen(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('[cmdk-input]:not([data-hidden])');
          if (input && document.activeElement === input) {
            const len = input.value.length;
            try { input.setSelectionRange(len, len); } catch {}
          }
        });
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, open, setOpen, setSearch]);
}
