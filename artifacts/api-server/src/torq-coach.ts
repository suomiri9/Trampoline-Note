// The Torq app's coach chat. Torq (the native iOS trampoline app) analyses
// videos on the phone: time of flight, height, somersault speed, body angles
// per skill attempt. It sends a compact summary of those measurements with
// each question, and this endpoint adds the athlete's Trampoline Note data
// (sessions, scores, ToF and execution trackers, WHOOP) before asking Claude.
//
// Read-only on purpose: unlike the in-app coach it never proposes log
// entries, skills or points, and it only talks about the athlete's own
// trampoline data. History lives on the phone and is sent with each request.

import { aiComplete, AI_MODEL, type AiMessage } from "./ai";
import { storage } from "./storage";
import { buildCoachContext, COACH_SAFETY_RULES, CoachUnavailableError, CoachStoppedError } from "./coach";
import type { Skill } from "@workspace/db";

export interface TorqChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 20;

async function trackerSummary(userId: string, cutoff: string): Promise<string> {
  const [skills, routines, tof, execution] = await Promise.all([
    storage.getSkills(userId),
    storage.getRoutines(userId),
    storage.getTofSessions(userId),
    storage.getExecutionSessions(userId),
  ]);
  const skillById = new Map<number, Skill>(skills.map((s) => [s.id, s]));
  const routineName = new Map<number, string>(routines.map((r) => [r.id, r.name]));
  const target = (s: { routineId: number | null; skillId: number | null; skillIds: number[] | null }) => {
    if (s.routineId != null) return `routine "${routineName.get(s.routineId) ?? s.routineId}"`;
    if (s.skillId != null) {
      const k = skillById.get(s.skillId);
      return k ? `${k.code} ${k.name}` : `skill ${s.skillId}`;
    }
    if (s.skillIds?.length) return s.skillIds.map((id) => skillById.get(id)?.code ?? id).join(" + ");
    return "unknown target";
  };

  const lines: string[] = [];
  const recentTof = tof.filter((s) => String(s.date) >= cutoff).slice(0, 25);
  lines.push(`\nTime-of-flight tracker sessions, last 60 days (${recentTof.length}):`);
  for (const s of recentTof) {
    const total = s.tofValues.reduce((a, b) => a + b, 0);
    lines.push(
      `  ${String(s.date).substring(0, 10)} · ${target(s)} · ${s.context}${s.compName ? ` "${s.compName}"` : ""} · ToF ${s.tofValues.map((v) => v.toFixed(2)).join(", ")} (total ${total.toFixed(2)} s)` +
        (s.note ? ` · note: ${s.note.replace(/\s+/g, " ").slice(0, 120)}` : ""),
    );
  }
  const recentExec = execution.filter((s) => String(s.date) >= cutoff).slice(0, 25);
  lines.push(`\nExecution deduction sessions, last 60 days (${recentExec.length}):`);
  for (const s of recentExec) {
    const total = s.deductions.reduce((a, b) => a + b, 0) + (s.landingDeduction ?? 0);
    lines.push(
      `  ${String(s.date).substring(0, 10)} · ${target(s)} · ${s.context}${s.compName ? ` "${s.compName}"` : ""} · per-skill deductions ${s.deductions.map((v) => v.toFixed(1)).join(", ")}` +
        `${s.landingDeduction != null ? ` · landing ${s.landingDeduction.toFixed(1)}` : ""} · total ${total.toFixed(1)}` +
        (s.note ? ` · note: ${s.note.replace(/\s+/g, " ").slice(0, 120)}` : ""),
    );
  }
  const library = skills.filter((s) => !s.archived && (s.isDrill === 0 || s.isDrill === 1));
  if (library.length) {
    lines.push(`\nSkill library (${library.length}): ${library.slice(0, 120).map((s) => `${s.code} ${s.name}`).join("; ")}`);
  }
  return lines.join("\n");
}

export async function torqCoachChat(
  userId: string,
  history: TorqChatTurn[],
  torqData: string,
  clientDate?: unknown,
  signal?: AbortSignal,
): Promise<string> {
  const ctx = await buildCoachContext(userId, clientDate);
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const trackers = await trackerSummary(userId, cutoff);

  const system = [
    "You are the coach assistant inside Torq, the athlete's trampoline app. Torq measures their skills from video; Trampoline Note is their training log. You see both.",
    "STRICT ALLOWLIST, deny by default. You may ONLY:",
    "(1) answer questions about the athlete's own trampoline data below: Torq video measurements (time of flight, height, somersault speeds, takeoff lean, travel, hip and knee angles, when they opened, landing rotation) and Trampoline Note data (sessions, DD, ratings, notes, scores, ToF and execution tracker sessions, WHOOP recovery/HRV/sleep/strain);",
    "(2) compare attempts, spot trends and links across that data (for example lower time of flight on low-recovery days, or execution deductions on skills where Torq shows travel), always citing the numbers and dates;",
    "(3) explain what a Torq measurement means and the physics behind it in plain words (a tighter shape spins faster, time of flight sets height, leaning at takeoff makes you travel, opening early leaves rotation short);",
    "(4) explain how Torq's Coach, History and Notes tabs work.",
    "Everything else is off-topic: other subjects, writing, code, general chat, nutrition, training programmes, and new drills or progressions. Refuse off-topic requests in one or two sentences and steer back to their data. You cannot change any data or take actions; say so if asked.",
    COACH_SAFETY_RULES,
    "Torq's measurements come from a single phone video and are estimates: somersault degrees can read 25-60° low, time of flight can be off by about 0.1-0.2 s on hard footage, and twists are not measured. Mention this when a conclusion rests on a small difference.",
    "If the data doesn't cover a question, say so plainly. Never invent numbers. Keep replies short: a few sentences or a short list.",
    `\nTrampoline Note data:\n${ctx.text}${trackers}`,
    `\nTorq video measurements (from the phone):\n${torqData.trim() || "(no analysed videos yet)"}`,
  ].join(" ");

  const turns = history.slice(-MAX_TURNS);
  const messages: AiMessage[] = [
    { role: "system", content: system },
    ...turns.map((t) => ({ role: t.role, content: t.content }) as AiMessage),
  ];

  let reply: string;
  try {
    reply = (await aiComplete({ messages, signal })).trim();
  } catch (err) {
    if (signal?.aborted) throw new CoachStoppedError();
    const status = (err as { status?: number }).status;
    console.error(`[torq-coach] chat failed (status ${status ?? "none"}, model ${AI_MODEL}):`, err);
    if (status === 401 || status === 403) {
      throw new CoachUnavailableError("The coach's AI key isn't working. The app owner needs to check it.");
    }
    if (status === 429) {
      throw new CoachUnavailableError("The coach is busy or out of AI credit right now. Try again later.");
    }
    if (status === 404 || status === 400) {
      throw new CoachUnavailableError("The coach's AI settings are wrong. The app owner needs to check them.");
    }
    throw new CoachUnavailableError();
  }
  // An empty reply means Claude declined the question; answer in scope
  // instead of reporting an outage.
  if (!reply) {
    console.warn("[torq-coach] empty reply (declined)");
    return "I can't help with that one. Ask me about your jumps, sessions, scores or recovery.";
  }
  return reply;
}
