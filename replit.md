# Trampoline Training Log

A full-stack trampoline training note app built with React, Express, Drizzle ORM, and PostgreSQL.

## Architecture

- **Frontend**: React + Vite + TypeScript, Shadcn UI, TanStack Query, Wouter routing, Recharts
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Custom email/password authentication with bcrypt, express-session with PostgreSQL session store

## Design System (Dark Monospace)

Near-black dark theme is the default baseline (`<html class="dark">` in `client/index.html`; theme-color `#0a0b10`). There is no light/dark toggle.

- **Fonts**: `--font-display` (Bebas Neue — tall condensed all-caps) for page titles, big number figures, and score displays; `--font-body`/`--font-sans` (DM Sans) for body, buttons, labels, and general UI; `--font-mono` (JetBrains Mono) for codes, stats, timestamps, eyebrows, and small metadata. The CSS vars and helpers live in `client/src/index.css`; the three families are loaded via a single Google Fonts `<link>` in `client/index.html` (ONLY these three — no other families, no `@import` in CSS). Base `h1–h6` use DM Sans; Bebas is applied deliberately via `.page-title` and the `font-display` utility. **Popup/dialog titles also use the display style**: the shared `DialogTitle` (`client/src/components/ui/dialog.tsx`) and `AlertDialogTitle` (`client/src/components/ui/alert-dialog.tsx`) base components apply `page-title text-2xl` (Bebas, uppercase, `font-normal`) so EVERY popup title matches the page headers — do not add `font-semibold`/`font-bold` overrides on a `DialogTitle` (Bebas is single-weight and would faux-bold). The main Training note-dialog title overrides size only (`text-3xl`). Bebas ships a single weight, so display elements use `font-normal` to avoid faux-bold. **Numeric values follow a strict size rule: BIG figures (page stat numbers, score/DD totals, personal best, the routine-builder total) use `font-display` (Bebas, `font-normal`); SMALL numbers (skill/routine DD values, table cells, breakdown E/DD/H/TOF, connection/part builder totals, skill-chip DDs, the detail-page `StatCard` values in `skill-detail.tsx`/`routine-detail.tsx` — Total Sessions/Reps, Full Runs, Attempts, First/Last Practiced — and the "Session History" entry dates on those detail pages) AND numeric/timestamp data-entry fields (date-picker buttons, the shared `TimeField` in `client/src/components/time-field.tsx`, the score/rank number `Input`s, and the `/100` suffix) use `font-mono` (JetBrains Mono). DM Sans (the rounded look) is never used for numeric values. Note that some inline DD values inherit `font-mono` from an ancestor `<p className="font-mono">` rather than carrying the class themselves.**
- **CSS helpers** (`client/src/index.css`): `.eyebrow` (mono uppercase label — pure text styling, no display change), `.page-title` + `.title-accent` (large uppercase title with blue/indigo last word), `.card-3d` (flat dark surface + thin border), `.glass-surface`, `.btn-3d` (glowing solid-blue primary), `.btn-gold` (outlined amber/gold), `.bg-mesh`.
- **Eyebrow `//` convention**: the `// ` prefix is added by `PageHeader` itself (`// {eyebrow}`). Standalone in-card/section eyebrows use the `.eyebrow` class with NO literal `// ` — never hardcode `// ` in page/section markup. `.eyebrow` is safe on `<th>` (used for table column headers on Skills).
- **`PageHeader`** (`client/src/components/page-header.tsx`): centralizes page titles. Props: `eyebrow`, `title`, `accent` (trailing portion of `title`, highlighted — defaults to last word; `accent` is stripped from the lead so pass the FULL title), `subtitle`, `actions`. Also exports `primaryActionClass` (blue glow button) and `goldActionClass` (gold outline). **Sticky on every tab**: the header root is `sticky top-0 z-30` with `bg-background/90 backdrop-blur-md border-b` so it stays pinned while page content scrolls under it (the real scroll container is `#root`, not the window — `html,body` are `position:fixed;overflow:hidden`). It spans the full container width via negative margins that MUST mirror the page container's padding breakpoint-for-breakpoint: `-mx-4 sm:-mx-6 lg:-mx-8` cancels `px-4 sm:px-6 lg:px-8`, and `-mt-6 md:-mt-8 pt-6 md:pt-8` cancels/re-adds the `py-6 md:py-8` top padding (used by `PageLayout` and the `skills.tsx` inline root). If you change `PageLayout`'s padding, update these in lockstep. z-30 sits below the bottom nav (z-40) and dialogs (z-50). Detail pages (`skill-detail`/`routine-detail`) don't use `PageHeader` and keep natural scroll. **`--page-header-h` contract**: `PageHeader` measures its own rendered height with a `ResizeObserver` and publishes it as a CSS custom property on `documentElement` (`--page-header-h`) so sticky sub-bars can pin directly beneath it regardless of breakpoint (the header is much taller when it stacks on mobile). The Skills tab bar consumes it — its `TabsList` is wrapped in a full-width sticky sub-bar (`sticky z-20`, same negative-margin/blur/border treatment as the header) with `style={{ top: "var(--page-header-h, 96px)" }}`, so it sits flush under the header while content scrolls below both. z-20 sits below the header (z-30). If you change the header markup/padding or add another sticky sub-bar, keep this publish/consume pairing intact.
- **On-demand builders (modal dialogs)**: Every "Add …"/"New …" / Edit form opens as a centered modal `Dialog` popup (shadcn `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`), NOT an inline panel. This applies to all four Skills tabs (skills/drills/connections/parts), the Routines builder, the Score add/edit form, AND the Training note-dialog's quick-add "+" `DropdownMenu` (New Skill, New Drill, New Connection, New Routine, New Routine Part). The five quick-add builders are NESTED Radix `Dialog`s rendered inside `note-dialog.tsx` (which is itself a `Dialog`) — each is `<Dialog open={showNewSkill|showNewConn|showNewRoutine}>` (always mounted) or, for the part builder, gated by its `{showNewPart && (() => {…})()}` IIFE; `onOpenChange` resets only the part draft and closes the others. They drop the old "Switch to…" links and manual X (DialogContent's own X/Escape/overlay close them), and visually mirror the Skills/Routines builders (default-size Inputs, `sm:max-w-md`, min-h chip box with "No skills added yet", Recent row via `globalRecentSkillIds`/`addRecentSkill`, Bebas Total Difficulty/Total DD figure). The note-dialog quick-add keeps a LENIENT routine save (≥1 skill, not exactly 10) and the existing chip-DnD ids (`nc-${i}` connection, `nr-${i}` routine). Their pickers must NOT pass `container={dialogBodyRef.current}` (so the popover portals to body above the nested dialog) — only the main note skill picker keeps that container. The blue `primaryActionClass` header button (or Edit) sets the open flag (`showForm`/`editingSkill` on Skills, `showBuilder`/`editingRoutine` on Routines, `isAdding`/`editingScore` on Score); the dialog's `onOpenChange` closes it via the page's cancel handler (Escape, overlay click, and the built-in DialogContent X all close it). Closing a *new* (Add) builder does NOT reset its inputs — for the four Skills tabs and the Routines builder the entered draft (RHF form values, `connName`/`connSkillIds`, `partRoutineId`, routine `name`/`selectedSkillIds`) is preserved so reopening shows the same thing; inputs are only cleared after a successful save or when closing an *edit* (discarding unsaved changes). Accordingly `openBuilder`/the header Add button must NOT reset, and `cancelEditing` only resets when `editingSkill`/`editingRoutine` is set. (Score add/edit is unchanged and still resets on close.) Because the dialog portals out of the layout, the library/list always spans full width (`md:col-span-3`). DialogContent widths: Skills/Routines `sm:max-w-md`, Score `sm:max-w-2xl`, all with `max-h-[90vh] overflow-y-auto`. The Routines builder mirrors the Skills→Connections builder: the picked skills render as compact wrap CHIPS (`SortableChip` + `rectSortingStrategy` + `useLongPressDndSensors`, ids `slot-${i}` so `handleDragEnd` is unchanged) inside a `min-h-[80px] bg-muted/30 flex-wrap` box with a "No skills added yet" empty state, plus a "Recent" quick-add row (`useRecentSkills`/`addRecentSkill`, shared localStorage key `recent-conn-skills`) above it. The old numbered 1–10 vertical slot list and `SortableFilledSlot` are gone. The 10-skill cap is kept (picker disabled at 10; Recent buttons disabled at 10; the `/10` counter turns red). All header add buttons use the UNMODIFIED `primaryActionClass` (h-12 px-6, Plus icon `w-5 h-5`) so every primary add button is the same size — do not add `h-10`/`text-sm` size overrides. Secondary header toggles (e.g. Archived) match the height with `h-12 rounded-xl`.
- **Cards**: flat dark with a colored left accent bar (`<span absolute left-0 w-1 bg-primary>`) and a large Bebas accent figure (e.g. TOTAL DD on note cards, totals on stats).
- **Bottom nav (`Navigation` in `client/src/App.tsx`)**: each tab has its own color — Training=blue, Score=yellow, Progress=green, Skills=red, Routines=purple (Settings stays neutral). Inactive tabs show a LIGHT tint of their color (`lightColor`, e.g. `text-blue-400/45`, inherited by both icon and label); the active tab shows the full REAL color — colored icon + matching tinted background + colored label. Color classes are literal Tailwind strings per `navItem` so JIT picks them up.
- Recharts colors use theme CSS vars (`hsl(var(--primary))`, `hsl(var(--border))`, etc.) so the chart fits the dark theme.

