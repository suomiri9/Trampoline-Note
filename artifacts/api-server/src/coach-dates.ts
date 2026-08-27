// Date helpers for the AI coach. Kept dependency-free so they can be
// unit-tested without pulling in the OpenAI client / storage imports.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolves the athlete's local calendar date (YYYY-MM-DD). The client sends
 * its own date because the server clock is UTC — for athletes east of UTC
 * (e.g. New Zealand, UTC+12/+13) the UTC date lags their real day by up to
 * half a day, which used to pin the coach's "today" (and the push-level
 * cache) to YESTERDAY all morning. Falls back to the UTC date when the value
 * is missing or implausible (real timezones span UTC-12..UTC+14, so a
 * legitimate client date is at most one day away from the UTC date). */
export function resolveClientDate(raw: unknown): string {
  const utcKey = new Date().toISOString().substring(0, 10);
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return utcKey;
  const parsed = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed)) return utcKey;
  if (Math.abs(parsed - Date.parse(`${utcKey}T00:00:00Z`)) > DAY_MS) return utcKey;
  return raw;
}

/** Picks the WHOOP recovery entry that counts as "today". An exact date
 * match wins; an entry NEWER than the resolved date is also accepted
 * (recovery days are the athlete's local wake days, which can run ahead of
 * a UTC-derived date). Yesterday's entry never counts as today's — showing
 * a stale recovery as "today's" is exactly the bug this guards against. */
export function pickTodayRecovery(
  recovery: Array<{ date: string; recoveryScore: number | null }>,
  todayKey: string,
): { date: string; score: number | null } | null {
  let best: { date: string; score: number | null } | null = null;
  for (const r of recovery) {
    if (r.date < todayKey) continue;
    if (!best || r.date > best.date) best = { date: r.date, score: r.recoveryScore };
  }
  return best;
}
