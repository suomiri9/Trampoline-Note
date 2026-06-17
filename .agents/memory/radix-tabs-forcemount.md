---
name: Radix Tabs forceMount does not auto-hide
description: Keeping a portaled Dialog alive across tab switches with shadcn/Radix Tabs.Content.
---

When a controlled `Dialog` (or other portaled overlay) lives inside one `TabsContent` but its trigger/button lives outside the tabs (e.g. in a sticky `PageHeader`), switching to another tab unmounts the default `TabsContent` and the dialog silently does nothing when opened from the other tab.

Fix: give that tab `forceMount` AND `className="data-[state=inactive]:hidden"`.

**Why:** Radix `Tabs.Content` with `forceMount` sets `present` true always, so it renders `hidden: !present` = NOT hidden and `children: present && children` = always rendered. forceMount keeps it mounted but does NOT hide it when inactive — you must hide it yourself. It still emits `data-state="active|inactive"`, so `data-[state=inactive]:hidden` does the hiding. The dialog content portals to `document.body`, so it stays visible even while its parent panel is `display:none`.

**How to apply:** Only the tab that must stay mounted needs `forceMount` + `data-[state=inactive]:hidden`. Other tabs (e.g. a chart-only tab) can stay default so heavy content mounts lazily on selection. Used on the Score page Scores/Graph tabs.
