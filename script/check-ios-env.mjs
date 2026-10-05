// Fails the iOS build early if the app wouldn't know where its server lives.
import { existsSync, readFileSync } from "fs";

let url = process.env.VITE_API_BASE_URL;
for (const file of [".env.local", ".env"]) {
  if (url || !existsSync(file)) continue;
  const match = readFileSync(file, "utf-8").match(/^VITE_API_BASE_URL=(.+)$/m);
  if (match) url = match[1].trim();
}

if (!url || !/^https:\/\//.test(url)) {
  console.error(
    "Set VITE_API_BASE_URL to your deployed server (https://...) in a .env file at the repo root,\n" +
      "for example: VITE_API_BASE_URL=https://trampoline-note.replit.app",
  );
  process.exit(1);
}
console.log(`iOS app will talk to ${url}`);
