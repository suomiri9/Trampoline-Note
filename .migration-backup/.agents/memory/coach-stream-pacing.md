---
name: Coach chat stream pacing
description: Why the coach reply "types" via a client-side paced reveal, and why the SSE end-burst is upstream model behavior, not a transport bug
---

**Rule:** The coach chat's typing effect comes from a client-side paced typewriter in the coach chat component (deltas accumulate in a ref; a ~33ms interval drains them into display state at `max(2, backlog/25)` chars/tick, with a bounded catch-up wait before the mutation resolves). The SSE transport itself is fine.

**Why:** User reported "long thinking, then the whole sentence at once." Timestamped curl tests (local and through the dev-domain proxy, with `--compressed`) showed every delta landing within ~100ms after a long silence — the upstream model call thinks, then dumps all tokens in one burst. Server headers were already correct (`no-transform`, `X-Accel-Buffering: no`, flushHeaders).

**How to apply:**
- If the reply ever appears all-at-once again, check the pacing code first — do not re-debug transport/proxy/compression, and do not "simplify" the typewriter away as redundant with SSE.
- When testing streaming with curl, judge by **delta timestamps**, not by the presence of delta events.
- Test messages sent via dev auto-login land in the real demo user's chat history — delete the created rows afterwards (and never delete the user's own messages sitting next to them).
