---
name: ResizeObserver loop error looks like a runtime crash
description: Why the preview reports "uncaught exception but not an error object" / vite overlay "(unknown runtime error)" and how it must be suppressed
---

**Rule:** The browser-generated "ResizeObserver loop completed with undelivered notifications" fires as a window `error` event with `e.error === undefined`. Dev tooling that treats every error event as a crash (the vite runtime-error-overlay plugin, the Replit preview log bridge) reports it as "uncaught exception but the error was not an error object" / "(unknown runtime error)". It is benign noise, not an app bug.

**Why:** Suppressing it from app code (main.tsx) does NOT work: listeners fire in registration order, and the vite overlay client script (injected into `<head>`) and the preview bridge register before any app module runs. `stopImmediatePropagation` from a later listener can't shield earlier ones. This also makes it un-debuggable from inside the page — instrumentation listeners registered last see nothing while the overlay still fires.

**How to apply:** Two-part fix lives in `client/index.html` as the FIRST script in `<head>` (a classic inline script executes during parse, before ANY module script):
1. Early capture listener that `stopImmediatePropagation`s ResizeObserver-loop error events (beats the vite overlay).
2. Patch `window.ResizeObserver` to coalesce and deliver callbacks via `requestAnimationFrame` so the browser never generates the notification at all (this is what silences the preview bridge, which registers via CDP before even inline scripts can be beaten).
Keep that script first in `<head>`; moving it below any module script breaks part 1.

Related hardening done at the same time: `offline-db.ts` `withStore` must never `reject(req.error)` bare (it's null on transaction abort), and main.tsx normalizes any remaining non-Error uncaught values/rejection reasons into logged real Errors.
