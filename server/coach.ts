// AI coach: builds a compact per-user training + WHOOP context and asks a
// Replit-managed OpenAI model (no user API key) for (a) a daily "push level"
// recommendation and (b) grounded answers in the coach chat.
//
// The model only ever sees a summarized context — recent session DD totals,
// ratings, scores and WHOOP recovery/HRV/sleep/strain — never raw dumps.

import OpenAI from "openai";
import { storage } from "./storage";
import { storeCoachImages } from "./coach-images";
import { getWhoopDashboardDataCached, WhoopNotConnectedError } from "./whoop";
import type { Skill, Routine, NoteResponse } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-5.6-terra";

export class CoachUnavailableError extends Error {
  constructor(message = "The AI coach is unavailable right now.") {
    super(message);
    this.name = "CoachUnavailableError";
  }
}

// ---- Server-side DD computation (mirrors client training-utils) ----

interface SkillItem {
  id: number;
  reps?: number;
  routineId?: number;
  fcId?: number;
  customSkillIds?: number[];
  attempt?: number;
}

function parseNoteSkills(skillsString: string | null | undefined): SkillItem[] {
  if (!skillsString) return [];
  try {
    const parsed = JSON.parse(skillsString);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) =>
        typeof item === "number" ? { id: item } : (item as SkillItem),
      );
    }
  } catch {}
  return skillsString.split(",").map((s) => ({ id: parseInt(s) })).filter((i) => Number.isFinite(i.id));
}

function calculateTotalDD(items: SkillItem[], allSkills: Skill[], routines: Routine[]): number {
  let total = 0;
  let groupDD = 0;
  let groupReps = 1;
  const ddOf = (ids: number[]) =>
    ids.reduce((acc, sId) => acc + (allSkills.find((s) => s.id === sId)?.difficulty || 0), 0);

  for (const item of items) {
    if (item.id === -1) {
      total += groupDD * groupReps;
      groupDD = 0;
      groupReps = 1;
    } else if (item.id === -2) {
      const routine = routines.find((r) => r.id === item.routineId);
      const skillIds = item.customSkillIds ?? routine?.skillIds ?? [];
      const count = item.attempt ?? skillIds.length;
      groupDD += ddOf(skillIds.slice(0, count));
      groupReps = item.reps || 1;
    } else if (item.id === -3) {
      const fc = allSkills.find((s) => s.id === item.fcId);
      groupDD += ddOf(item.customSkillIds ?? fc?.skillIds ?? []);
      groupReps = item.reps || 1;
    } else {
      groupDD += allSkills.find((s) => s.id === item.id)?.difficulty || 0;
      groupReps = item.reps || 1;
    }
  }
  total += groupDD * groupReps;
  return total;
}

// ---- Compact per-user context ----

export interface CoachContext {
  whoopLinked: boolean;
  text: string; // human-readable summary handed to the model
  todayRecovery: number | null;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? "-" : n.toFixed(digits);
}

