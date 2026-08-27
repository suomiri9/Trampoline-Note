import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The floating bottom nav+coach strip ([data-bottom-nav], z-[60]) paints above
// popover layers (z-50). Popper collision detection only avoids the viewport
// edge, so bottom-anchored dropdowns can end up with their tail hidden under
// the bar and unreachable by scrolling. Reserve the strip's zone (its height
// already includes the iOS safe area) as extra bottom collision padding.
export function bottomNavClearance(): number {
  if (typeof document === "undefined" || typeof window === "undefined") return 10;
  const nav = document.querySelector("[data-bottom-nav]");
  if (!nav) return 10;
  const top = nav.getBoundingClientRect().top;
  const h = window.innerHeight;
  if (!Number.isFinite(top) || top <= 0 || top >= h) return 10;
  return Math.max(10, Math.round(h - top) + 8);
}
