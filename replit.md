# Trampoline Training Log

A full-stack trampoline training note app built with React, Express, Drizzle ORM, and PostgreSQL.

## Architecture

- **Frontend**: React + Vite + TypeScript, Shadcn UI, TanStack Query, Wouter routing, Recharts
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Replit Auth (email/password + OAuth), express-session with PostgreSQL session store

## Pages

1. **Training** (`/`) — Log sessions with date, time, skills/drills, routines, notes, star rating, sleep score
2. **Score** (`/score`) — Track E/D/H/T scores per routine; supports Set/Vol/both, practice or competition, partial attempts
3. **Progress** (`/stats`) — Line chart of total daily DD over time
4. **Skills** (`/skills`) — Manage skills/drills/frequent connections library
5. **Routines** (`/routines`) — Build 10-skill routines

## Database Tables

- `users` — Replit Auth user profiles
- `sessions` — Express session store (required for Replit Auth)
- `notes` — Training sessions (per user)
- `skills` — Skills/drills/frequent connections (per user)
- `routines` — 10-skill routines (per user)
- `scores` — Competition/practice scores with E/D/H/T fields (per user)

## Auth

All API routes are protected with `isAuthenticated` middleware. Data is filtered by `userId` (from Replit OIDC `sub` claim). The frontend shows a login gate when unauthenticated.

## Key Files

- `shared/schema.ts` — Drizzle table definitions + Zod schemas
- `shared/models/auth.ts` — Users and sessions table definitions
- `server/storage.ts` — Data access layer (all methods scoped by userId)
- `server/routes.ts` — API route handlers
- `server/index.ts` — Express app setup + auth middleware
- `server/replit_integrations/auth/` — Replit Auth integration
- `client/src/App.tsx` — Router + auth gate + navigation
- `client/src/hooks/use-auth.ts` — Auth state hook

## Running

Workflow "Start application" runs `npm run dev` which starts Express + Vite on port 5000.
