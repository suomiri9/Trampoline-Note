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

## iOS app

The iOS app is the same React frontend wrapped with [Capacitor](https://capacitorjs.com). It needs no server: in the app, `/api` requests are answered on the device (`client/src/lib/local-api`) and everything is saved to one JSON file in the app's Documents folder, which is included in iPhone backups and visible in the Files app. There is no sign-in and no sync between devices.

To move existing data into the app, use **Settings → Your data → Export** on the web app, then **Import from a file** in the iOS app.

You need a Mac with Xcode, and an Apple Developer account to publish to the App Store.

```bash
npm install
npm run ios:sync   # build the web app and copy it into ios/
npm run ios:open   # open the project in Xcode, then press Run
```

Run `npm run ios:sync` again after every frontend change. App icon and launch screen live in `ios/App/App/Assets.xcassets`.
