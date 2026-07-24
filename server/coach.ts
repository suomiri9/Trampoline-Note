// AI coach: builds a compact per-user training + WHOOP context and asks a
// Replit-managed OpenAI model (no user API key) for (a) a daily "push level"
// recommendation and (b) grounded answers in the coach chat.
//
// The model only ever sees a summarized context — recent session DD totals,
// ratings, scores and WHOOP recovery/HRV/sleep/strain — never raw dumps.

import OpenAI from "openai";
import { storage } from "./storage";
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
    const todayRow = byDate.get(todayKey);
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
App guide (Trampoline Training Log):
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
export async function coachChat(
  userId: string,
  userMessage: string,
  page?: string,
  onDelta?: (chunk: string) => void,
): Promise<{ reply: string }> {
  const ctx = await buildCoachContext(userId);
  const history = await storage.getCoachMessages(userId);
  const recent = history.slice(-MAX_HISTORY_TURNS);

  const currentPage = pageName(page);
  const system = [
    "You are the athlete's personal trampoline coach inside their training log app.",
    "You help with two things: (1) training advice grounded ONLY in the athlete's actual data below — their training sessions with DD (degree of difficulty) totals, session ratings, notes, competition/practice scores, and WHOOP recovery/HRV/sleep/strain when available; and (2) using the app itself — explain features and where to find things using the app guide below, e.g. how to log a session, record a score, or link WHOOP.",
    "Cite concrete numbers and dates from the data when relevant. If the data doesn't cover a question, say so plainly instead of inventing details.",
    "You are a read-only advisor: you cannot modify their log yourself, but you can walk them through doing it in the app. Keep answers concise (a few sentences, or a short list) and practical.",
    currentPage ? `The athlete is currently on the ${currentPage} page of the app.` : "",
    `\n${APP_GUIDE}`,
    `\nAthlete data:\n${ctx.text}`,
  ].filter(Boolean).join(" ");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
    ...recent.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
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

  // Persist both turns only after a successful model reply so a failed send
  // can simply be retried without duplicate user messages in history.
  await storage.createCoachMessage(userId, "user", userMessage);
  await storage.createCoachMessage(userId, "assistant", reply);

  return { reply };
}