export async function buildCoachContext(userId: string): Promise<CoachContext> {
  const [notes, skills, routines, scores] = await Promise.all([
    storage.getNotes(userId, { limit: 60 }),
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getScores(userId),
  ]);

  const today = new Date();
  const todayKey = today.toISOString().substring(0, 10);
  const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);

  const lines: string[] = [];
  lines.push(`Today's date: ${todayKey}`);

  // Recent training sessions (last 30 days) with DD totals + ratings.
  const recentNotes = notes.filter((n) => n.date.substring(0, 10) >= cutoff);
  lines.push(`\nTraining sessions, last 30 days (${recentNotes.length}):`);
  if (recentNotes.length === 0) {
    lines.push("  (no sessions logged)");
  }
  for (const note of recentNotes.slice(0, 30)) {
    const dd = calculateTotalDD(parseNoteSkills(note.skills), skills, routines);
    const noteText = (note.content || "").replace(/\s+/g, " ").trim();
    lines.push(
      `  ${note.date.substring(0, 10)} · DD ${dd.toFixed(1)} · rating ${note.rating ?? "-"}/5` +
        (noteText ? ` · notes: ${noteText.slice(0, 200)}` : ""),
    );
  }

  // Recent scores (last 10).
  const recentScores = scores.slice(0, 10);
  if (recentScores.length > 0) {
    lines.push(`\nRecent scores (${recentScores.length}, newest first):`);
    for (const s of recentScores) {
      const kind = s.type === "competition" ? `competition${s.competitionName ? ` "${s.competitionName}"` : ""}${s.round ? ` ${s.round}` : ""}` : s.type;
      lines.push(
        `  ${String(s.date).substring(0, 10)} · ${kind} · total ${fmt(s.total, 2)} (E ${fmt(s.execution, 1)}, D ${fmt(s.difficulty, 1)}, HD ${fmt(s.horizontal, 1)}, T ${fmt(s.timeOfFlight, 2)})${s.rank != null ? ` · rank ${s.rank}` : ""}`,
      );
    }
  }

  // WHOOP: last 14 days recovery/HRV/sleep/strain (when linked).
  let whoopLinked = false;
  let todayRecovery: number | null = null;
  try {
    const whoop = await getWhoopDashboardDataCached(userId, 14);
    whoopLinked = true;
    const byDate = new Map<string, { rec?: number | null; hrv?: number | null; sleep?: number | null; strain?: number | null }>();
    const dayOf = (d: string) => {
      let row = byDate.get(d);
      if (!row) byDate.set(d, (row = {}));
      return row;
    };
    for (const r of whoop.recovery) {
      const d = dayOf(r.date);
      d.rec = r.recoveryScore;
      d.hrv = r.hrvMs;
    }
    for (const s of whoop.sleep) {
      if (!s.nap && s.asleepHours != null) dayOf(s.date).sleep = s.asleepHours;
    }
    for (const c of whoop.cycles) {
      if (c.strain != null) {
        const d = dayOf(c.date);
        d.strain = Math.max(d.strain ?? 0, c.strain);
      }
    }
    const days = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    lines.push(`\nWHOOP daily metrics, last 14 days:`);
    for (const [date, d] of days) {
      lines.push(
        `  ${date} · recovery ${d.rec != null ? Math.round(d.rec) + "%" : "-"} · HRV ${d.hrv != null ? Math.round(d.hrv) + "ms" : "-"} · sleep ${d.sleep != null ? d.sleep.toFixed(1) + "h" : "-"} · strain ${d.strain != null ? d.strain.toFixed(1) : "-"}`,
      );
    }
    let todayRow = byDate.get(todayKey);
    if (!todayRow && days.length) {
      // Recovery days are the athlete's LOCAL wake days, which can run ahead
      // of the server's UTC date (east of UTC around midnight) — accept the
      // newest day when it is later than the UTC "today".
      const [newestDate, newestRow] = days[days.length - 1];
      if (newestDate > todayKey) todayRow = newestRow;
    }
    todayRecovery = todayRow?.rec ?? null;
  } catch (err) {
    if (!(err instanceof WhoopNotConnectedError)) {
      // WHOOP API failure: proceed with load-only guidance, note the gap.
      lines.push(`\nWHOOP data is temporarily unavailable (API error).`);
    } else {
      lines.push(`\nWHOOP is not linked for this athlete — no recovery/HRV data available.`);
    }
  }

  return { whoopLinked, text: lines.join("\n"), todayRecovery };
}

// ---- Daily push-level recommendation (cached per user per day) ----

export interface PushRecommendation {
  level: "push" | "normal" | "easy" | "rest";
  reasoning: string;
  whoopLinked: boolean;
  todayRecovery: number | null;
  date: string; // YYYY-MM-DD the recommendation is for
}

const pushCache = new Map<string, PushRecommendation>();

export function clearCoachPushCache(userId: string): void {
  for (const key of Array.from(pushCache.keys())) {
    if (key.startsWith(`${userId}:`)) pushCache.delete(key);
  }
}

