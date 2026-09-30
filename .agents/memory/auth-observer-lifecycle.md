---
name: Auth observer lifecycle
description: Preserve the observed session query during account transitions.
---

Do not remove the actively observed auth query when changing session identity; clear other account-scoped data separately.

**Why:** Removing and recreating a query does not reliably reconnect its mounted observers. Login can succeed on the server while the UI remains signed out until restart.

**How to apply:** For login, registration, and logout changes, verify that mounted observers receive the new identity without navigation or reload, including when older session reads finish late.