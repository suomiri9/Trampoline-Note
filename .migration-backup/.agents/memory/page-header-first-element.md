---
name: PageHeader must be the first element
description: Why content placed above the shared PageHeader gets visually covered, and the override.
---
The shared `PageHeader` is sticky AND uses `.page-header-safe`, which applies a large negative top margin (to cancel PageLayout's top padding + iOS safe area). It assumes it is the FIRST element on the page.

**Why:** A back button rendered above it (Comp Debuts page, July 2026) was pulled under the header band — looked like a sticky-overlap bug, but unsticking alone didn't fix it; the negative margin was the real cause.

**How to apply:** Either render PageHeader first (put back links inside/below it), or pass `className="static !mt-0"` to neutralize both stickiness and the negative margin.
