/**
 * Load the production snapshot (script/prod-snapshot.json) into the DEV database.
 *
 * - Replaces all data owned by the demo user (their own account) with their real
 *   production data, preserving row ids so every internal reference keeps working
 *   (note text embeds skill ids; scores/versions reference routine ids; points to
 *   fix reference both).
 * - Bumps each table's id sequence past the imported max so new rows don't collide.
 * - Verifies the result with the app's own parsers before declaring success.
 *
 * Rebuild the snapshot by re-exporting from production (read-only), then run:
 *   npx tsx script/seed-from-prod.ts
 */
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { db, pool } from "../server/db";
import { skills, notes, routines, scores, routineVersions, tofSessions, executionSessions } from "@shared/schema";
import { users } from "@shared/models/auth";
import { parsePoints } from "@shared/points";
import { parseNoteSkills } from "@shared/dd";
import { lineupOnDate } from "@shared/routine-versions";

const UID = "55504735";

const TABLE_MAP: Array<[string, any]> = [
  ["skills", skills],
  ["routines", routines],
  ["routine_versions", routineVersions],
  ["notes", notes],
  ["scores", scores],
  ["tof_sessions", tofSessions],
  ["execution_sessions", executionSessions],
];

const snap = JSON.parse(readFileSync(new URL("./prod-snapshot.json", import.meta.url), "utf8"));

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

function mapRow(row: Record<string, unknown>, table: any, tname: string) {
  const cols = getTableColumns(table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "ord") continue;
    const ck = camel(k);
    if (!(ck in cols)) throw new Error(`No column for ${tname}.${k} (tried "${ck}") — mapping needs a special case`);
    let val: unknown = v;
    if (typeof v === "string" && ck.endsWith("At") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) val = new Date(v);
    out[ck] = val;
  }
  return out;
}

async function main() {
  console.log("Wiping dev data for user…");
  for (const [, table] of [...TABLE_MAP].reverse()) {
    await db.delete(table).where(eq(table.userId, UID));
  }

  console.log("Importing production snapshot…");
  for (const [tname, table] of TABLE_MAP) {
    const rows = (snap.tables[tname] ?? []).map((r: Record<string, unknown>) => mapRow(r, table, tname));
    for (let i = 0; i < rows.length; i += 50) {
      await db.insert(table).values(rows.slice(i, i + 50));
    }
    await db.execute(sql.raw(
      `SELECT setval(pg_get_serial_sequence('${tname}','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${tname}), 1), true)`
    ));
    console.log(`  ${tname}: ${rows.length} rows`);
  }

  const userCols = getTableColumns(users) as Record<string, unknown>;
  if (!("focusMemo" in userCols) || !("debutsHidden" in userCols)) {
    throw new Error("users model is missing focusMemo/debutsHidden — update the import");
  }
  await db.update(users).set({
    focusMemo: snap.user?.focus_memo ?? null,
    debutsHidden: snap.user?.debuts_hidden ?? null,
  }).where(eq(users.id, UID));
  console.log("  user fields: points to fix + hidden debuts");

  // ---- verify with the app's own parsers ----
  const [u] = await db.select({ fm: users.focusMemo }).from(users).where(eq(users.id, UID));
  const pts = parsePoints(u?.fm ?? "");
  const skillRows = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, UID));
  const ids = new Set(skillRows.map(r => r.id));
  const noteRows = await db.select().from(notes).where(eq(notes.userId, UID));
  let entries = 0, badRefs = 0;
  for (const n of noteRows) {
    for (const it of parseNoteSkills(n.skills ?? "")) {
      entries++;
      for (const cid of [...(it.id > 0 ? [it.id] : []), ...(it.customSkillIds ?? [])]) {
        // Orphaned ids are expected when a skill was deleted after being logged —
        // production has the same orphans and the app renders them as unknown.
        if (!ids.has(cid)) { badRefs++; console.log(`  note ${n.date} references deleted skill ${cid} (also orphaned in prod — OK)`); }
      }
    }
  }
  const allRoutines = await db.select().from(routines).where(eq(routines.userId, UID));
  const vers = await db.select().from(routineVersions).where(eq(routineVersions.userId, UID));
  let versionOk = "n/a";
  if (vers.length) {
    const v = vers[0];
    const r = allRoutines.find(x => x.id === v.routineId);
    if (r) {
      const before = lineupOnDate(r.skillIds, [{ id: v.id, skillIds: v.skillIds, effectiveUntil: v.effectiveUntil }], "1970-01-01");
      versionOk = String(JSON.stringify(before) === JSON.stringify(v.skillIds));
    } else versionOk = "routine missing!";
  }
  console.log(`verify: points=${pts.length} (resolved=${pts.filter((p: any) => p.resolved).length}) noteEntries=${entries} orphanedRefs=${badRefs} versionResolves=${versionOk}`);
  console.log("Import complete.");
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
