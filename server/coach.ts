// AI coach: builds a compact per-user training + WHOOP context and asks a
// Replit-managed OpenAI model (no user API key) for (a) a daily "push level"
// recommendation and (b) grounded answers in the coach chat.
//
// The model only ever sees a summarized context — recent session DD totals,
// ratings, scores and WHOOP recovery/HRV/sleep/strain — never raw dumps.

import OpenAI from "openai";
import { storage } from "./storage";
import { storeCoachImages, deleteCoachImages, type CoachImageRef } from "./coach-images";
import { getWhoopDashboardDataCached, WhoopNotConnectedError } from "./whoop";
import { resolveClientDate, pickTodayRecovery } from "./coach-dates";
import type { Skill, Routine, NoteResponse } from "@shared/schema";
import { sanitizeDeductionValues } from "@shared/execution";
import { parseNoteSkills, calculateTotalDD } from "@shared/dd";
import {
  normalizeKey,
  loggableSkills,
  loggableConnections,
  loggableRoutines,
  extractSkillProposal,
  extractPointProposal,
  type LoggableSkill,
  type CoachSkillProposal,
  type CoachPointProposal,
} from "./coach-proposals";

export type { CoachSkillProposal, CoachPointProposal } from "./coach-proposals";

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

// Thrown when the athlete stops a streaming reply mid-flight. The partial
// reply is DISCARDED: neither the user turn nor the assistant turn is
// persisted, so a stopped question can simply be re-asked (same contract as
// a failed send).
export class CoachStoppedError extends Error {
  constructor() {
    super("Coach reply stopped by the user.");
    this.name = "CoachStoppedError";
  }
}

// ---- Server-side DD computation (mirrors client training-utils) ----

export interface CoachContext {
  whoopLinked: boolean;
  text: string; // human-readable summary handed to the model
  todayRecovery: number | null;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return n == null ? "-" : n.toFixed(digits);
}