export async function getPushRecommendation(userId: string): Promise<PushRecommendation> {
  const dateKey = new Date().toISOString().substring(0, 10);
  const cacheKey = `${userId}:${dateKey}`;
  const hit = pushCache.get(cacheKey);
  if (hit) return hit;

  const ctx = await buildCoachContext(userId);

  const system = [
    "You are an experienced trampoline coach advising ONE athlete on how hard to push in today's training.",
    "You are given the athlete's real recent data. Weigh recent training load (session DD totals and their trend over the last few days) against WHOOP recovery %, HRV trend, and sleep.",
    ctx.whoopLinked
      ? "Reference today's recovery %, the HRV trend, and the last few days' DD load in your reasoning."
      : "WHOOP is not linked, so base your recommendation ONLY on training load (recent DD totals, session frequency, ratings) and say the guidance is load-only.",
    'Respond with JSON only: {"level": "push"|"normal"|"easy"|"rest", "reasoning": "<1-2 short sentences citing the actual numbers>"}',
  ].join(" ");

  let raw: string;
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Athlete data:\n\n${ctx.text}\n\nHow hard should I push today?` },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[coach] push recommendation failed:", err);
    throw new CoachUnavailableError();
  }

  let level: PushRecommendation["level"] = "normal";
  let reasoning = "";
  try {
    const parsed = JSON.parse(raw);
    const l = String(parsed.level ?? "").toLowerCase();
    if (l === "push" || l === "normal" || l === "easy" || l === "rest") level = l;
    reasoning = String(parsed.reasoning ?? "").trim();
  } catch {
    throw new CoachUnavailableError();
  }
  if (!reasoning) throw new CoachUnavailableError();

  const rec: PushRecommendation = {
    level,
    reasoning,
    whoopLinked: ctx.whoopLinked,
    todayRecovery: ctx.todayRecovery,
    date: dateKey,
  };
  pushCache.set(cacheKey, rec);
  return rec;
}

// ---- Chat ----

const MAX_HISTORY_TURNS = 20;

// Short guide to the app so the coach can also help the athlete USE the app
// (finding features, logging sessions, etc.) — not just interpret their data.
const APP_GUIDE = `
App guide (Trampoline Note):
- Training ("/", bottom-nav "Training"): the main log. Tap the "Start Training" button to log a session with date, start/end time, a star rating (1-5), free-text notes, and a practice list of skills/drills/routines/connections (with reps). The "Recent" row offers quick re-adds. Sessions show their total DD (degree of difficulty).
- Score ("/score"): record practice/trial/competition scores with E (execution), D (difficulty), HD (horizontal displacement) and T (time of flight); supports Set/Vol routines, prelims+final rounds, synchro mode, partial attempts ("skills done"), and shows a Competition Personal Best card.
- Progress ("/stats"): charts of training load (DD per session), ratings, score trends and WHOOP overlays.
- Skills ("/skills"): the library of skills, drills, frequent connections and routine parts. Skills can have shape variants (tuck "o", pike "<", straight "/") grouped under a base; edit, archive, reorder, and build connections here.
- Routines ("/routines"): build 10-skill routines; routines can be sliced into routine parts and tagged connections. Shows first-practiced date.
- WHOOP ("/whoop"): link a WHOOP account ("Sign in with WHOOP") to see recovery, HRV, sleep and strain charts; this data also feeds the coach.
- Coach ("/coach"): this coach — daily push-level recommendation plus this chat.
- Settings ("/settings"): profile, theme (light/dark), offline mode (PWA with sync queue for logging without internet), archive-cascade preference, logout.
- The round chat button right next to the bottom nav bar opens this coach chat from any page.
`.trim();

const PAGE_NAMES: Record<string, string> = {
  "/": "Training",
  "/score": "Score",
  "/stats": "Progress",
  "/skills": "Skills",
  "/routines": "Routines",
  "/whoop": "WHOOP",
  "/coach": "Coach",
  "/settings": "Settings",
};

function pageName(path: string | undefined): string | null {
  if (!path) return null;
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  if (path.startsWith("/skills/")) return "a skill detail page";
  if (path.startsWith("/routines/")) return "a routine detail page";
  return null;
}

// When `onDelta` is provided the model is streamed and each text chunk is
// forwarded as it arrives; the full reply is still returned (and persisted)
// only after the stream completes, so history behavior is unchanged.
// ---- Draft training-log entries proposed from a menu photo/text ----

// The model appends a fenced ```draft_entry block when the athlete asks to
// turn a training menu into a log entry. We parse it out of the reply, match
// its items against the athlete's LOGGABLE skills (shape children + non-shape
// skills — never a parent grouping base, same rule as the app's pickers) and
// hand the structured draft to the client, which creates the note only after
// the athlete confirms.
// One draft row = one or more skills performed together. A single skill is a
// one-element `skills` array; a connection (skills chained in sequence, e.g.
// when the athlete's "one menu row = one connection" setting is on) has
// several. Reps apply to the whole row.
export interface CoachDraftSkill {
  skillId: number;
  code: string;
  name: string;
}

// A draft row is either plain skills (one-or-more chained), a ROUTINE
// (routineId set → app item {id:-2, routineId, customSkillIds}) or a
// frequent CONNECTION (fcId set → app item {id:-3, fcId, customSkillIds}).
// For routine/connection rows `skills` holds a single display entry
// (code/name of the routine or connection; skillId is -2/-3 sentinel).
export interface CoachDraftItem {
  skills: CoachDraftSkill[];
  reps: number;
  routineId?: number;
  fcId?: number;
  customSkillIds?: number[];
}

export interface CoachDraft {
  date: string; // YYYY-MM-DD
  items: CoachDraftItem[];
  unmatched: string[]; // menu lines that couldn't be matched to a skill
  noteText: string; // leftover free text for the note content
}

const DRAFT_BLOCK_RE = /```draft_entry\s*\n([\s\S]*?)```/;

// The coach may also update the athlete's menu notation guide (users.menuGuide)
// when taught new notation — it emits the COMPLETE replacement text in a
// fenced menu_guide block. Same 10k cap as the settings PATCH route.
const MENU_GUIDE_BLOCK_RE = /```menu_guide\s*\n([\s\S]*?)```/;
const MENU_GUIDE_MAX_CHARS = 10000;

// Pulls a menu_guide block out of the reply. Returns the reply with the block
// stripped plus the new guide text (null when there is no block or it is
// empty — an empty block never wipes the guide).
export function extractMenuGuideUpdate(reply: string): {
  stripped: string;
  guide: string | null;
} {
  const m = reply.match(MENU_GUIDE_BLOCK_RE);
  if (!m) return { stripped: reply, guide: null };
  const stripped = reply.replace(MENU_GUIDE_BLOCK_RE, "").trim();
  const guide = m[1].trim().slice(0, MENU_GUIDE_MAX_CHARS);
  return { stripped, guide: guide.length > 0 ? guide : null };
}

interface LoggableSkill {
  id: number;
  code: string; // combined display code for shape children
  name: string;
  isDrill: number;
}

// Non-archived frequent connections (isDrill 2) — matchable draft rows that
// become {id:-3, fcId, customSkillIds} app items.
function loggableConnections(all: Skill[]): Skill[] {
  return all.filter((s) => s.isDrill === 2 && s.archived !== 1);
}

// Non-archived routines — matchable draft rows that become
// {id:-2, routineId, customSkillIds} app items.
function loggableRoutines(routines: Routine[]): Routine[] {
  return routines.filter((r) => r.archived !== 1);
}

// One prompt list of everything the model may reference in a draft: skills,
// drills, frequent connections, and full routines.
function loggableLibraryList(all: Skill[], routines: Routine[]): string {
  const lines = loggableSkills(all).map(
    (s) => `  ${s.isDrill === 1 ? "[drill]" : "[skill]"} code "${s.code}" — ${s.name}`,
  );
  for (const c of loggableConnections(all)) {
    lines.push(`  [connection] code "${c.code || c.name}" — ${c.name}`);
  }
  for (const r of loggableRoutines(routines)) {
    lines.push(`  [routine] code "${r.code || r.name}" — ${r.name}`);
  }
  return lines.join("\n");
}

// Flat "no parent grouping bases" list, mirroring client pickableSkills +
// skillDisplayCode: shape children show baseCode+shape, bases owning a
// non-archived shape child are excluded.
function loggableSkills(all: Skill[]): LoggableSkill[] {
  const hasShapeChildren = (id: number) =>
    all.some((s) => s.parentSkillId === id && s.archived !== 1);
  return all
    .filter(
      (s) =>
        (s.isDrill === 0 || s.isDrill === 1) &&
        s.archived !== 1 &&
        !hasShapeChildren(s.id),
    )
    .map((s) => {
      const parent = s.parentSkillId != null ? all.find((p) => p.id === s.parentSkillId) : undefined;
      const code = parent ? `${parent.code}${s.shape || s.code}` : s.code;
      return { id: s.id, code, name: s.name, isDrill: s.isDrill };
    });
}

function normalizeKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

// Parse the model's draft block (if any) into a matched CoachDraft. Returns
// null when there is no block or it is unusable. `stripped` is the reply
// text with the block removed.
export function extractDraft(
  reply: string,
  allSkills: Skill[],
  routines: Routine[] = [],
): { stripped: string; draft: CoachDraft | null } {
  const m = reply.match(DRAFT_BLOCK_RE);
  if (!m) return { stripped: reply, draft: null };
  const stripped = reply.replace(DRAFT_BLOCK_RE, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return { stripped, draft: null };
  }
  if (!parsed || typeof parsed !== "object") return { stripped, draft: null };

  const today = new Date().toISOString().substring(0, 10);
  const date =
    typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : today;

  const pool = loggableSkills(allSkills);
  const byCode = new Map<string, LoggableSkill>();
  const byName = new Map<string, LoggableSkill>();
  for (const s of pool) {
    const codeKey = normalizeKey(s.code);
    if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, s);
    const nameKey = normalizeKey(s.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, s);
  }

  // Frequent connections and routines are matchable too (by code or name);
  // they resolve to the app's routine/connection item formats.
  const connByKey = new Map<string, Skill>();
  for (const c of loggableConnections(allSkills)) {
    for (const key of [normalizeKey(c.code || ""), normalizeKey(c.name)]) {
      if (key && !connByKey.has(key)) connByKey.set(key, c);
    }
  }
  const routineByKey = new Map<string, Routine>();
  for (const r of loggableRoutines(routines)) {
    for (const key of [normalizeKey(r.code || ""), normalizeKey(r.name)]) {
      if (key && !routineByKey.has(key)) routineByKey.set(key, r);
    }
  }

  // Resolve one label (a code or name) to a routine/connection draft item.
  // Skills take precedence — checked by the caller first — so a name that
  // collides with a skill still logs the skill.
  const matchGroup = (label: string, reps: number): CoachDraftItem | null => {
    const key = normalizeKey(label);
    if (!key) return null;
    const conn = connByKey.get(key);
    if (conn) {
      return {
        skills: [{ skillId: -3, code: conn.code || conn.name, name: conn.name }],
        reps,
        fcId: conn.id,
        customSkillIds: conn.skillIds ?? [],
      };
    }
    const routine = routineByKey.get(key);
    if (routine) {
      return {
        skills: [{ skillId: -2, code: routine.code || routine.name, name: routine.name }],
        reps,
        routineId: routine.id,
        customSkillIds: routine.skillIds ?? [],
      };
    }
    return null;
  };

  const items: CoachDraftItem[] = [];
  const unmatched: string[] = [];
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    // A row is either a single "code" or a "codes" array (a connection —
    // several skills performed in sequence).
    const codes: string[] = Array.isArray(it.codes)
      ? it.codes.filter((c: unknown) => typeof c === "string" && (c as string).trim() !== "")
      : typeof it.code === "string" && it.code.trim() !== ""
        ? [it.code]
        : [];
    const name = typeof it.name === "string" ? it.name : "";
    const repsRaw = Number(it.reps);
    const reps = Number.isFinite(repsRaw) && repsRaw >= 1 ? Math.min(Math.trunc(repsRaw), 999) : 1;

    if (codes.length === 0) {
      const hit = name ? byName.get(normalizeKey(name)) : undefined;
      if (hit) {
        items.push({ skills: [{ skillId: hit.id, code: hit.code, name: hit.name }], reps });
        continue;
      }
      const group = name ? matchGroup(name, reps) : null;
      if (group) {
        items.push(group);
      } else {
        const label = name || "(unknown item)";
        unmatched.push(reps > 1 ? `${label} x${reps}` : label);
      }
      continue;
    }

    // A single-code row may be a routine or frequent connection (matched by
    // its code or name); multi-code rows stay skill-only (chained skills).
    if (codes.length === 1 && !byCode.get(normalizeKey(codes[0]))) {
      const group =
        matchGroup(codes[0], reps) ||
        (name && !byName.get(normalizeKey(name)) ? matchGroup(name, reps) : null);
      if (group) {
        items.push(group);
        continue;
      }
    }

    const matched: CoachDraftSkill[] = [];
    let allMatched = true;
    for (const code of codes) {
      const hit =
        byCode.get(normalizeKey(code)) ||
        (codes.length === 1 && name ? byName.get(normalizeKey(name)) : undefined);
      if (hit) {
        matched.push({ skillId: hit.id, code: hit.code, name: hit.name });
      } else {
        allMatched = false;
      }
    }
    if (allMatched && matched.length > 0) {
      items.push({ skills: matched, reps });
    } else {
      // Never log a mutilated connection: if ANY member of a row can't be
      // matched, the whole row is preserved verbatim in unmatched.
      const label =
        codes.join(" + ") + (name && codes.length === 1 ? ` ${name}` : "") || "(unknown item)";
      unmatched.push(reps > 1 ? `${label} x${reps}` : label);
    }
  }

  const noteText = typeof parsed.notes === "string" ? parsed.notes.trim() : "";
  if (items.length === 0 && unmatched.length === 0 && !noteText) {
    return { stripped, draft: null };
  }
  return { stripped, draft: { date, items, unmatched, noteText } };
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function coachChat(
  userId: string,
  userMessage: string,
  page?: string,
  images?: string[],
  onDelta?: (chunk: string) => void,
): Promise<{ reply: string; draft: CoachDraft | null; guideUpdated: boolean }> {
  const ctx = await buildCoachContext(userId);
  const [history, allSkills, routines, user] = await Promise.all([
    storage.getCoachMessages(userId),
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getUser(userId),
  ]);
  const recent = history.slice(-MAX_HISTORY_TURNS);

  const skillList = loggableLibraryList(allSkills, routines);

  const currentPage = pageName(page);
  const system = [
    "You are the athlete's personal trampoline coach inside their training log app.",
    "You help with two things: (1) training advice grounded ONLY in the athlete's actual data below — their training sessions with DD (degree of difficulty) totals, session ratings, notes, competition/practice scores, and WHOOP recovery/HRV/sleep/strain when available; and (2) using the app itself — explain features and where to find things using the app guide below, e.g. how to log a session, record a score, or link WHOOP.",
    "Cite concrete numbers and dates from the data when relevant. If the data doesn't cover a question, say so plainly instead of inventing details.",
    "The athlete can attach photos to their messages — you can see them. Describe or answer questions about them when asked.",
    "You cannot modify their log directly, but when the athlete sends a training menu/plan (as a photo or pasted text) and asks to add or log it, you PROPOSE a draft log entry that they confirm in the app. To do that, reply with a one-or-two sentence summary and then append EXACTLY ONE fenced code block tagged draft_entry containing ONLY JSON of this shape:",
    '```draft_entry\n{"date": "YYYY-MM-DD", "items": [{"code": "<exact code from the skill library below>", "name": "<library name>", "reps": <number>}], "notes": "<any menu lines that do not match a library skill, plus other free text>"}\n```',
    'When one menu row lists SEVERAL skills performed in sequence (a connection), emit ONE item for that row with a "codes" array instead of "code": {"codes": ["<code 1>", "<code 2>", ...], "reps": <number>} — the codes in the order performed, each an exact library code.',
    'The library below also lists the athlete\'s [routine] and [connection] entries. When a menu line names a whole routine or a saved frequent connection (by its code or name), emit ONE item with that single "code" (the routine/connection code from the library) instead of listing its member skills.',
    `For "date" use the date written on the menu if there is one, otherwise today's date. Match menu lines against the athlete's skill library below and use its EXACT codes/names; NEVER invent skills — anything you cannot confidently match goes into "notes" verbatim so nothing is lost. Only produce a draft_entry block when the athlete asks to log/add a menu; if the menu is unreadable or you cannot parse it, say so plainly instead of guessing.`,
    user?.menuRowConnections
      ? 'The athlete has set "one menu row = one connection": treat EVERY menu row that contains more than one skill as a single connection item (one item with a "codes" array per row), never as separate items.'
      : "",
    'The athlete keeps a "menu notation guide" — their own notes on what their menu abbreviations and notation mean. FOLLOW it when reading menus (it overrides your own guesses about what abbreviations mean, but codes/names in a draft must still come from the skill library). You can UPDATE this guide when the athlete teaches you notation (e.g. "cr means crash dive") or asks you to remember how their menus are written: append EXACTLY ONE fenced code block tagged menu_guide containing the COMPLETE new guide as plain text — it REPLACES the whole guide, so carry over everything still valid and add or correct the new fact. Alias lines MUST use the exact one-per-line format `alias = CODE (Skill Name)` where CODE and Skill Name come from the skill library (e.g. `cr = TJ (Tuck Jump)`) — the app displays these as skill rows in Settings; other notes are free-form lines. When you update the guide, ALWAYS say plainly in your visible reply that you updated their menu notation guide and what changed — they can review and edit it in Settings. Never emit a menu_guide block otherwise.',
    user?.menuGuide?.trim()
      ? `Current menu notation guide:\n${user.menuGuide.trim()}`
      : "The menu notation guide is currently empty.",
    skillList ? `\nAthlete's loggable skill library:\n${skillList}` : "\nThe athlete's skill library is empty — any menu items go into notes.",
    currentPage ? `The athlete is currently on the ${currentPage} page of the app.` : "",
    `\n${APP_GUIDE}`,
    `\nAthlete data:\n${ctx.text}`,
  ].filter(Boolean).join(" ");

  const userParts: ContentPart[] = [];
  if (userMessage) userParts.push({ type: "text", text: userMessage });
  for (const url of images ?? []) {
    userParts.push({ type: "image_url", image_url: { url } });
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...recent.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user", content: userParts.length === 1 && userMessage ? userMessage : userParts },
  ];

  let reply: string;
  try {
    if (onDelta) {
      const stream = await openai.chat.completions.create({
        model: MODEL,
        messages,
        max_completion_tokens: 4096,
        stream: true,
      });
      let acc = "";
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? "";
        if (delta) {
          acc += delta;
          onDelta(delta);
        }
      }
      reply = acc.trim();
    } else {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages,
        max_completion_tokens: 4096,
      });
      reply = (response.choices[0]?.message?.content ?? "").trim();
    }
  } catch (err) {
    console.error("[coach] chat failed:", err);
    throw new CoachUnavailableError();
  }
  if (!reply) throw new CoachUnavailableError();

  // Pull any draft_entry block out of the reply and match it against the
  // athlete's real loggable skills; the visible reply has the block stripped.
  const { stripped, draft } = extractDraft(reply, allSkills, routines);
  // Pull any menu_guide block (the coach updating the athlete's notation
  // guide) and apply it before persisting the visible reply.
  const guideResult = extractMenuGuideUpdate(stripped || reply);
  let guideUpdated = false;
  if (guideResult.guide !== null) {
    await storage.updateUserMenuGuide(userId, guideResult.guide);
    guideUpdated = true;
  }
  const finalReply = guideResult.stripped || stripped || reply;

  // Persist both turns only after a successful model reply so a failed send
  // can simply be retried without duplicate user messages in history.
  // Photos go to object storage (DB keeps only refs); if the upload fails we
  // fall back to the legacy inline data-URL storage so the chat isn't lost.
  let storedImages: string | null = null;
  if (images && images.length > 0) {
    try {
      storedImages = JSON.stringify(await storeCoachImages(userId, images));
    } catch (err) {
      console.error("[coach] image upload to object storage failed, storing inline:", err);
      storedImages = JSON.stringify(images);
    }
  }
  await storage.createCoachMessage(userId, "user", userMessage, {
    images: storedImages,
  });
  await storage.createCoachMessage(userId, "assistant", finalReply, {
    draft: draft ? JSON.stringify(draft) : null,
  });

  return { reply: finalReply, draft, guideUpdated };
}

