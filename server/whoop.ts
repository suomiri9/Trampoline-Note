// WHOOP data access via per-user OAuth ("Sign in with WHOOP").
//
// Each app user links their own WHOOP account through the standard WHOOP
// OAuth2 authorization-code flow (client credentials come from a WHOOP
// developer app, env WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET). Tokens are
// stored per user in the whoop_tokens table and refreshed server-side —
// they are never exposed to the frontend.
//
// Reads recovery, sleep, cycle (strain) and workout collections from the
// WHOOP API v2. Data is read-only.
//
// Fails explicitly: when the user has no WHOOP link (or refresh fails) a
// WhoopNotConnectedError is thrown (routes translate it into a 503 with
// code "not_connected"); WHOOP API failures throw a WhoopApiError (502).

import { storage } from "./storage";

const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";
const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
// "offline" grants a refresh token so the link survives past the first hour.
const WHOOP_SCOPES = "offline read:recovery read:sleep read:cycles read:workout read:profile";
const PAGE_LIMIT = 25; // WHOOP max page size
const MAX_PAGES = 40; // safety cap (~1000 records per collection)
// Refresh the access token when it expires within this window.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export class WhoopNotConnectedError extends Error {
  constructor() {
    super("WHOOP is not connected");
    this.name = "WhoopNotConnectedError";
  }
}

export class WhoopApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WhoopApiError";
    this.status = status;
  }
}

export function isWhoopConfigured(): boolean {
  return !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
}

export function buildWhoopAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: WHOOP_SCOPES,
    state,
  });
  return `${WHOOP_AUTH_URL}?${params}`;
}

interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
}

