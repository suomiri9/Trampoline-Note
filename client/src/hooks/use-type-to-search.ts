import { useEffect } from "react";

export function useTypeToSearch(
  enabled: boolean,
  open: boolean,
  setOpen: (b: boolean) => void,
  setSearch: (s: string) => void
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
      e.preventDefault();
      setSearch(e.key);
      setOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, open, setOpen, setSearch]);
}