// ---- Conversational menu-chat (multi-turn, image-scoped, no streaming) ----
// Used by the menu popup: the athlete uploads a cropped menu photo and chats
// with the AI to clarify unmatched items, rep counts, etc. The AI replies in
// plain text until it is ready to produce a final draft_entry block.

export interface MenuChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS_BLOCK_RE = /```suggestions\s*\n([\s\S]*?)```/;

function extractSuggestions(raw: string): { cleaned: string; suggestions: string[] } {
  const m = raw.match(SUGGESTIONS_BLOCK_RE);
  if (!m) return { cleaned: raw, suggestions: [] };
  const cleaned = raw.replace(SUGGESTIONS_BLOCK_RE, "").trim();
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) {
      return { cleaned, suggestions: parsed.filter((s): s is string => typeof s === "string").slice(0, 6) };
    }
  } catch {}
  return { cleaned, suggestions: [] };
}

// Generate 2-4 quick-reply chip suggestions from the last assistant reply.
// Runs as a lightweight parallel call after the main stream finishes.
export async function generateSuggestions(reply: string, hasDraft: boolean): Promise<string[]> {
  if (hasDraft || !reply.trim()) return [];
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You generate 2–4 short quick-reply suggestions for an athlete chatting with their trampoline coach AI. Output ONLY a JSON array of strings, each under 50 characters. No other text.",
        },
        {
          role: "user",
          content: `Coach just said:\n"${reply.slice(0, 600)}"\n\nSuggest 2–4 likely short replies the athlete would tap:`,
        },
      ],
      max_completion_tokens: 120,
    });
    const raw = (res.choices[0]?.message?.content ?? "").trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 50)
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function menuChat(
  userId: string,
  cropDataUrl: string,
  messages: MenuChatMessage[],
): Promise<{ reply: string; draft: CoachDraft | null; suggestions: string[]; guideUpdated: boolean }> {
  const [allSkills, routines, user] = await Promise.all([
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getUser(userId),
  ]);

  const skillList = loggableLibraryList(allSkills, routines);

  const today = new Date().toISOString().substring(0, 10);

  const system = [
    "You are helping an athlete turn a photo of their training menu into a structured practice list.",
    "Your job is conversational: read the menu photo (already cropped to the relevant area), then ask the athlete short clarifying questions for anything you are unsure about — skills that are not in their library, ambiguous rep counts, shorthand you don't recognise, etc.",
    "When you have enough information to produce a complete list, end your reply with a fenced draft_entry block in this exact JSON shape:",
    '```draft_entry\n{"date":"YYYY-MM-DD","items":[{"code":"<exact library code>","reps":<number>}],"notes":"<unmatched lines verbatim, comma-separated>"}\n```',
    'For connections (skills chained in sequence) use a "codes" array: {"codes":["<code1>","<code2>"],"reps":<number>}.',
    'The library also lists the athlete\'s [routine] and [connection] entries — when a menu line names a whole routine or saved frequent connection, emit ONE item with that single "code" instead of listing its member skills.',
    `For "date" use the date on the menu if visible, otherwise today's date (${today}).`,
    "NEVER invent skills. Only use codes that appear exactly in the athlete's skill library below.",
    "Ask questions one at a time; keep replies short and conversational.",
    "EVERY conversational reply (any reply that does NOT contain a draft_entry block) MUST end with a suggestions block — never omit it — with 2–4 short answers the athlete is most likely to tap — the most probable answers to your question, common clarifications, or useful shortcuts. Each suggestion must be under 50 characters. Format:",
    '```suggestions\n["answer 1","answer 2","answer 3"]\n```',
    user?.menuRowConnections
      ? 'The athlete has set "one menu row = one connection": treat every row containing more than one skill as a single connection item.'
      : "",
    'The athlete keeps a "menu notation guide" — their own notes on what their menu abbreviations and shorthand mean. TAKE NOTES from this chat: whenever the athlete tells you or confirms what a menu abbreviation means (e.g. clarifies "BS means back tuck" or "Bar = Barani"), UPDATE the guide so you never have to ask again on a future scan. To update it, append EXACTLY ONE fenced code block tagged menu_guide containing the COMPLETE new guide as plain text — it REPLACES the whole guide, so carry over everything still valid and add or correct the new fact. Alias lines MUST use the exact one-per-line format `alias = CODE (Skill Name)` where CODE and Skill Name come from the skill library below (e.g. `BS = 4-o (Back Somersault)`); other notation notes are free-form lines. Briefly say in your visible reply when you saved a note. A menu_guide block may appear alongside your draft_entry or suggestions block. Never emit a menu_guide block unless you actually learned or changed something.',
    user?.menuGuide?.trim()
      ? `Current menu notation guide (follow this when reading the menu):\n${user.menuGuide.trim()}`
      : "The menu notation guide is currently empty.",
    skillList ? `Athlete's skill library:\n${skillList}` : "The athlete's skill library is empty — list all menu items as unmatched.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // First user turn includes the image; subsequent turns are text-only.
  const isFirstTurn = messages.length === 1 && messages[0].role === "user";

  type OAIMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string | ContentPart[] }
    | { role: "assistant"; content: string };

  const oaiMessages: OAIMessage[] = [{ role: "system", content: system }];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (i === 0 && m.role === "user") {
      oaiMessages.push({
        role: "user",
        content: [
          { type: "image_url" as const, image_url: { url: cropDataUrl } },
          { type: "text" as const, text: m.content || "Please read this training menu and help me turn it into a practice list." },
        ],
      });
    } else {
      oaiMessages.push({ role: m.role, content: m.content });
    }
  }

  let reply: string;
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: oaiMessages,
      max_completion_tokens: 1024,
    });
    reply = (response.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    console.error("[coach] menu-chat failed:", err);
    throw new CoachUnavailableError();
  }

  // Pull any menu_guide block (the AI taking notes on the athlete's notation)
  // and apply it before stripping the rest of the reply, so learned notation
  // persists to Settings and is followed on the next scan.
  const guideResult = extractMenuGuideUpdate(reply);
  let guideUpdated = false;
  if (guideResult.guide !== null) {
    await storage.updateUserMenuGuide(userId, guideResult.guide);
    guideUpdated = true;
  }
  const base = guideResult.stripped || reply;
  const { draft } = extractDraft(base, allSkills, routines);
  const { cleaned, suggestions } = extractSuggestions(base);
  // Use cleaned reply (suggestions block stripped) unless it was a draft turn
  const finalReply = draft ? base : cleaned;
  // Guarantee tappable choices on every conversational turn: if the model
  // forgot its suggestions block, generate quick replies as a fallback.
  let finalSuggestions = draft ? [] : suggestions;
  if (!draft && finalSuggestions.length === 0) {
    finalSuggestions = await generateSuggestions(cleaned, false);
  }
  return { reply: finalReply, draft, suggestions: finalSuggestions, guideUpdated };
}

