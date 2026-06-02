# Trampoline Training Log

A full-stack trampoline training note app built with React, Express, Drizzle ORM, and PostgreSQL.

## Stack

- **Frontend**: React + Vite + TypeScript, Shadcn UI, TanStack Query, Wouter, Recharts
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Email/password with bcrypt + express-session (PostgreSQL session store)
- **PWA**: Offline mode with IndexedDB queue and hand-written service worker

## Pages

| Route | Description |
|-------|-------------|
| `/` | Log training sessions (skills, routines, notes, rating, sleep score) |
| `/score` | Track E/D/H/T scores per routine (practice or competition) |
| `/stats` | Line chart of total daily DD over time |
| `/skills` | Manage skills, drills, and frequent connections |
| `/routines` | Build 10-skill routines |

## Dev

```bash
npm install
npm run dev      # Express + Vite on port 5000
npm run build    # Production build
npm run db:push  # Push schema to Postgres (requires DATABASE_URL)
```

Requires a `DATABASE_URL` environment variable pointing to a PostgreSQL database.
