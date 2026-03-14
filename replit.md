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

## Running

Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.
