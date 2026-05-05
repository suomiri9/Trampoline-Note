# Trampoline Training Log

A full-stack trampoline training note app built with React, Express, Drizzle ORM, and PostgreSQL.

## Architecture

- **Frontend**: React + Vite + TypeScript, Shadcn UI, TanStack Query, Wouter routing, Recharts
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Custom email/password authentication with bcrypt, express-session with PostgreSQL session store

## Pages

1. **Training** (`/`) — Log sessions with date, time, skills/drills, routines, notes, star rating, sleep score
2. **Score** (`/score`) — Track E/D/H/T scores per routine; supports Set/Vol/both, practice or competition, partial attempts
3. **Progress** (`/stats`) — Line chart of total daily DD over time
4. **Skills** (`/skills`) — Manage skills/drills/frequent connections library
5. **Routines** (`/routines`) — Build 10-skill routines

## Database Tables

- `users` — User profiles with hashed passwords (email/password auth)
- `sessions` — Express session store
- `notes` — Training sessions (per user)
- `skills` — Skills/drills/frequent connections (per user)
- `routines` — 10-skill routines (per user)
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