export async function buildCoachContext(userId: string, clientDate?: unknown): Promise<CoachContext> {
  const [notes, skills, routines, scores] = await Promise.all([
    storage.getNotes(userId, { limit: 60 }),
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getScores(userId),
  ]);

  const today = new Date();
  // The athlete's LOCAL calendar day (client-reported), not the server's UTC
  // day — east-of-UTC athletes are otherwise a day behind all morning.
  const todayKey = resolveClientDate(clientDate);
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
    const dd = calculateTotalDD(parseNoteSkills(note.skills), skills, routines, note.date);
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
    todayRecovery = pickTodayRecovery(whoop.recovery, todayKey)?.score ?? null;
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

// ---- Guardrails shared across every coach-facing prompt ----

// Non-negotiable safety rules injected into the main chat, menu chat, and
// push recommendation prompts. Every prompt also states the closed-list
// (deny-by-default) rule directly: the coach may ONLY do what its prompt
// explicitly permits, everything else must be refused.
const COACH_SAFETY_RULES = [
  "SAFETY RULES (non-negotiable, apply to every reply):",
  "- Never suggest, recommend, or reference skills that are not already in the athlete's skill library.",
  "- Never give trampoline technique tips, form corrections, progressions, or skill advice of your own — technique belongs to the athlete's real coach.",
  "- If the athlete mentions pain or a possible injury: advise caution — suggest light training, or rest plus seeing a physiotherapist or doctor. Never coach them through pain.",
  "- Never give medical or medication advice; refer the athlete to a healthcare professional instead.",
  '- Defer to the athlete\'s real coach: when the athlete states their coach told them something (e.g. "my coach said to work on X"), take that statement as given, defer to it without question, and never offer a conflicting view. Do not infer or evaluate the real coach\'s intent beyond what the athlete directly states.',
  "- Low WHOOP recovery is guidance to WEIGH alongside training load, not a hard block — it alone never forbids recommending a push day.",
].join("\n");

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

export async function getPushRecommendation(
  userId: string,
  clientDate?: unknown,
  forceRefresh = false,
): Promise<PushRecommendation> {
  const dateKey = resolveClientDate(clientDate);
  // The cache key includes today's recovery state so the card regenerates
  // the moment WHOOP syncs the day's recovery — a rec computed at 7am
  // before the sync must not survive until midnight showing yesterday's
  // numbers. The WHOOP dashboard data has its own 5-minute cache, so this
  // pre-check stays cheap.
  let recFingerprint: string;
  try {
    const whoop = await getWhoopDashboardDataCached(userId, 14);
    const todayRec = pickTodayRecovery(whoop.recovery, dateKey);
    recFingerprint = todayRec
      ? `${todayRec.date}:${todayRec.score == null ? "-" : Math.round(todayRec.score)}`
      : "none";
  } catch (err) {
    recFingerprint = err instanceof WhoopNotConnectedError ? "nolink" : "unavail";
  }
  const cacheKey = `${userId}:${dateKey}:${recFingerprint}`;
  if (!forceRefresh) {
    const hit = pushCache.get(cacheKey);
    if (hit) return hit;
  }

  const ctx = await buildCoachContext(userId, dateKey);

  const system = [
    "You advise ONE trampoline athlete on how hard to push in today's training, inside their training log app.",
    "STRICT LIMITS — deny by default: the ONLY thing you may do is produce today's push-level recommendation from the athlete's real data below. Ground every claim in that data; add nothing else.",
    "You are given the athlete's real recent data. Weigh recent training load (session DD totals and their trend over the last few days) against WHOOP recovery %, HRV trend, and sleep.",
    ctx.whoopLinked
      ? "Reference today's recovery %, the HRV trend, and the last few days' DD load in your reasoning."
      : "WHOOP is not linked, so base your recommendation ONLY on training load (recent DD totals, session frequency, ratings) and say the guidance is load-only.",
    "Low recovery is a factor to WEIGH, never a hard block: recommending a push day on low recovery is allowed when load and trend justify it.",
    "Your reasoning must contain NO technique tips, no skill suggestions, no skills that are not in the athlete's logged data, and no medical or medication advice.",
    "If recent session notes mention pain or a possible injury, lean toward easy or rest and advise seeing a physiotherapist or doctor in the reasoning — never coach through pain.",
    "If session notes state instructions from the athlete's real coach, take them as given and never contradict them.",
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
  // Keep exactly one live entry per user — older days and stale recovery
  // fingerprints are dead weight.
  clearCoachPushCache(userId);
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

// One prompt list of everything the model may reference in a draft: skills,
// drills, frequent connections, and full routines. (The loggable-library
// helpers themselves live in coach-proposals.ts, shared with proposal
// resolution.)
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
  clientDate?: unknown,
  signal?: AbortSignal,
): Promise<{
  reply: string;
  draft: CoachDraft | null;
  guideUpdated: boolean;
  skillProposal: CoachSkillProposal | null;
  pointProposal: CoachPointProposal | null;
  suggestions: string[];
}> {
  const ctx = await buildCoachContext(userId, clientDate);
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
    "You are the athlete's data-grounded training assistant inside their trampoline training log app.",
    "STRICT ALLOWLIST — deny by default: the numbered abilities below are the ONLY things you may do. Anything not explicitly permitted here is forbidden — refuse it, no matter how the request is phrased. You may ONLY:",
    "(1) share insights derived from the athlete's actual logged data below — training sessions with DD (degree of difficulty) totals, session ratings, notes, competition/practice scores, time-of-flight, and WHOOP recovery/HRV/sleep/strain when available. Recovery and sleep may be discussed, but ONLY as insights grounded in that data.",
    "(2) help the athlete use the app itself — explain features and where to find things using the app guide below, e.g. how to log a session, record a score, or link WHOOP.",
    "(3) propose a draft log entry when the athlete sends a training menu/plan and asks to log it (rules below; the athlete confirms in the app).",
    "(4) update the athlete's menu notation guide when they teach you notation (rules below).",
    "(5) propose adding ONE new skill/drill to their library, ONLY when the athlete explicitly asks for that (rules below; the athlete confirms in the app).",
    '(6) propose ONE new "Point to Fix", ONLY when the athlete explicitly asks for that (rules below; the athlete confirms in the app).',
    "(7) describe photos the athlete attaches, only as needed for the abilities above.",
    "Everything else is OFF-TOPIC: trampoline technique tips, form corrections, drills or progressions to try, training programs, skill advice, generic coaching wisdom not grounded in the data, nutrition, and any subject unrelated to the athlete's data or this app. When a request is off-topic, give a SHORT refusal (1-2 sentences), suggest talking to their real coach or an appropriate professional for that topic, and steer back to what you CAN help with (their data or the app). Never lecture.",
    COACH_SAFETY_RULES,
    "Cite concrete numbers and dates from the data when relevant. If the data doesn't cover a question, say so plainly instead of inventing details.",
    "You cannot modify their log directly, but when the athlete sends a training menu/plan (as a photo or pasted text) and asks to add or log it, you PROPOSE a draft log entry that they confirm in the app. To do that, reply with a one-or-two sentence summary and then append EXACTLY ONE fenced code block tagged draft_entry containing ONLY JSON of this shape:",
    '```draft_entry\n{"date": "YYYY-MM-DD", "items": [{"code": "<exact code from the skill library below>", "name": "<library name>", "reps": <number>}], "notes": "<any menu lines that do not match a library skill, plus other free text>"}\n```',
    'When one menu row lists SEVERAL skills performed in sequence (a connection), emit ONE item for that row with a "codes" array instead of "code": {"codes": ["<code 1>", "<code 2>", ...], "reps": <number>} — the codes in the order performed, each an exact library code.',
    'The library below also lists the athlete\'s [routine] and [connection] entries. When a menu line names a whole routine or a saved frequent connection (by its code or name), emit ONE item with that single "code" (the routine/connection code from the library) instead of listing its member skills.',
    `For "date" use the date written on the menu if there is one, otherwise today's date. Match menu lines against the athlete's skill library below and use its EXACT codes/names; NEVER invent skills — anything you cannot confidently match goes into "notes" verbatim so nothing is lost. Only produce a draft_entry block when the athlete asks to log/add a menu; if the menu is unreadable or you cannot parse it, say so plainly instead of guessing.`,
    user?.menuRowConnections
      ? 'The athlete has set "one menu row = one connection": treat EVERY menu row that contains more than one skill as a single connection item (one item with a "codes" array per row), never as separate items.'
      : "",
    'The athlete keeps a "menu notation guide" — their own notes on what their menu abbreviations and notation mean. FOLLOW it when reading menus (it overrides your own guesses about what abbreviations mean, but codes/names in a draft must still come from the skill library). You can UPDATE this guide when the athlete teaches you notation (e.g. "cr means crash dive") or asks you to remember how their menus are written: append EXACTLY ONE fenced code block tagged menu_guide containing the COMPLETE new guide as plain text — it REPLACES the whole guide, so carry over everything still valid and add or correct the new fact. Alias lines MUST use the exact one-per-line format `alias = CODE (Skill Name)` where CODE and Skill Name come from the skill library (e.g. `cr = TJ (Tuck Jump)`) — the app displays these as skill rows in Settings; other notes are free-form lines. When you update the guide, ALWAYS say plainly in your visible reply that you updated their menu notation guide and what changed — they can review and edit it in Settings. Never emit a menu_guide block otherwise.',
    'Adding a skill/drill to the library (ability 5): ONLY when the athlete\'s LATEST message explicitly asks you to add a new skill or drill to their library (e.g. "add crash dive as a drill"), reply with one short sentence and append EXACTLY ONE fenced code block tagged skill_proposal containing ONLY JSON: {"name": "<skill name>", "code": "<short code in the style of the library codes>", "difficulty": <DD number, use 0 for drills>, "type": "skill" or "drill"}. Propose EXACTLY what the athlete asked for — never a different or additional skill, and NEVER emit this block unprompted or as a suggestion. Nothing is saved until the athlete confirms the card shown in the app. If the library already has an entry with that name or code, say so plainly instead of emitting a block.',
    'Adding a "Point to Fix" (ability 6): ONLY when the athlete\'s LATEST message explicitly asks to add a point to fix (e.g. "add a point to fix: keep arms up on 4-o"), reply with one short sentence and append EXACTLY ONE fenced code block tagged point_proposal containing ONLY JSON: {"name": "<the point text, from the athlete\'s words>", "skills": ["<exact library code or name>", ...], "routines": ["<exact routine code or name>", ...], "category": "General"|"Forward"|"Backward"|"Twisting"|"Connection"|"Landing"}. Link skills/routines ONLY when the athlete names ones that exist in the library below — otherwise leave those arrays empty; never invent links. Pick the closest category (default "General"; it applies when no skills/routines are linked). Nothing is saved until the athlete confirms the card shown in the app. NEVER emit this block unprompted.',
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
      // `signal` aborts the upstream OpenAI stream when the athlete taps
      // Stop (the SSE client disconnects), so tokens stop being generated
      // and billed server-side too.
      const stream = await openai.chat.completions.create(
        {
          model: MODEL,
          messages,
          max_completion_tokens: 4096,
          stream: true,
        },
        { signal },
      );
      let acc = "";
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? "";
        if (delta) {
          acc += delta;
          onDelta(delta);
        }
      }
      if (signal?.aborted) throw new CoachStoppedError();
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
    // A stop (client disconnect) surfaces either as our own CoachStoppedError
    // or as the SDK's abort error — both mean "discard, don't persist".
    if (err instanceof CoachStoppedError || signal?.aborted) {
      throw new CoachStoppedError();
    }
    console.error("[coach] chat failed:", err);
    throw new CoachUnavailableError();
  }
  // Cancellation is a transaction boundary: a stop must persist NOTHING, so
  // re-check the signal immediately before every side effect below (the
  // abort can land while any of these awaits is in flight).
  const ensureNotStopped = () => {
    if (signal?.aborted) throw new CoachStoppedError();
  };
  ensureNotStopped();
  if (!reply) throw new CoachUnavailableError();

  // Pull any draft_entry block out of the reply and match it against the
  // athlete's real loggable skills; the visible reply has the block stripped.
  const { stripped, draft } = extractDraft(reply, allSkills, routines);
  // Pull any menu_guide block (the coach updating the athlete's notation
  // guide); the update itself is deferred to the single commit below.
  const guideResult = extractMenuGuideUpdate(stripped || reply);
  const guideUpdated = guideResult.guide !== null;
  let working = guideResult.stripped || stripped || reply;

  // Confirm-first proposals (skill addition / point to fix), emitted only on
  // the athlete's explicit request. Blocks are stripped from the visible
  // reply; the parsed proposal rides along for the client's confirmation
  // card. Nothing is saved here.
  const skillRes = extractSkillProposal(working, allSkills);
  working =
    skillRes.stripped ||
    (skillRes.proposal ? "Here's my proposed addition — review and confirm below." : working);
  const pointRes = extractPointProposal(working, allSkills, routines);
  working =
    pointRes.stripped ||
    (pointRes.proposal ? "Here's the proposed Point to Fix — review and confirm below." : working);
  const finalReply = working;

  // ---- Commit boundary ----
  // Everything above is read-only. All database writes for this turn (the
  // optional menu-guide update + both message rows) happen in ONE
  // transaction, guarded by ONE final stop check right before it. Before the
  // commit a stop persists nothing; after it the reply is committed and a
  // late abort is ignored. The only pre-commit side effect is the photo
  // upload to object storage — a stop there can at worst orphan an
  // unreferenced blob, never visible state.
  let storedImages: string | null = null;
  // Uploaded blobs are the one pre-commit side effect; if a stop lands after
  // the upload but before the commit, they are deleted again (compensation),
  // so cancellation leaves no durable state anywhere.
  let uploadedRefs: CoachImageRef[] = [];
  let suggestions: string[] = [];
  try {
    ensureNotStopped();
    if (images && images.length > 0) {
      try {
        uploadedRefs = await storeCoachImages(userId, images);
        storedImages = JSON.stringify(uploadedRefs);
      } catch (err) {
        console.error("[coach] image upload to object storage failed, storing inline:", err);
        uploadedRefs = [];
        storedImages = JSON.stringify(images);
      }
    }
    const proposals =
      skillRes.proposal || pointRes.proposal
        ? JSON.stringify({
            ...(skillRes.proposal ? { skill: skillRes.proposal } : {}),
            ...(pointRes.proposal ? { point: pointRes.proposal } : {}),
          })
        : null;
    // Quick-reply chips are generated before the save so they persist on the
    // message row — reopening the chat re-shows them (they used to live only in
    // the client's memory). Card turns (draft/proposal) skip chips because the
    // card's confirm/dismiss IS the next action. generateSuggestions never throws.
    suggestions = await generateSuggestions(
      finalReply,
      !!draft || !!skillRes.proposal || !!pointRes.proposal,
    );
    ensureNotStopped();
    await storage.commitCoachExchange(userId, {
      menuGuide: guideResult.guide,
      userMessage: { content: userMessage, images: storedImages },
      assistantMessage: {
        content: finalReply,
        draft: draft ? JSON.stringify(draft) : null,
        proposals,
        suggestions: suggestions.length > 0 ? JSON.stringify(suggestions) : null,
      },
    });
  } catch (err) {
    if (err instanceof CoachStoppedError && uploadedRefs.length > 0) {
      // Stopped after upload but before commit — remove the now-orphaned
      // blobs so cancellation truly persists nothing.
      await deleteCoachImages(uploadedRefs);
    }
    throw err;
  }

  return {
    reply: finalReply,
    draft,
    guideUpdated,
    skillProposal: skillRes.proposal,
    pointProposal: pointRes.proposal,
    suggestions,
  };
}