async function requestToken(form: Record<string, string>): Promise<WhoopTokenResponse> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new WhoopApiError(res.status, `WHOOP token endpoint error (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text) as WhoopTokenResponse;
  if (!body.access_token || typeof body.expires_in !== "number") {
    throw new WhoopApiError(502, "WHOOP token endpoint returned an unexpected response.");
  }
  return body;
}

// Exchange the OAuth authorization code and persist tokens for the user.
export async function completeWhoopLink(userId: string, code: string, redirectUri: string): Promise<void> {
  const token = await requestToken({
    grant_type: "authorization_code",
    code,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    redirect_uri: redirectUri,
  });
  await storage.upsertWhoopToken(userId, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scope: token.scope ?? null,
  });
  clearWhoopCache(userId);
}

export async function disconnectWhoop(userId: string): Promise<void> {
  await storage.deleteWhoopToken(userId);
  clearWhoopCache(userId);
}

async function getWhoopAccessToken(userId: string): Promise<string> {
  const row = await storage.getWhoopToken(userId);
  if (!row) throw new WhoopNotConnectedError();

  const expiresSoon = row.expiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
  if (!expiresSoon) return row.accessToken;

  // Access token expired (or about to). Without a refresh token the link is dead.
  if (!row.refreshToken || !isWhoopConfigured()) {
    await storage.deleteWhoopToken(userId);
    throw new WhoopNotConnectedError();
  }

  try {
    const token = await requestToken({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      scope: "offline",
    });
    await storage.upsertWhoopToken(userId, {
      accessToken: token.access_token,
      // WHOOP rotates refresh tokens; keep the old one only if none returned.
      refreshToken: token.refresh_token ?? row.refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scope: token.scope ?? row.scope,
    });
    return token.access_token;
  } catch (err) {
    // A rejected refresh means the grant was revoked/expired — drop the dead
    // link so the UI shows "sign in" again instead of failing forever.
    if (err instanceof WhoopApiError && err.status >= 400 && err.status < 500) {
      console.error(`[whoop] Refresh rejected for user ${userId}: ${err.message}`);
      await storage.deleteWhoopToken(userId);
      throw new WhoopNotConnectedError();
    }
    throw err;
  }
}

// True when the user currently has a WHOOP link (token row present).
export async function isWhoopLinked(userId: string): Promise<boolean> {
  return !!(await storage.getWhoopToken(userId));
}

// Fetch every page of a WHOOP collection endpoint between start and end.
async function fetchCollection(
  token: string,
  path: string,
  start: Date,
  end: Date,
): Promise<any[]> {
  const records: any[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
      limit: String(PAGE_LIMIT),
    });
    if (nextToken) params.set("nextToken", nextToken);

    const res = await fetch(`${WHOOP_API_BASE}${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      throw new WhoopNotConnectedError();
    }
    if (res.status === 429) {
      throw new WhoopApiError(429, "WHOOP rate limit reached. Try again in a minute.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new WhoopApiError(res.status, `WHOOP API error (${res.status}): ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as { records?: any[]; next_token?: string };
    if (Array.isArray(body.records)) records.push(...body.records);
    nextToken = body.next_token || undefined;
    if (!nextToken) break;
  }

  return records;
}

export interface WhoopDashboardData {
  recovery: Array<{
    date: string;
    recoveryScore: number | null;
    restingHeartRate: number | null;
    hrvMs: number | null;
  }>;
  sleep: Array<{
    date: string;
    start: string;
    end: string;
    nap: boolean;
    asleepHours: number | null;
    performancePct: number | null;
  }>;
  cycles: Array<{
    date: string;
    strain: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
  }>;
  workouts: Array<{
    id: string;
    sport: string;
    start: string;
    end: string;
    durationMin: number;
    strain: number | null;
    avgHeartRate: number | null;
  }>;
}

function dayKey(iso: string): string {
  return typeof iso === "string" ? iso.substring(0, 10) : "";
}

export async function getWhoopDashboardData(userId: string, days: number): Promise<WhoopDashboardData> {
  const token = await getWhoopAccessToken(userId);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const [recoveryRaw, sleepRaw, cyclesRaw, workoutsRaw] = await Promise.all([
    fetchCollection(token, "/recovery", start, end),
    fetchCollection(token, "/activity/sleep", start, end),
    fetchCollection(token, "/cycle", start, end),
    fetchCollection(token, "/activity/workout", start, end),
  ]);

  const recovery = recoveryRaw
    .filter((r) => r?.created_at)
    .map((r) => ({
      date: dayKey(r.created_at),
      recoveryScore: r.score?.recovery_score ?? null,
      restingHeartRate: r.score?.resting_heart_rate ?? null,
      hrvMs: r.score?.hrv_rmssd_milli ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sleep = sleepRaw
    .filter((s) => s?.start && s?.end)
    .map((s) => {
      const st = s.score?.stage_summary;
      const asleepMilli =
        st != null
          ? (st.total_light_sleep_time_milli ?? 0) +
            (st.total_slow_wave_sleep_time_milli ?? 0) +
            (st.total_rem_sleep_time_milli ?? 0)
          : null;
      return {
        // Attribute the sleep to the wake-up day so it lines up with recovery.
        date: dayKey(s.end),
        start: s.start,
        end: s.end,
        nap: !!s.nap,
        asleepHours: asleepMilli != null ? asleepMilli / 3_600_000 : null,
        performancePct: s.score?.sleep_performance_percentage ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const cycles = cyclesRaw
    .filter((c) => c?.start)
    .map((c) => ({
      date: dayKey(c.start),
      strain: c.score?.strain ?? null,
      avgHeartRate: c.score?.average_heart_rate ?? null,
      maxHeartRate: c.score?.max_heart_rate ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const workouts = workoutsRaw
    .filter((w) => w?.start && w?.end)
    .map((w) => ({
      id: String(w.id ?? `${w.start}-${w.sport_name ?? w.sport_id ?? ""}`),
      sport: String(w.sport_name ?? (w.sport_id != null ? `Sport #${w.sport_id}` : "Workout")),
      start: w.start,
      end: w.end,
      durationMin: Math.max(0, Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000)),
      strain: w.score?.strain ?? null,
      avgHeartRate: w.score?.average_heart_rate ?? null,
    }))
    .sort((a, b) => b.start.localeCompare(a.start));

  return { recovery, sleep, cycles, workouts };
}

// ---- Light in-memory cache to respect WHOOP rate limits (per user+range) ----

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: WhoopDashboardData }>();

export function clearWhoopCache(userId: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export async function getWhoopDashboardDataCached(userId: string, days: number): Promise<WhoopDashboardData> {
  const key = `${userId}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await getWhoopDashboardData(userId, days);
  cache.set(key, { at: Date.now(), data });
  return data;
}
