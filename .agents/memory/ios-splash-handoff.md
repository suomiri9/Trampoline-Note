---
name: iOS PWA splash handoff
description: Making the native apple-touch-startup-image hand off seamlessly to the in-app animated splash on installed iOS PWAs
---

User-confirmed working (Jul 26, 2026) after two rounds of phone-only glitches. Durable lessons:

- **Viewport offset**: with `apple-mobile-web-app-status-bar-style: black`, the iOS standalone web viewport starts BELOW the status bar, but the static launch image is centered on the FULL screen. Viewport-centered content therefore sits statusBar/2 lower than the native image and visibly jumps at handoff — big on notched iPhones (~30pt bar), invisible on iPads (thin bar). Measure the bar as `screen.height − window.innerHeight` at mount and `translateY(-bar/2)` the splash content to land exactly on the static image. `env(safe-area-inset-top)` is 0 in this mode, so it can't be used.
- **Icon gap**: the live splash paints before `/icon-512.png` downloads → title with a blank hole where the icon was. Fix = `<link rel="preload" as="image" fetchpriority="high">` in the HTML head (fetch starts during parse, before the bundle runs) + hold the splash content `invisible` until the img is loaded (onLoad + callback-ref `el.complete` for the cached case + short safety timeout).
- **Entrance animation**: skip any fade-in entrance on iOS standalone only — the native image already shows the same content, so an opacity-from-0 entrance blanks it for a beat. Keep the loop animation (bounce) everywhere.
- iOS snapshots the launch image at add-to-home-screen time; users must delete + re-add the PWA icon to see regenerated launch images.
- **Frozen boot second**: even with a perfect handoff, a React-rendered splash can't animate until the bundle downloads and boots — cold launches (first launch after install) sit frozen on the static image ~1s. Fix = move the splash DOM into index.html (pure HTML + self-contained inline CSS + tiny inline script for the iOS tweaks above, incl. a 15s dead-man self-fade in case the bundle never boots); the React component renders null and only times the fade-out + `.remove()` of that node — same DOM the whole time, so no snap mid-bounce.

**How to apply:** the splash implementation is now the `#boot-splash` block in `client/index.html` (markup + inline style + inline script), NOT React markup — the iOS fixes above live in that inline script. Any change to the splash design must update the index.html block AND the generated launch images together, plus bump the sw.js CACHE version (the offline shell caches `/`). Any new pre-app overlay on iOS PWAs must account for the status-bar viewport offset.