// ---- Conversational menu-chat (multi-turn, image-scoped, no streaming) ----
// Used by the menu popup: the athlete uploads a cropped menu photo and chats
// with the AI to clarify unmatched items, rep counts, etc. The AI replies in
// plain text until it is ready to produce a final draft_entry block.

export interface MenuChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const MENU_CHAT_OPENING_TEXT =
  "Please read this training menu and help me turn it into a practice list.";

export type MenuChatModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string };

// Builds the model message list for a menu-chat turn. The client only keeps
// the visible bubbles in its state — the synthetic opening user turn (which
// carried the photo) is dropped, so follow-up histories arrive starting with
// the assistant's first question. The photo must be re-attached on EVERY
// call: when the history opens with a user message, merge the image into it;
// otherwise re-insert the opening image turn ahead of the history. Without
// this, the model has no image on follow-up turns and asks the athlete to
// re-upload the menu.
export function buildMenuChatMessages(
  system: string,
  cropDataUrl: string,
  messages: MenuChatMessage[],
): MenuChatModelMessage[] {
  const out: MenuChatModelMessage[] = [{ role: "system", content: system }];
  const imageTurn = (text: string): MenuChatModelMessage => ({
    role: "user",
    content: [
      { type: "image_url" as const, image_url: { url: cropDataUrl } },
      { type: "text" as const, text },
    ],
  });
  const rest = messages[0]?.role === "user" ? messages.slice(1) : messages;
  out.push(
    messages[0]?.role === "user"
      ? imageTurn(messages[0].content || MENU_CHAT_OPENING_TEXT)
      : imageTurn(MENU_CHAT_OPENING_TEXT),
  );
  for (const m of rest) out.push({ role: m.role, content: m.content });
  return out;
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
    "STRICT ALLOWLIST — deny by default: the ONLY things you may do in this chat are read the menu photo, ask short clarifying questions about it, update the athlete's menu notation guide, and emit the draft_entry/suggestions blocks described below. Anything else — technique tips, skill advice, training or medical questions, off-topic chat — gets a one-sentence refusal that suggests asking their real coach or an appropriate professional, then return to the menu.",
    COACH_SAFETY_RULES,
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

  const oaiMessages = buildMenuChatMessages(system, cropDataUrl, messages);

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

// ---- Judges' execution sheet parsing ----

// Reads a photo of a trampoline judges' execution deduction sheet. Each
// athlete block shows one or two rows — R1 (routine 1) and optionally R2 —
// with up to 11 whole numbers in TENTHS of a point: 10 per-skill deductions
// followed by the landing deduction (e.g. "2" = 0.2, "20" = 2.0; a final "0"
// means a clean landing). Returns rows in tenths for user review — nothing
// is saved here.
export async function parseExecutionSheet(
  images: string[],
): Promise<{
  rows: { label: string; deductions: number[]; landing: number | null }[];
  date: string | null;
}> {
  const system = [
    "You are reading a photo of a trampoline judges' execution deduction sheet.",
    "It lists rows labeled R1 (routine 1) and sometimes R2 (routine 2). Each complete row has 11 whole numbers, all in TENTHS of a point: the first 10 are the per-skill execution deductions (usually 0-9), and the 11th is the landing deduction (0-20, where 20 means 2.0 points and a final 0 means a clean landing).",
    "An interrupted routine may show fewer than 11 numbers — return exactly the numbers printed, in order, without padding.",
    "Return the numbers EXACTLY as printed (whole numbers in tenths). Do NOT convert them to points.",
    "IGNORE any score summary lines containing letters like E, D, H, T with decimal values (e.g. 'E 16.0 D 9.0 H 9.50 T 15.250') — those are not deduction rows.",
    "If the sheet shows multiple athletes, read only the most prominent/centered athlete block.",
    "Also extract the date if visible.",
    'Respond with JSON only: {"rows":[{"label":"R1","values":[<whole numbers in printed order>]},{"label":"R2","values":[...]}],"date":"YYYY-MM-DD" or null}. Include only the rows actually present. If you cannot find any deduction rows, return {"rows":[],"date":null}.',
  ].join(" ");

  const userParts: ContentPart[] = [
    { type: "text", text: "Extract the execution deduction rows from this judges' sheet photo." },
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
    console.error("[execution] parse-sheet failed:", err);
    throw new CoachUnavailableError("Photo reading is unavailable right now.");
  }

  try {
    const parsed = JSON.parse(raw);
    const rows: { label: string; deductions: number[]; landing: number | null }[] = [];
    if (Array.isArray(parsed.rows)) {
      for (const row of parsed.rows.slice(0, 2)) {
        const sanitized = sanitizeDeductionValues(row?.values);
        if (!sanitized) continue;
        const label =
          typeof row?.label === "string" && /^R[12]$/i.test(row.label.trim())
            ? row.label.trim().toUpperCase()
            : `R${rows.length + 1}`;
        rows.push({ label, ...sanitized });
      }
    }
    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null;
    return { rows, date };
  } catch {
    throw new CoachUnavailableError("Could not read the sheet photo.");
  }
}

// ---- Competition scoresheet parsing ----

// Reads a photo of a competition scoresheet and extracts the per-routine
// score lines (E/D/H/T and the routine total) plus the competition header
// (name, round) and date when visible. Values are in points as printed.
export async function parseScoreSheet(
  images: string[],
): Promise<{
  routines: {
    label: string;
    execution: number | null;
    difficulty: number | null;
    horizontal: number | null;
    timeOfFlight: number | null;
    total: number | null;
  }[];
  competitionName: string | null;
  round: "prelims" | "final" | null;
  date: string | null;
}> {
  const system = [
    "You are reading a photo of a trampoline competition scoresheet or results sheet.",
    "It shows one or two routine score lines labeled R1 (routine 1) and sometimes R2 (routine 2), like 'R1 E 16.0 D 9.0 H 9.50 T 15.250 40.750'.",
    "E = execution score (0-20), D = difficulty (may be BLANK for a set/compulsory routine — return null then), H = horizontal displacement score (0-10), T = time of flight in seconds (about 10-20). The last number on the line is that routine's total score.",
    "A value like 'Σ 89.400' is the sum across routines — do NOT treat it as a routine total.",
    "IGNORE rows of small whole numbers without letters (e.g. 'R1 1 2 2 2 3 ...') — those are raw deduction rows, not scores.",
    "If the sheet shows multiple athletes, read only the most prominent/centered athlete block.",
    "Also extract the competition name, the round if identifiable (qualification/preliminary vs final), and the date, when visible.",
    'Respond with JSON only: {"routines":[{"label":"R1","execution":16.0,"difficulty":9.0 or null,"horizontal":9.5,"timeOfFlight":15.25,"total":40.75}],"competitionName":"..." or null,"round":"prelims"|"final" or null,"date":"YYYY-MM-DD" or null}. Include only routines actually present; use null for unreadable values. If nothing is readable, return {"routines":[],"competitionName":null,"round":null,"date":null}.',
  ].join(" ");

  const userParts: ContentPart[] = [
    { type: "text", text: "Extract the routine scores from this scoresheet photo." },
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
    console.error("[score] parse-sheet failed:", err);
    throw new CoachUnavailableError("Photo reading is unavailable right now.");
  }

  const num = (v: unknown, max: number): number | null => {
    const n = Number(v);
    if (v == null || v === "" || !Number.isFinite(n) || n < 0 || n > max) return null;
    return Math.round(n * 1000) / 1000;
  };

  try {
    const parsed = JSON.parse(raw);
    const routines: {
      label: string;
      execution: number | null;
      difficulty: number | null;
      horizontal: number | null;
      timeOfFlight: number | null;
      total: number | null;
    }[] = [];
    if (Array.isArray(parsed.routines)) {
      for (const row of parsed.routines.slice(0, 2)) {
        const routine = {
          label:
            typeof row?.label === "string" && /^R[12]$/i.test(row.label.trim())
              ? row.label.trim().toUpperCase()
              : `R${routines.length + 1}`,
          execution: num(row?.execution, 20),
          difficulty: num(row?.difficulty, 25),
          horizontal: num(row?.horizontal, 10),
          timeOfFlight: num(row?.timeOfFlight, 30),
          total: num(row?.total, 120),
        };
        // Skip rows with nothing usable at all.
        if (
          routine.execution == null &&
          routine.difficulty == null &&
          routine.horizontal == null &&
          routine.timeOfFlight == null &&
          routine.total == null
        ) {
          continue;
        }
        routines.push(routine);
      }
    }
    const rawRound = typeof parsed.round === "string" ? parsed.round.toLowerCase() : "";
    const round = rawRound.includes("final")
      ? ("final" as const)
      : rawRound.includes("prelim") || rawRound.includes("qual")
        ? ("prelims" as const)
        : null;
    const competitionName =
      typeof parsed.competitionName === "string" && parsed.competitionName.trim().length > 0
        ? parsed.competitionName.trim().slice(0, 120)
        : null;
    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null;
    return { routines, competitionName, round, date };
  } catch {
    throw new CoachUnavailableError("Could not read the scoresheet photo.");
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