// ---- Direct menu-photo parsing (no chat history, no streaming) ----
// Used by the note-dialog "read menu photo" button to turn a photo of the
// athlete's training menu directly into practice-list items without going
// through the coach chat. Returns the matched draft (or null).

// ---- Veriflite ToF screenshot parsing ----

// Reads a Veriflite screenshot and extracts the per-jump time-of-flight
// values (in seconds, jump order). Returns the values for user review —
// nothing is saved here.
export async function parseTofScreenshot(
  images: string[],
): Promise<{ tofValues: number[]; preJumpTof: number | null; date: string | null }> {
  const system = [
    "You are reading a screenshot from the Veriflite trampoline app (or a similar time-of-flight measuring app).",
    "Extract the per-jump time-of-flight values for ONE routine, in jump order (jump 1 first). Values are in seconds, typically between 0.8 and 2.5 (e.g. 1.52). There are at most 10 jumps.",
    "If the screenshot shows a total plus individual jumps, return only the individual jump values, NOT the total.",
    "Veriflite screenshots often include a 'Difference' column: each row's ToF minus the previous jump's ToF. Row 1's difference is relative to the in-bounce jump taken right BEFORE the routine, so that pre-jump's ToF = (row 1 ToF) - (row 1 difference); e.g. ToF 1.595 with difference -0.115 means preJump = 1.710. Compute it (3 decimals) and return it as preJump. If there is no difference value for row 1, return preJump null.",
    "Also extract the session date if visible in the screenshot.",
    'Respond with JSON only: {"tofValues":[<numbers in jump order>],"preJump":<number or null>,"date":"YYYY-MM-DD" or null}. If you cannot find any per-jump values, return {"tofValues":[],"preJump":null,"date":null}.',
  ].join(" ");

  const userParts: ContentPart[] = [
    { type: "text", text: "Extract the per-jump time-of-flight values from this screenshot." },
    ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];

  let raw: string;
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[tof] parse-screenshot failed:", err);
    throw new CoachUnavailableError("Screenshot reading is unavailable right now.");
  }

  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed.tofValues)
      ? parsed.tofValues
          .map((v: unknown) => Number(v))
          .filter((v: number) => Number.isFinite(v) && v > 0 && v <= 30)
          .slice(0, 10)
      : [];
    const preRaw = Number(parsed.preJump);
    const preJumpTof =
      Number.isFinite(preRaw) && preRaw > 0 && preRaw <= 30
        ? Math.round(preRaw * 1000) / 1000
        : null;
    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null;
    return { tofValues: values, preJumpTof, date };
  } catch {
    throw new CoachUnavailableError("Could not read the screenshot.");
  }
}

