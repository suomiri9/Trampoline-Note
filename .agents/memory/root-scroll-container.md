---
name: "#root is the scroll container"
description: Scroll listeners/position logic must not use window.scrollY — html/body are locked; #root scrolls.
---

**Rule:** In this app `html, body { overflow: hidden }` (iOS viewport lock) and `#root` is the only scrolling element (`overflow-y: auto`). `window.scrollY` is always 0 and window `scroll` events never fire for page scrolling.

**Why:** A scroll-collapsing header shipped against `window` first — typecheck/build both pass, the feature just silently never triggers. Code review caught it; nothing at runtime errors.

**How to apply:** Any scroll-position feature (collapsing headers, scroll restoration, infinite scroll, "back to top") must bind to the real scroller — walk up from the component to the nearest `overflow-y: auto|scroll` ancestor (lands on `#root`) rather than hardcoding, and read `scrollTop`, not `scrollY`. Sticky elements still pin fine since they're inside #root.
