# Trampoline Training Log

A full-stack trampoline training note app built with React, Express, Drizzle ORM, and PostgreSQL.

## Contents

- [Architecture](#architecture)
- [Key Files](#key-files)
- [Data Model](#data-model)
- [Auth](#auth)
- [Design System (Dark Monospace)](#design-system-dark-monospace)
- [Components & Interaction Patterns](#components--interaction-patterns)
- [Pages](#pages)
- [Mobile / Touch Handling](#mobile--touch-handling)
- [Offline Mode (PWA + sync queue)](#offline-mode-pwa--sync-queue)
- [Running](#running)
- [User Preferences](#user-preferences)

## Architecture

- **Frontend**: React + Vite + TypeScript, Shadcn UI, TanStack Query, Wouter routing, Recharts
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Custom email/password authentication with bcrypt, express-session with PostgreSQL session store

## Key Files

- `shared/schema.ts` — Drizzle table definitions + Zod schemas
- `shared/models/auth.ts` — Users and sessions table definitions
- `server/auth.ts` — Authentication setup (register, login, logout, session middleware)
- `server/storage.ts` — Data access layer (all methods scoped by userId)
- `server/routes.ts` — API route handlers
- `server/index.ts` — Express app setup
- `client/src/App.tsx` — Router + auth gate + navigation
- `client/src/hooks/use-auth.ts` — Auth state hook (login, register, logout mutations)
- `client/src/pages/login.tsx` — Login/register form

## Data Model

Drizzle tables (see `shared/schema.ts`; auth tables in `shared/models/auth.ts`). Every domain table is scoped per user.

- `users` — User profiles with hashed passwords (email/password auth).
- `sessions` — Express session store.
- `notes` — Training sessions (per user).
- `skills` — Skills/drills/frequent connections (per user). **Shape grouping (skills AND drills)**: a skill OR a drill can have shape variants (tuck/pike/straight) — each variant is its OWN `skills` row (preserving its notes/history/DD) linked to the base via `parentSkillId` (nullable int) with a `shape` label (nullable text). A base's shape children always share the base's `isDrill` (skill→skill shapes, drill→drill shapes); the Shapes editor is the shared `client/src/components/shape-drafts-editor.tsx` (`ShapeDraftsEditor`/`SHAPE_OPTIONS`/`ShapeDraft`), reused by the Skills-tab skill & drill forms and by the Training note-dialog quick-add (New Skill + New Drill). New cols default null so legacy rows need no migration. **When a base has shapes it is a PURE GROUPING — no DD of its own, not directly loggable**; all DD lives in the explicit shape children (it is NOT "the implicit first shape"). In the add/edit form the base "Difficulty" field is shown ONLY while there are no shape drafts (`isEditingShape || shapeDrafts.length === 0`); adding a shape hides it and DD is entered per-shape. On save, if any non-empty shape draft exists the base's own `difficulty` is forced to `0` (`hasRealShapes`, applied in `onSkillSubmit`, `onDrillSubmit`, AND the note-dialog quick-add save). In the skills library, the base row's DD cell shows the children-only **"N shapes" badge** instead of a DD value when it has shapes (`hasShapes ? <Badge>{shapes.length} shapes</Badge> : skill.difficulty.toFixed(1)`, `shapes.length`, no `+1`) — the badge lives in the right-aligned DD column (NOT next to the name); each shape row shows its own DD. **Shape Code is a dropdown** (`SHAPE_OPTIONS`: `o`=Tuck, `<`=Pike, `/`=Straight) in both the Shapes section and the Assign-as-shape dialog; selecting a shape sets the shape row's `code` + `shape` but does NOT auto-fill the name (the user types the shape name, e.g. `T`, themselves). Base form placeholders: Name `Bs`, Code `4-`. Skills library nests shape rows under their base (`skills.tsx`, top-level list filters `parentSkillId == null`, `shapesOf(parentId)` resolves children) as a COLLAPSIBLE accordion: a base with shapes shows a Chevron (`ChevronRight`/`ChevronDown`) in its code cell and clicking the base row toggles its children (`expandedBases` Set + `toggleExpanded`), default COLLAPSED; non-parent rows have a width spacer in place of the chevron for code alignment. **A base with shapes has NO detail page** — clicking it toggles expand instead of navigating, and `skill-detail.tsx` redirects a parent to `/skills` (effect + early `return null`) and excludes parents from its prev/next swipe order (`parentIds` Set); only non-parent skills and the individual shape children navigate to a detail page. `hasShapes`/`parentIds`/`shapesOf` all count NON-archived children only. Deleting/archiving a base cascades to children server-side (`storage.ts` `deleteSkill`/`updateSkill`). **Server-side link guard**: `storage.assertValidParent` (called by `createSkill`/`updateSkill`) rejects bad `parentSkillId` links with a `SkillLinkError`→400 (signature `assertValidParent(userId, parentSkillId, childIsDrill, selfId?)`: no self-parent, parent must be a top-level base of the SAME kind as the child — `parent.isDrill === childIsDrill`, so a skill can't nest under a drill base or vice-versa — no nesting under a shape, and a row that already owns shapes can't become a shape; `updateSkill` also rejects changing `isDrill` on a base that owns children). The Assign-as-shape dialog's base list is filtered to the same `isDrill` as the target. Existing skills are groupable via "Assign as shape" / "Detach" (relink only — `updateSkill` sets/clears `parentSkillId`+`shape`, never recreates the row). **EVERY skill picker is FLAT-without-parent**: it lists shape children (as separate selectable rows, shown with combined codes via `skillDisplayCode`) + non-shape skills, but NEVER the parent grouping base (a base with shapes is a pure grouping, not loggable). Two shared helpers in `client/src/lib/training-utils.ts` enforce this: `skillHasShapeChildren(skillId, allSkills)` (true when the id owns ≥1 non-archived shape child) and `pickableSkills(allSkills, isDrill)` (returns children + non-shape skills of that `isDrill`, excluding parents; unsorted). Used by the Training note-dialog main picker (Skills + Drills groups), its conn & routine quick-add pickers, the Skills-page Connections builder, the Routines builder, and (via `skillHasShapeChildren` on `availableSkills`) `skill-editor-overlay.tsx`. Recent-skill rows in those builders also resolve through `pickableSkills(...).find(...)` so a stale/legacy parent id never surfaces. The OLD two-step in-popover shape chooser (`shapePickerBase`, "`${base.code} — pick shape`") is REMOVED — picking is now a single flat tap. **Combined CODE, independent NAME**: a shape's CODE is shown combined as `baseCode+shapeCode` (e.g. `8--`+`<`=`8--<`, pure concatenation, NO separator) wherever a code appears, via `skillDisplayCode(skill, allSkills)` (resolves the base through `parentSkillId`, falls back to own code for non-shapes/missing parent). The NAME is INDEPENDENT — a shape shows ONLY its OWN name (e.g. `T`, the user-typed shape name), NOT `baseName+shapeName` — via `skillDisplayName(skill)` which now simply returns `skill.name` (parent name is NOT prefixed; the `allSkills` arg is kept for signature compatibility but unused). Both live in `client/src/lib/training-utils.ts`. Applied in `note-card.tsx`, `note-dialog.tsx` (skill/conn/routine pickers + recents + chips + practice-list code & name + group chips + routine-part preview), `skill-detail.tsx`, `routine-detail.tsx`, `routines.tsx`, `skill-editor-overlay.tsx`, `points-to-fix.tsx`, AND the Skills library nested shape rows (`skills.tsx`, via `skillDisplayCode`/`skillDisplayName(shape, allItems)`). (The former shape-chooser-heading exception is gone with the two-step picker.) Offline create remaps a shape's `parentSkillId` via the sync idMap (`offline-queue.ts` `remapBody`). **Duplicate / change as a different shape**: shared helpers in `training-utils.ts` (`isShapeableSkill`, `swapSkillIdToShape`, `swapSkillIdsToShape`, `shapeSwapInfo`) resolve each shapeable skill (one with a `parentSkillId`) to its sibling variant carrying a target shape (sibling matched on `shape ?? code`, non-archived); non-shapeable skills pass through unchanged and a shapeable skill missing a shape is reported as `missing`. The reusable `client/src/components/shape-swap-picker.tsx` `ShapeSwapPicker` (a small `Dialog` built from `SHAPE_OPTIONS`) lists Tuck/Pike/Straight, disabling any shape not present on every shapeable skill and warning with the missing skills' display codes. Used in three places: the Practice List `⋮` menu adds **"Duplicate w/ shape"** for single skills and inline `+`-connections only (groups of plain skills — `canShapeSwapGroup` requires all `id > 0` and ≥1 shapeable, excludes routine/conn ids `-2`/`-3`), inserting a shape-swapped copy below the original (`duplicateGroupWithShape`); BOTH connection builders (note-dialog "Add New Connection" quick-add and the Skills-page Connections builder) get a **"Change shape"** button that swaps the current build-sequence ids in place (no new connection created), shown only when the sequence has a shapeable skill. Swaps resolve to real existing sibling ids so DD recompute and offline id-remap keep working.
- `routines` — 10-skill routines (per user). `createdAt` (timestamp, `defaultNow`) records when each routine was made. The Routines card shows a `dd-mm-yyyy` mono label beside the routine name that is the routine's **first practiced date** (earliest training note whose parsed `skills` contain a routine item `id === -2` with that `routineId`) — computed client-side in `routines.tsx` via `firstPracticedByRoutine`; the label is hidden until the routine has been practiced at least once (it is NOT `createdAt`).
- `scores` — Competition/practice scores with E/D/H/T fields (per user). `competitionId` (text, nullable) + `round` (text, nullable: `"prelims"`/`"final"`) group multiple rounds of one competition into a single card; null for practice/trial and legacy competition rows.

## Auth

Custom email/password authentication. All API routes are protected with `isAuthenticated` middleware. Data is filtered by `userId` (from session). The frontend shows a login/register form when unauthenticated. Demo user (id `55504735`) has email `suomi.ri.9@gmail.com` and password `tramplog2026`.

## Design System (Dark Monospace)

Near-black dark theme is the default baseline (`<html class="dark">` in `client/index.html`; theme-color `#0a0b10`). There is no light/dark toggle.

### Fonts

Three families only. CSS vars and helpers live in `client/src/index.css`; all three load via a single Google Fonts `<link>` in `client/index.html` — ONLY these three, no other families, no `@import` in CSS.

- `--font-display` (**Bebas Neue**, tall condensed all-caps) — page titles, big number figures, score displays.
- `--font-body` / `--font-sans` (**DM Sans**) — body, buttons, labels, general UI.
- `--font-mono` (**JetBrains Mono**) — codes, stats, timestamps, eyebrows, small metadata.
- Base `h1–h6` use DM Sans; Bebas is applied deliberately via `.page-title` and the `font-display` utility.
- Bebas ships a SINGLE weight → display elements must use `font-normal` to avoid faux-bold. Never add `font-semibold`/`font-bold` to a Bebas element.
- **Popup/dialog titles use the display style**: the shared `DialogTitle` (`client/src/components/ui/dialog.tsx`) and `AlertDialogTitle` (`client/src/components/ui/alert-dialog.tsx`) base components apply `page-title text-2xl` (Bebas, uppercase, `font-normal`) so EVERY popup title matches the page headers — do not add `font-semibold`/`font-bold` overrides. The main Training note-dialog title overrides size only (`text-3xl`).

### Numeric size rule (strict)

- **BIG figures** use `font-display` (Bebas, `font-normal`): page stat numbers, score/DD totals, personal best, the routine-builder total.
- **SMALL numbers** use `font-mono` (JetBrains Mono): skill/routine DD values, table cells, breakdown E/DD/H/TOF, connection/part builder totals, skill-chip DDs, the detail-page `StatCard` values in `skill-detail.tsx`/`routine-detail.tsx` (Total Sessions/Reps, Full Runs, Attempts, First/Last Practiced), and the "Session History" entry dates on those detail pages.
- **Numeric/timestamp data-entry fields** also use `font-mono`: date-picker buttons, the shared `TimeField` (`client/src/components/time-field.tsx`), the score/rank number `Input`s, and the `/100` suffix.
- DM Sans (the rounded look) is NEVER used for numeric values.
- Note: some inline DD values inherit `font-mono` from an ancestor `<p className="font-mono">` rather than carrying the class themselves.

### CSS helpers (`client/src/index.css`)

- `.eyebrow` — mono uppercase label (pure text styling, no display change).
- `.page-title` + `.title-accent` — large uppercase title with blue/indigo last word.
- `.card-3d` — flat dark surface + thin border. `.glass-surface`.
- `.btn-3d` — glowing solid-blue primary. `.btn-gold` — outlined amber/gold. `.bg-mesh`.

### Eyebrow `//` convention

- The `// ` prefix is added by `PageHeader` itself (`// {eyebrow}`).
- Standalone in-card/section eyebrows use the `.eyebrow` class with NO literal `// ` — never hardcode `// ` in page/section markup.
- `.eyebrow` is safe on `<th>` (used for table column headers on Skills).

### Cards, nav, and charts

- **Cards**: flat dark with a colored left accent bar (`<span absolute left-0 w-1 bg-primary>`) and a large Bebas accent figure (e.g. TOTAL DD on note cards, totals on stats).
- **Bottom nav (`Navigation` in `client/src/App.tsx`)**: each tab has its own color — Training=blue, Score=yellow, Progress=green, Skills=red, Routines=purple (Settings stays neutral). Inactive tabs show a LIGHT tint of their color (`lightColor`, e.g. `text-blue-400/45`, inherited by both icon and label); the active tab shows the full REAL color — colored icon + matching tinted background + colored label. Color classes are literal Tailwind strings per `navItem` so JIT picks them up.
- **Charts**: Recharts colors use theme CSS vars (`hsl(var(--primary))`, `hsl(var(--border))`, etc.) so the chart fits the dark theme.

## Components & Interaction Patterns

### `PageHeader` (`client/src/components/page-header.tsx`)

Centralizes page titles.

- **Props**: `eyebrow`, `title`, `accent` (trailing portion of `title`, highlighted — defaults to last word; `accent` is stripped from the lead, so pass the FULL title), `subtitle`, `actions`. Also exports `primaryActionClass` (blue glow button) and `goldActionClass` (gold outline).
- **Sticky on every tab**: the header root is `sticky top-0 z-30` with `bg-background/90 backdrop-blur-md border-b`, so it stays pinned while content scrolls under it. The real scroll container is `#root`, not the window (`html,body` are `position:fixed;overflow:hidden`).
- **Negative-margin contract**: spans the full container width via negative margins that MUST mirror the page container's padding breakpoint-for-breakpoint — `-mx-4 sm:-mx-6 lg:-mx-8` cancels `px-4 sm:px-6 lg:px-8`, and `-mt-6 md:-mt-8 pt-6 md:pt-8` cancels/re-adds the `py-6 md:py-8` top padding (used by `PageLayout` and the `skills.tsx` inline root). If you change `PageLayout`'s padding, update these in lockstep.
- **z-index**: z-30 sits below the bottom nav (z-40) and dialogs (z-50).
- Detail pages (`skill-detail`/`routine-detail`) don't use `PageHeader` and keep natural scroll.
- **`--page-header-h` contract**: `PageHeader` measures its own rendered height with a `ResizeObserver` and publishes it as a CSS custom property on `documentElement` (`--page-header-h`) so sticky sub-bars can pin directly beneath it regardless of breakpoint (the header is much taller when it stacks on mobile). The Skills tab bar consumes it — its `TabsList` is wrapped in a full-width sticky sub-bar (`sticky z-20`, same negative-margin/blur/border treatment as the header) with `style={{ top: "var(--page-header-h, 96px)" }}`, so it sits flush under the header while content scrolls below both. z-20 sits below the header (z-30). If you change the header markup/padding or add another sticky sub-bar, keep this publish/consume pairing intact.

### On-demand builders (modal dialogs)

- **General rule**: every "Add …"/"New …"/Edit form opens as a centered modal `Dialog` popup (shadcn `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`), NOT an inline panel. Applies to all four Skills tabs (skills/drills/connections/parts), the Routines builder, the Score add/edit form, AND the Training note-dialog's quick-add "+" `DropdownMenu` (New Skill, New Drill, New Connection, New Routine, New Routine Part).
- **Nested quick-add builders**: the five quick-add builders are NESTED Radix `Dialog`s rendered inside `note-dialog.tsx` (itself a `Dialog`) — each is `<Dialog open={showNewSkill|showNewConn|showNewRoutine}>` (always mounted) or, for the part builder, gated by its `{showNewPart && (() => {…})()}` IIFE; `onOpenChange` resets only the part draft and closes the others. They drop the old "Switch to…" links and manual X (DialogContent's own X/Escape/overlay close them) and visually mirror the Skills/Routines builders (default-size Inputs, `sm:max-w-md`, min-h chip box with "No skills added yet", Recent row via `globalRecentSkillIds`/`addRecentSkill`, Bebas Total Difficulty/Total DD figure). The note-dialog quick-add keeps a LENIENT routine save (≥1 skill, not exactly 10) and the existing chip-DnD ids (`nc-${i}` connection, `nr-${i}` routine).
- **Picker container**: nested quick-add pickers must NOT pass `container={dialogBodyRef.current}` (so the popover portals to body above the nested dialog) — only the main note skill picker keeps that container.
- **Open flags**: the blue `primaryActionClass` header button (or Edit) sets the open flag (`showForm`/`editingSkill` on Skills, `showBuilder`/`editingRoutine` on Routines, `isAdding`/`editingScore` on Score); the dialog's `onOpenChange` closes it via the page's cancel handler (Escape, overlay click, and the built-in DialogContent X all close it).
- **Draft preservation**: closing a *new* (Add) builder does NOT reset its inputs — for the four Skills tabs and the Routines builder the entered draft (RHF form values, `connName`/`connSkillIds`, `partRoutineId`, routine `name`/`selectedSkillIds`) is preserved so reopening shows the same thing; inputs are only cleared after a successful save or when closing an *edit* (discarding unsaved changes). Accordingly `openBuilder`/the header Add button must NOT reset, and `cancelEditing` only resets when `editingSkill`/`editingRoutine` is set. (Score add/edit is unchanged and still resets on close.)
- **Layout/widths**: because the dialog portals out of the layout, the library/list always spans full width (`md:col-span-3`). DialogContent widths — Skills/Routines `sm:max-w-md`, Score `sm:max-w-2xl`, all with `max-h-[90vh] overflow-y-auto`.
- **Routines builder (chips)**: mirrors the Skills→Connections builder — picked skills render as compact wrap CHIPS (`SortableChip` + `rectSortingStrategy` + `useLongPressDndSensors`, ids `slot-${i}` so `handleDragEnd` is unchanged) inside a `min-h-[80px] bg-muted/30 flex-wrap` box with a "No skills added yet" empty state, plus a "Recent" quick-add row (`useRecentSkills`/`addRecentSkill`, shared localStorage key `recent-conn-skills`) above it. The old numbered 1–10 vertical slot list and `SortableFilledSlot` are gone. The 10-skill cap is kept (picker disabled at 10; Recent buttons disabled at 10; the `/10` counter turns red).
- **Header buttons**: all header add buttons use the UNMODIFIED `primaryActionClass` (h-12 px-6, Plus icon `w-5 h-5`) so every primary add button is the same size — do not add `h-10`/`text-sm` size overrides. Secondary header toggles (e.g. Archived) match the height with `h-12 rounded-xl`.
- **In-note skill editors (`SkillEditorOverlay`)**: the note-dialog's Edit Connection (`editingConnIndices`) and Edit Routine/Connection (`editingRoutineIdx`) editors are NOT full-cover overlays — each renders as a CENTERED popup: a dimmed/blurred backdrop (`absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm`) holding a `max-w-md max-h-full` card (`flex flex-col … rounded-2xl border shadow-xl`). The backdrop click closes the editor only when the click target IS the backdrop itself (`if (e.target === e.currentTarget)`), so a dnd drag released over the backdrop doesn't close it; the card stops propagation. `SkillEditorOverlay` keeps its own header (title + default "Done" button via `closeVariant="button"`) and the inner list scrolls (`flex-1 min-h-0`). The Score page's two `SkillEditorOverlay` usages are different — they DO cover their card section (`absolute inset-0`) and use `closeVariant="icon"`.
- **Editing a MIXED connection** (an inline `+`-joined group that mixes plain skills with a routine `id -2` / connection-or-part `id -3`): tapping the skill area opens the "Edit Connection" (`editingConnIndices`) popup whenever the group has ≥1 plain skill (the wrapper gate is `group.items.some(plain)`, NOT `every`); tapping a routine/conn CHIP opens ITS own editor (`editingRoutineIdx`) and `e.stopPropagation()`s so it doesn't also fire the wrapper. The connection editor only edits plain skills but PRESERVES the routine/conn members: on save they are re-appended AFTER the edited skills (so a middle routine moves to the end) and the editing index range is reset to `length skills + preserved`.
- **Reps is a group-wide property** — it must be written to EVERY member of a group (this is what `updateReps` does), because `calculateTotalDD` sets `currentGroupReps = item.reps || 1` per item so the LAST member's reps wins; putting reps only on the first member silently drops the multiplier. `note` stays on the first member only.

## Pages

### 1. Training (`/`)

- Log sessions with date, time, skills/drills, routines, notes, star rating.
- **Star rating placement**: in the add/edit dialog it sits inline to the RIGHT of the start→end time row; on the training-log card (Home) it sits INLINE on the same row as the date/time line, rendered small (`StarRating size="sm"` — 10px stars to match the 10px mono date/time text).
- **"Recent" quick-add row (add-only and persistent)**: backed by a separate localStorage store (`recent-note-entries`, max 8, `addRecentEntry`/`useRecentEntries` in `use-recent-skills.ts`) that holds mixed entries (`kind` skill | routine | fc). `addSkill`/`addRoutine` push to it on every add; deleting an item from the Practice List does NOT remove it from Recent (the prior behavior derived Recent solely from `selectedSkills`, so deletions wiped it). `recentEntries` merges the persisted store (front, most-recent-first) with the current `selectedSkills`-derived entries (so editing an old note still surfaces its skills), deduped and filtered to items that still exist, capped at 8. Distinct from the builder rows' `recent-conn-skills` (skills-only) store.

### 2. Score (`/score`)

- Track E/D/H/T scores per routine; supports Set/Vol/both, practice or competition, partial attempts.
- **Overall (top) score per row** = `effectiveTotal(score)` (module-level helper): `vol_vol` shows the HIGHER of the two voluntary totals (`Math.max(total, totalVol)`), `both` SUMS set+vol, single set/vol shows its one total. Used for the big Bebas card figure in `ScoreCard` + `RoundBlock`. The `ScoreGroups` breakdown still lists each routine's sub-total (VOL 1 / VOL 2 or SET / VOL) separately. The eyebrow UNDER the big `RoundBlock` figure always reads "Score" (regardless of category).
- **Competition Personal Best card** (amber, top of page; eyebrow "Competition Personal Best") is computed from COMPETITION rows ONLY (`type === "competition"` — trials/practice excluded) and is split into TWO per-routine columns (`grid-cols-1 sm:grid-cols-2`), NOT one overall total. Each column = a big amber Bebas score (`text-5xl sm:text-6xl`) + a mono breakdown beneath: **Set** shows Score + E/H/TOF (DD intentionally OMITTED — the set routine has no DD of its own); **Vol** shows Score + E/DD/H/TOF. Every value is the MAX across comp rows via the `pb` reducer `{ set:{score,e,h,tof}, vol:{score,e,dd,h,tof} }`. Field-mapping caveat: single `vol` AND BOTH routines of `vol_vol` store voluntary stats in the PRIMARY/set fields (`execution`/`difficulty`/`horizontal`/`timeOfFlight`/`total`), so they feed the VOL bests; only `set`/`both` rows feed the SET bests, and `both`'s vol stats come from the `*Vol` fields. E uses `effectiveE`. Score figures show "—" when 0. The whole card is hidden when there are no competition scores (`hasComps`).
- **Competition rounds**: a competition shows as ONE amber `CompetitionCard` that holds multiple rounds (Prelims + Final). Each round is its own `scores` row, grouped by a client-generated `competitionId` plus a `round` field (`"prelims"`/`"final"`), and keeps full E/D/H/T scores AND its own rank.
- **Card rank**: the card renders ONE rank as a `font-display` Bebas amber `#N` figure at `text-[2rem] sm:text-[2.5rem]` (2/3 of the round-total size) — the FINAL round's rank if a final exists, otherwise the prelims/single round's rank (label "Final Rank" vs "Rank"), via `bigRankRound = finalRound ?? prelimsRound`; that round's own small rank is hidden so it isn't shown twice (`hideRank` keys off `bigRankRound.id`, not `round === "final"`). A competition with only prelims is therefore a complete, first-class state — there is NO mandatory final and NO prominent full-width "Add Final" button.
- **Actions**: per-round Edit/Delete live in each `RoundBlock`'s dropdown; adding a final is OPTIONAL via the card-level dropdown ("Add final round", shown only until a final exists), which also offers "Delete competition" (deletes every round id via `deleteCompMutation`).
- **Add/edit dialog**: shows a Round select + dynamic "Prelims/Final Rank" label when type=competition OR trial; the submit handler normalizes (mints `competitionId` via `newCompetitionId()` — `crypto.randomUUID()` with a `comp_<ts>_<rand>` fallback — and defaults `round="prelims"` for competitions AND trials, nulls both for practice). `startAddFinal(prelims)` is async: it preserves `prelims.type` (a trial's final stays a trial), backfills a LEGACY prelims row's missing `competitionId` via `apiRequest PUT` FIRST and is fail-closed (on PUT failure it toasts and aborts so the final can't orphan into its own group), then prefills the dialog with the prelims' date/name/competitionId and `round="final"`.
- **Legacy/standalone**: competition rows with no `competitionId` (and trial/practice rows) render as standalone `ScoreCard`s. Grouping/sorting is done in the `renderItems` useMemo (comp groups vs singles, date desc; rounds prelims→final). The Personal Best card/Progress stats are unaffected since each round total is per-row.
- **Trials group rounds exactly like competitions (red instead of amber)**: a `trial` now supports Prelims/Final rounds grouped by `competitionId` and renders through the SAME `CompetitionCard` (passed `variant="trial"`), visually IDENTICAL to a competition but red (`COMP_THEME`/`variant` keys the color set — `bar`/`accent`/`accentSoft`/`accentEyebrow`/`badge`). Per-round Edit/Delete live in each `RoundBlock` dropdown (always shown); the card-level dropdown offers "Add final round" (until a final exists) + "Delete trial". `renderItems` groups BOTH `competition` and `trial` rows that carry a `competitionId`; the card `variant`/testId derive from `rounds[0].type`. Legacy single trials with no `competitionId` still render via `CompetitionCard variant="trial"` with one round.
- **Score form fields**: competition shows "Competition Name", trial shows "Name"; BOTH show a Round select + dynamic Prelims/Final Rank. Practice shows none. The submit handler nulls `round`/`competitionId`/`competitionName`/`rank` for practice. The multi-round delete confirm is generic ("Delete this entry?") since it covers both comps and trials.
- **Split Execution (E1 + E2, with ×2)**: the single E input is split into TWO execution-judge inputs that SUM — `execution` (E1) + `executionTwo` (E2) — with a `×2` toggle (`doubleExecution`) that doubles the first judge (combined E = `E1 × 2`; the second input is disabled and mirrors E1 when active). The vol block has its own pair (`executionVol`/`executionTwoVol`/`doubleExecutionVol`). The combined value used for both the stored `total` and the `ScoreGroups`/`ScoreBreakdown` "E" cell comes from the module-level `effectiveE(e, eTwo, dbl)` helper (`dbl ? e*2 : e + (eTwo ?? 0)`); the total auto-calc `useEffect` uses it too. Backward-compatible: legacy rows have `executionTwo` null + `doubleExecution` false → `effectiveE` returns the old single E, so no data migration was needed.
- **`ScoreCard` color themes** (only the non-comp/non-trial path now: practice, legacy standalone comps, and offline-pending rows): competition = amber, trial = red (`text-red-400`/`bg-red-500`, badge under the name, right-side pill suppressed), practice = primary/blue. Live trials no longer use `ScoreCard` — only offline-pending trials fall back to it.
- **Routine name pill beside the group label**: in the `ScoreGroups` breakdown, each sub-block's header row shows the group label (`SET` / `VOL` / `VOL 1` / `VOL 2`) with the routine NAME the user did right BESIDE it (`flex gap-2`, label `shrink-0`), looked up from the `routines` list by `score.routineId` (group 1) / `score.routineIdVol` (group 2). The name renders as a bordered rounded PILL (`inline-block rounded-lg border px-2 py-0.5 font-mono text-[11px] text-muted-foreground`, `max-w-full truncate`) and appends the routine's **first-practiced month** as `(MMM yyyy-)` (trailing dash = "since"), e.g. `Vol (Feb 2026-)`. First-practiced is computed in `ScorePage` as `firstPracticedByRoutine` (a `Map<routineId, earliest note.date>`, same logic as `routines.tsx`: `useNotes` + `parseNoteSkills`, items with `id === -2` and numeric `routineId`, min `note.date`), formatted by the module-level `formatMonthYear` (string-split, no `Date()` → timezone-safe). The pill shows name-only when the routine has never been practiced, and the whole pill is omitted when the routine id is null (custom/legacy rows). Both `routines` and `firstPracticedByRoutine` are threaded through `ScoreCard`/`CompetitionCard`→`RoundBlock`→`ScoreGroups`→`ScoreBreakdown` (`routineName` prop carries the composed string). The group-1 label ALWAYS renders now (previously only `both`/`vol_vol` multi rows showed it, so single practice `set`/`vol` rows had NO label) — `group1Label` is `SET` for set/both, `VOL` for single vol, `VOL 1` for vol_vol. The big Bebas total figure remains the card's primary anchor.

### 3. Progress (`/stats`)

- Line chart of total daily DD over time.
- **Stat cards** (Sessions, Total DD, Avg DD, Best DD) are scoped to the chart's currently selected range + offset (week/month/year/all), not all-time; a scope row above the cards shows the period title + date range with the hint "Totals reflect the selected range". `periodTitle` is offset-aware (This/Last/generic) and reused by the chart card's DD eyebrow.
- **Card captions** (small DM-Sans under each number): Sessions → "over N days" (`activeDays` = days with ≥1 session, since the chart plots one dot per day and a day can hold multiple sessions); Total DD → "total difficulty"; Avg DD → "DD per session"; Best DD → "highest single session" (the max single-note `calculateTotalDD` in the period — NOT the star rating).
- **Chart tooltip**: shows `"<DD> DD"` and appends `" · <n> sessions"` only when a day has more than one session (per-day session count via the recharts `formatter` 3rd arg `item.payload.sessions`), or "Rest day" when the day has no logged DD.
- **All-Time panel** (second column of the `lg:grid-cols-2` row; stacks below on mobile) — a divided label/value list (labels DM Sans muted, values `font-mono`) that is NOT period-scoped: Total DD Trained (sum of every note's `calculateTotalDD`), Sessions Logged (note count), Active Since (earliest note date as `MMM yyyy`), Skills in Library (count of non-drill, non-archived skills).

### 4. Skills (`/skills`)

- Manage the skills/drills/frequent connections library.

### 5. Routines (`/routines`)

- Build 10-skill routines.

## Mobile / Touch Handling

- Nav bar: `position: absolute` with JS-calculated `top` from `window.scrollY + window.innerHeight`, `z-40` (below dialog z-50), `pb-safe` for safe-area-inset.
- Visual viewport resize listener removed from nav to prevent iPad keyboard toolbar jump.
- Drag-and-drop: `touch-none` only on grip handle buttons, not entire rows; distance-based activation (5px).
- iOS zoom prevention: `font-size: 16px !important` on inputs via `@supports (-webkit-touch-callout: none)`.
- Routine builder: `max-h-[50vh]` (viewport-relative, not fixed px).
- Skills tables: `overflow-x-auto` for narrow screens.
- Score page skill editor containers: `min-h-[280px]` so the overlay has room.
- Calendar nav buttons and stats week nav: `h-9 w-9` (44px touch target).

## Offline Mode (PWA + sync queue)

Opt-in PWA in Settings → Offline.

### When ON

- Hand-written service worker (`client/public/sw.js`) caches the app shell (HTML/JS/CSS, manifest, icons). Network-first for navigations with cached `/` fallback; stale-while-revalidate for assets/fonts. `/api` and Vite HMR routes always bypass the cache. Registered only when offline mode is enabled.
- IndexedDB store `tn-offline` (`client/src/lib/offline-db.ts`) holds two stores: `cache` (skills/routines/user mirror) and `queue` (pending creates).
- `client/src/lib/queryClient.ts` mirrors `/api/skills` and `/api/routines` responses into IDB and falls back to them when offline. Mutations use `networkMode: 'always'` to override React Query v5's default that would otherwise pause every mutation when `navigator.onLine` is false (which previously made buttons appear stuck forever); offline behaviour is handled explicitly inside `tryNetworkOrEnqueue` instead.
- `useAuth` mirrors the user record into IDB so the app can boot offline; otherwise login is required.
- Note creates (`useCreateNote`) and score creates (Score page `createMutation`) detect `offlineMode && !navigator.onLine` and enqueue via `enqueueCreate(kind, body)` instead of POSTing.
- `App.tsx` drains the queue on app start, on `online` event, and Settings exposes a "Sync now" button. Successful drains toast "Synced N offline entries." Sequential POSTs; stop on network/auth errors, drop on 4xx-non-auth.
- Pages render `OfflinePlaceholder` ("You are not connected to the internet.") when offline + offline-mode-on for: Home (training log), Score (previous scores list), Stats, and Points to Fix dialog.
- Sign-out warning includes pending count if non-zero.
- Turning offline mode OFF: drains the queue (best-effort if online), clears IDB, unregisters the service worker, and deletes any caches.
- Login page shows "Connect to the internet to sign in." and disables the submit button when offline.

### Files

- `client/public/sw.js` — service worker
- `client/src/lib/offline-db.ts` — IDB wrapper
- `client/src/lib/offline-mode.ts` — localStorage flag + subscribers
- `client/src/lib/offline-queue.ts` — enqueue / drain / `useQueueCount`
- `client/src/lib/offline-control.ts` — enable/disable, register/unregister SW
- `client/src/hooks/use-online.ts` — `navigator.onLine` reactive hook
- `client/src/hooks/use-offline-mode.ts` — reactive flag hook
- `client/src/components/offline-placeholder.tsx` — reusable card

## Running

Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.

## User Preferences

No explicit user preferences recorded yet. When the user asks to remember a preference or convention, capture it here. Until then, follow the design-system conventions documented above.
