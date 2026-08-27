// Shared helpers for the Execution deduction tracker.
//
// Judges' sheets print deductions in TENTHS as whole numbers (2 = 0.2 of a
// point, 20 = 2.0 for the landing; a final 0 means a clean landing). The app
// STORES deductions in points (0.2), the same unit as E scores. These helpers
// keep the two views consistent everywhere (manual entry, photo review,
// session cards, analysis).

/** A full trampoline routine has 10 skills (plus the landing). */
export const EXECUTION_SKILL_COUNT = 10;

/** A perfect routine scores E = 20 (two judges x 10, combined as printed). */
export const MAX_E_SCORE = 20;

/** Round to 1 decimal, avoiding float noise from summing tenths. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Printed tenths -> points: 2 -> 0.2, 20 -> 2.0. */
export function tenthsToPoints(tenths: number): number {
  return Math.round(tenths) / 10;
}

/** Points -> printed tenths: 0.2 -> 2, 2.0 -> 20. */
export function pointsToTenths(points: number): number {
  return Math.round(points * 10);
}

/**
 * Total deduction in points for a session: per-skill deductions plus the
 * landing deduction (when recorded).
 */
export function totalDeductionPoints(
  deductions: number[],
  landingDeduction: number | null | undefined,
): number {
  const sum = deductions.reduce((a, b) => a + b, 0) + (landingDeduction ?? 0);
  return round1(sum);
}

/**
 * The E score implied by a deduction row, matching the paper sheet:
 * E = 20 - (sum of the 10 skill deductions + landing deduction).
 * Only meaningful for a complete routine (10 skills AND a recorded landing) —
 * returns null otherwise (e.g. an interrupted routine).
 */
export function impliedEScore(
  deductions: number[],
  landingDeduction: number | null | undefined,
): number | null {
  if (deductions.length !== EXECUTION_SKILL_COUNT || landingDeduction == null) return null;
  return round1(MAX_E_SCORE - totalDeductionPoints(deductions, landingDeduction));
}

/**
 * Sanitize one parsed judges'-sheet row into tenths.
 *
 * The vision model is asked for the numbers exactly as printed (integers in
 * tenths), but if it returns points instead (0.2 rather than 2) the row will
 * contain non-integers — in that case the whole row is converted. A complete
 * row has 11 numbers: 10 per-skill deductions then the landing; a shorter row
 * (interrupted routine) keeps all values as skill deductions with no landing.
 * Returns null when nothing usable is present.
 */
export function sanitizeDeductionValues(
  values: unknown,
): { deductions: number[]; landing: number | null } | null {
  if (!Array.isArray(values)) return null;
  const raw = values
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (raw.length === 0) return null;
  // Row-level unit detection: any fractional value means the row is in points.
  const isPoints = raw.some((n) => !Number.isInteger(n));
  const tenths = raw
    .map((n) => Math.round(isPoints ? n * 10 : n))
    .filter((n) => n >= 0 && n <= 30)
    .slice(0, EXECUTION_SKILL_COUNT + 1);
  if (tenths.length === 0) return null;
  if (tenths.length >= EXECUTION_SKILL_COUNT + 1) {
    return {
      deductions: tenths.slice(0, EXECUTION_SKILL_COUNT),
      landing: tenths[EXECUTION_SKILL_COUNT],
    };
  }
  return { deductions: tenths, landing: null };
}
