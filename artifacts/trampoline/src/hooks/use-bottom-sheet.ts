import { useEffect, useState } from "react";
import { useIsMobile } from "./use-mobile";

/** Live `prefers-reduced-motion: reduce` flag. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Presentation switch for simple modal flows (docs/apple-design-skill.md):
 * phones present them as a gesture-driven bottom sheet; desktop keeps the
 * centered dialog. Reduced-motion users also keep the centered dialog —
 * its enter/exit is a quick cross-fade (§14) instead of a sheet spring.
 */
export function useBottomSheet() {
  const isMobile = useIsMobile();
  const reducedMotion = usePrefersReducedMotion();
  return isMobile && !reducedMotion;
}