## Pages

1. **Training** (`/`) — Log sessions with date, time, skills/drills, routines, notes, star rating. In the add/edit dialog the star rating sits inline to the RIGHT of the start→end time row; on the training-log card (Home) the star rating sits INLINE on the same row as the date/time line, rendered at small size (`StarRating size="sm"` — 10px stars to match the 10px mono date/time text).
2. **Score** (`/score`) — Track E/D/H/T scores per routine; supports Set/Vol/both, practice or competition, partial attempts
3. **Progress** (`/stats`) — Line chart of total daily DD over time. The four stat cards (Sessions, Total DD, Avg DD, Best DD) are scoped to the chart's currently selected range + offset (week/month/year/all), not all-time; a scope row above the cards shows the period title + date range with the hint "Totals reflect the selected range". `periodTitle` is offset-aware (This/Last/generic) and reused by the chart card's DD eyebrow. Each card has a small DM-Sans caption under its number explaining the metric (Sessions → "over N days" via `activeDays` = days with ≥1 session, since the chart plots one dot per day and a day can hold multiple sessions; Total DD → "total difficulty"; Avg DD → "DD per session"; Best DD → "highest single session", i.e. the max single-note `calculateTotalDD` in the period — NOT the star rating). The chart dot tooltip shows `"<DD> DD"` and appends `" · <n> sessions"` only when a day has more than one session (per-day session count via the recharts `formatter` 3rd arg `item.payload.sessions`), or "Rest day" when the day has no logged DD. Beside the chart (the second column of the `lg:grid-cols-2` row; stacks below on mobile) sits an **All-Time** overview panel — a divided label/value list (labels DM Sans muted, values `font-mono`) that is NOT period-scoped: Total DD Trained (sum of every note's `calculateTotalDD`), Sessions Logged (note count), Active Since (earliest note date as `MMM yyyy`), Skills in Library (count of non-drill, non-archived skills).
4. **Skills** (`/skills`) — Manage skills/drills/frequent connections library
5. **Routines** (`/routines`) — Build 10-skill routines

## Database Tables

- `users` — User profiles with hashed passwords (email/password auth)
- `sessions` — Express session store
- `notes` — Training sessions (per user)
- `skills` — Skills/drills/frequent connections (per user)
- `routines` — 10-skill routines (per user); `createdAt` (timestamp, `defaultNow`) records when each routine was made and is shown as a `dd-mm-yyyy` mono label beside the routine name on the Routines card
- `scores` — Competition/practice scores with E/D/H/T fields (per user)

## Auth

Custom email/password authentication. All API routes are protected with `isAuthenticated` middleware. Data is filtered by `userId` (from session). The frontend shows a login/register form when unauthenticated. Demo user (id `55504735`) has email `suomi.ri.9@gmail.com` and password `tramplog2026`.

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

## Mobile / Touch Handling

- Nav bar: `position: absolute` with JS-calculated `top` from `window.scrollY + window.innerHeight`, `z-40` (below dialog z-50), `pb-safe` for safe-area-inset
- Visual viewport resize listener removed from nav to prevent iPad keyboard toolbar jump
- Drag-and-drop: `touch-none` only on grip handle buttons, not entire rows; distance-based activation (5px)
- iOS zoom prevention: `font-size: 16px !important` on inputs via `@supports (-webkit-touch-callout: none)`
- Routine builder: `max-h-[50vh]` (viewport-relative, not fixed px)
- Skills tables: `overflow-x-auto` for narrow screens
- Score page skill editor containers: `min-h-[280px]` so overlay has room
- Calendar nav buttons and stats week nav: `h-9 w-9` (44px touch target)

## Offline Mode (PWA + sync queue)

Opt-in PWA in Settings → Offline. When ON:
- Hand-written service worker (`client/public/sw.js`) caches the app shell (HTML/JS/CSS, manifest, icons). Network-first for navigations with cached `/` fallback; stale-while-revalidate for assets/fonts. `/api` and Vite HMR routes always bypass the cache. Registered only when offline mode is enabled.
- IndexedDB store `tn-offline` (`client/src/lib/offline-db.ts`) holds two stores: `cache` (skills/routines/user mirror) and `queue` (pending creates).
- `client/src/lib/queryClient.ts` mirrors `/api/skills` and `/api/routines` responses into IDB and falls back to them when offline. Mutations are configured with `networkMode: 'always'` to override React Query v5's default that would otherwise pause every mutation when `navigator.onLine` is false (which previously made buttons appear stuck forever); offline behaviour is handled explicitly inside `tryNetworkOrEnqueue` instead.
- `useAuth` mirrors the user record into IDB so the app can boot offline; otherwise login is required.
- Note creates (`useCreateNote`) and score creates (Score page `createMutation`) detect `offlineMode && !navigator.onLine` and enqueue via `enqueueCreate(kind, body)` instead of POSTing.
- `App.tsx` drains the queue on app start, on `online` event, and Settings exposes a "Sync now" button. Successful drains toast "Synced N offline entries." Sequential POSTs; stop on network/auth errors, drop on 4xx-non-auth.
- Pages render `OfflinePlaceholder` ("You are not connected to the internet.") when offline+offline-mode-on for: Home (training log), Score (previous scores list), Stats, and Points to Fix dialog.
- Sign-out warning includes pending count if non-zero.
- Turning offline mode OFF: drains the queue (best-effort if online), clears IDB, unregisters the service worker, and deletes any caches.
- Login page shows "Connect to the internet to sign in." and disables the submit button when offline.

Files:
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
