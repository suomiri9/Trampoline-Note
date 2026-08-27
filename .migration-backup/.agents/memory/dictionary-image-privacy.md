---
name: Dictionary image privacy
description: Privacy and lifecycle rules for generated dictionary illustrations.
---

Generated dictionary images use a draft → approval lifecycle. Drafts are admin-only, stored privately, omitted from athlete data, and served with `no-store`. Approved images are the only images athletes may receive, but their responses are also `no-store` because approval can be revoked and archiving changes who may see them.

**Why:** A server authorization check alone is insufficient when a protected image response is cached in a browser profile; a later non-admin user on the same device could otherwise receive the cached draft without reaching the server.

**How to apply:** Keep object keys server-side, serve images by dictionary entry ID through authenticated routes, re-check admin status from the database for every draft request and mutation, and delete superseded private objects after successful metadata transitions. Never put role-sensitive dictionary responses in the generic offline mirror; scope in-memory dictionary queries by user and role, and clear query/mutation caches at every authentication boundary.