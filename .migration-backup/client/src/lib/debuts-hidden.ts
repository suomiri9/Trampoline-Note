// Debuts "Choose" picker persistence helpers.
//
// The source of truth is the per-user server value (users.debuts_hidden,
// PATCHed via /api/auth/debuts-hidden). localStorage is only an offline
// fallback and is namespaced by user id so choices never leak between
// accounts on a shared device. The legacy unscoped "debuts-hidden" key is
// never read for authenticated users.

export type HiddenMap = Record<string, string[]>;

const LEGACY_KEY = "debuts-hidden";

function storageKey(userId: string | null | undefined): string {
  return userId ? `${LEGACY_KEY}:${userId}` : LEGACY_KEY;
}

export function parseHidden(raw: string | null | undefined): HiddenMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: HiddenMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    }
    return out;
  } catch {
    return null;
  }
}

/** Read the local fallback for one user. Only ever reads that user's key. */
export function loadHiddenLocal(userId: string | null | undefined): HiddenMap {
  try {
    return parseHidden(localStorage.getItem(storageKey(userId))) ?? {};
  } catch {
    return {};
  }
}

export function saveHiddenLocal(userId: string | null | undefined, all: HiddenMap) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(all));
    // Drop the legacy unscoped blob so it can never bleed into another
    // account later on this device.
    if (userId) localStorage.removeItem(LEGACY_KEY);
  } catch {
    // localStorage unavailable — local fallback just won't persist
  }
}

/**
 * Resolve the hidden map for an authenticated user: server value wins; when
 * the account has no server value yet (null), fall back ONLY to that user's
 * own scoped local blob (offline edits), never another account's data.
 */
export function resolveHidden(userId: string, serverRaw: string | null | undefined): HiddenMap {
  return parseHidden(serverRaw) ?? loadHiddenLocal(userId);
}