export async function parseMenuPhoto(
  userId: string,
  images: string[],
  note?: string,
): Promise<{ draft: CoachDraft | null }> {
  const [allSkills, routines, user] = await Promise.all([
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getUser(userId),
  ]);

  const skillList = loggableLibraryList(allSkills, routines);

  const today = new Date().toISOString().substring(0, 10);

  const system = [
    "You are reading an athlete's training menu photo and extracting a structured practice list.",
    "Match every item you see against the athlete's skill library below using EXACT codes and names. NEVER invent skills.",
    "Respond with ONLY a fenced draft_entry code block (no other text) containing JSON of this shape:",
    '```draft_entry\n{"date":"YYYY-MM-DD","items":[{"code":"<exact library code>","name":"<library name>","reps":<number>}],"notes":"<unmatched lines verbatim, comma-separated>"}\n```',
    'When a menu row lists several skills in sequence (a connection), emit ONE item for that row with a "codes" array: {"codes":["<code1>","<code2>"],"reps":<number>}.',
    'The library also lists the athlete\'s [routine] and [connection] entries — when a menu line names a whole routine or saved frequent connection, emit ONE item with that single "code" instead of listing its member skills.',
    `For "date" use the date written on the menu if present, otherwise today's date (${today}).`,
    user?.menuRowConnections
      ? 'The athlete has set "one menu row = one connection": treat every row containing more than one skill as a single connection item.'
      : "",
    user?.menuGuide?.trim()
      ? `Menu notation guide (follow this when reading the menu):\n${user.menuGuide.trim()}`
      : "",
    skillList ? `Athlete's skill library:\n${skillList}` : "The athlete's skill library is empty — put all menu items in notes.",
    note?.trim() ? `Athlete's extra note about this menu:\n${note.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userParts: ContentPart[] = [
    { type: "text", text: "Read this training menu photo and extract a draft practice list." },
    ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];

  let reply: string;
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts },
      ],
      max_completion_tokens: 2048,
    });
    reply = (response.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    console.error("[coach] parse-menu failed:", err);
    throw new CoachUnavailableError();
  }

  const { draft } = extractDraft(reply, allSkills, routines);
  return { draft };
}
