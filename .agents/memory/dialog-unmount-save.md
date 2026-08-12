---
name: Save-on-close must survive host-page unmount
description: Editor dialogs rendered inside route pages lose drafts on bottom-nav navigation unless a mount-once cleanup flushes the save.
---

The rule: any dialog with save-on-close semantics that is rendered INSIDE a route page must flush its draft from a mount-once effect's **cleanup**, reading the latest state through refs (a `flushRef` reassigned every render + an `openRef` mirroring the open prop). A location-watcher effect is NOT enough.

**Why:** the bottom nav deliberately sits above dialog overlays (z-60 vs z-50), so users can navigate while an editor is open. That unmounts the host page and the dialog in one commit — React runs only cleanups for unmounting trees, so `useEffect` bodies watching `useLocation` never fire. A real training session was lost this way (draft destroyed, zero requests sent; confirmed via prod request logs + id-sequence check). NoteDialog got the fix (`flushDraftSave` + unmount cleanup).

**How to apply:** when adding/reviewing any page-hosted editor dialog (skills page dialogs, routine editors, etc.), check for the unmount path. Pattern: shared `flushDraftSave(): boolean` used by both `handleOpenChange` and the cleanup; `isSavingRef` guards double-saves (stays true after a started save; unmount before the close re-render leaves openRef=true but isSavingRef blocks). TanStack v5: hook-level `useMutation` options (network + offline enqueue + invalidation) still run after unmount; only per-`mutate` callbacks (toasts) are skipped — acceptable.

Note: a fresh draft that never triggered a save exists ONLY in editor memory — it is never in the offline queue or failed store, so there is nothing to recover after the fact.
