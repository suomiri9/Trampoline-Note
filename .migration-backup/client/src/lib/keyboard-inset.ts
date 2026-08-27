/**
 * On-screen keyboard tracking (iOS/iPadOS PWA + Android with
 * interactive-widget=overlays-content).
 *
 * The layout viewport does NOT shrink when the virtual keyboard opens, so
 * fixed overlays centered/anchored against it can sit partly or entirely
 * behind the keyboard. (App.tsx additionally restores Safari's focus
 * auto-scroll to keep the page from jumping — which also defeats the pan
 * that would have revealed a hidden dialog.) This module measures the
 * visible strip via the VisualViewport API and publishes it as:
 *
 *  - CSS vars on <html>: --kb-vvh (visible strip height), --kb-off (its top
 *    offset) and --kb-inset-b (occluded strip at the bottom of the layout
 *    viewport);
 *  - html[data-kb-open] while a docked keyboard is up (bottom occlusion
 *    above the threshold at ~1x zoom);
 *  - a subscribable store for React (hooks/use-keyboard-inset.ts).
 *
 * index.css uses these to re-center [data-kb-aware] overlays (ui/dialog.tsx)
 * inside the visible strip and cap their height; bottom-sheet-style phone
 * dialogs opt out with data-kb-anchor="bottom" and ride up on --kb-inset-b
 * at their call sites. Revealing the focused field happens here too, but
 * ONLY by scrolling inside the overlay's own scroll containers — window/#root
 * scrolling stays owned by App.tsx's anti-jump logic.
 */

const KB_MIN_PX = 80; // smaller bottom gaps are browser chrome, not a keyboard

let started = false;
let kbOpen = false;
let insetBottom = 0;
const listeners = new Set<() => void>();

/** Occluded strip (px) at the bottom of the layout viewport; 0 when closed. */
export function getKeyboardInsetBottom(): number {
  return kbOpen ? insetBottom : 0;
}

export function subscribeKeyboardInset(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit() {
  listeners.forEach((cb) => cb());
}

function isEditable(el: Element | null): el is HTMLElement {
  return (
    !!el &&
    (el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable))
  );
}

/**
 * Bring `el` into view inside its keyboard-aware overlay by scrolling the
 * overlay's own scroll containers only (never the page scroller).
 */
function revealInOverlay(el: HTMLElement) {
  const overlay = el.closest<HTMLElement>("[data-kb-aware]");
  if (!overlay) return;
  const pad = 12;
  let node: HTMLElement | null = el.parentElement;
  while (node && overlay.contains(node)) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        const nodeRect = node.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > nodeRect.bottom - pad) {
          node.scrollTop += elRect.bottom - (nodeRect.bottom - pad);
        } else if (elRect.top < nodeRect.top + pad) {
          node.scrollTop -= nodeRect.top + pad - elRect.top;
        }
      }
    }
    if (node === overlay) break;
    node = node.parentElement;
  }
}

function setVars(open: boolean, vvh: number, off: number, bottom: number) {
  const root = document.documentElement;
  if (open) {
    root.style.setProperty("--kb-vvh", `${vvh}px`);
    root.style.setProperty("--kb-off", `${off}px`);
    root.style.setProperty("--kb-inset-b", `${bottom}px`);
    root.setAttribute("data-kb-open", "");
  } else {
    root.style.removeProperty("--kb-vvh");
    root.style.removeProperty("--kb-off");
    root.style.removeProperty("--kb-inset-b");
    root.removeAttribute("data-kb-open");
  }
}

function measure() {
  const vv = window.visualViewport;
  if (!vv) return;
  // Pinch zoom also shrinks the visual viewport — that is not a keyboard.
  const zoomed = Math.abs(vv.scale - 1) > 0.02;
  const off = Math.max(0, Math.round(vv.offsetTop));
  const vvh = Math.round(vv.height);
  const bottom = Math.max(
    0,
    Math.round(window.innerHeight - vv.height - vv.offsetTop),
  );
  const open = !zoomed && bottom > KB_MIN_PX;

  setVars(open, vvh, off, bottom);
  const changed = open !== kbOpen || (open && bottom !== insetBottom);
  kbOpen = open;
  insetBottom = open ? bottom : 0;
  if (changed) emit();

  if (open && isEditable(document.activeElement)) {
    revealInOverlay(document.activeElement as HTMLElement);
  }
}

/** Idempotent; called once at boot (main.tsx). Listeners live for the app. */
export function startKeyboardInsetTracker() {
  if (started || typeof window === "undefined") return;
  started = true;
  const vv = window.visualViewport;
  if (!vv) return;

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  // Field-to-field focus moves while the keyboard is already up fire no
  // visualViewport resize — reveal the newly focused field after it settles.
  document.addEventListener(
    "focusin",
    () => {
      if (!kbOpen) return;
      window.setTimeout(() => {
        if (kbOpen && isEditable(document.activeElement)) {
          revealInOverlay(document.activeElement as HTMLElement);
        }
      }, 120);
    },
    true,
  );
  schedule();
}
