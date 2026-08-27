// Confirm-first proposal parsing for the AI coach.
//
// When the athlete EXPLICITLY asks the coach to add a skill/drill to their
// library ("add crash dive as a drill") or to add a "Point to Fix" ("add a
// point to fix: keep arms up on 4-o"), the model appends a fenced
// skill_proposal / point_proposal block to its reply. The helpers here pull
// that block out, validate it, and resolve any referenced skills/routines
// against the athlete's REAL library (unresolvable references are dropped,
// never invented). The structured proposal is handed to the client, which
// renders a confirmation card — NOTHING in this module writes to the
// database; saving happens only after the athlete taps confirm.
//
// This module also owns the "loggable library" helpers shared with
// server/coach.ts (kept dependency-free so it stays unit-testable).

import type { Skill, Routine } from "@workspace/db";
import { POINT_CATEGORIES, isPointCategory, type PointCategory } from "@shared/points";

export function normalizeKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface LoggableSkill {
  id: number;
  code: string; // combined display code for shape children
  name: string;
  isDrill: number;
}

// Flat "no parent grouping bases" list, mirroring client pickableSkills +
// skillDisplayCode: shape children show baseCode+shape, bases owning a
// non-archived shape child are excluded.
export function loggableSkills(all: Skill[]): LoggableSkill[] {
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

// Non-archived frequent connections (isDrill 2) — matchable draft rows that
// become {id:-3, fcId, customSkillIds} app items.
export function loggableConnections(all: Skill[]): Skill[] {
  return all.filter((s) => s.isDrill === 2 && s.archived !== 1);
}

// Non-archived routines — matchable draft rows that become
// {id:-2, routineId, customSkillIds} app items.
export function loggableRoutines(routines: Routine[]): Routine[] {
  return routines.filter((r) => r.archived !== 1);
}

// ---- Skill addition proposal ----

export interface CoachSkillProposal {
  name: string;
  code: string;
  difficulty: number;
  type: "skill" | "drill";
  // An active library entry already uses this code or name — the client
  // disables confirm so the athlete never creates an accidental duplicate.
  alreadyExists: boolean;
}

const SKILL_PROPOSAL_BLOCK_RE = /```skill_proposal\s*\n([\s\S]*?)```/;

// Pulls a skill_proposal block out of the reply. `stripped` is the reply
// with the block removed (unchanged when there is no block); `proposal` is
// null when the block is missing or unusable.
export function extractSkillProposal(
  reply: string,
  allSkills: Skill[],
): { stripped: string; proposal: CoachSkillProposal | null } {
  const m = reply.match(SKILL_PROPOSAL_BLOCK_RE);
  if (!m) return { stripped: reply, proposal: null };
  const stripped = reply.replace(SKILL_PROPOSAL_BLOCK_RE, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return { stripped, proposal: null };
  }
  if (!parsed || typeof parsed !== "object") return { stripped, proposal: null };

  const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 120) : "";
  const code = typeof parsed.code === "string" ? parsed.code.trim().slice(0, 40) : "";
  if (!name || !code) return { stripped, proposal: null };

  const diffRaw = Number(parsed.difficulty);
  const difficulty =
    Number.isFinite(diffRaw) && diffRaw > 0 ? Math.min(Math.round(diffRaw * 10) / 10, 20) : 0;
  const type: CoachSkillProposal["type"] = parsed.type === "drill" ? "drill" : "skill";

  // Duplicate check against every ACTIVE library entry (raw codes/names) plus
  // the combined display codes of shape children (e.g. "4-o").
  const codeKey = normalizeKey(code);
  const nameKey = normalizeKey(name);
  const active = allSkills.filter((s) => s.archived !== 1);
  const alreadyExists =
    active.some(
      (s) => normalizeKey(s.code) === codeKey || normalizeKey(s.name) === nameKey,
    ) || loggableSkills(allSkills).some((s) => normalizeKey(s.code) === codeKey);

  return { stripped, proposal: { name, code, difficulty, type, alreadyExists } };
}

// ---- Point to Fix proposal ----

export interface CoachPointLink {
  id: number;
  code: string;
  name: string;
}

export interface CoachPointProposal {
  name: string;
  skills: CoachPointLink[]; // resolved against the athlete's real library
  routines: CoachPointLink[];
  category: PointCategory; // applies when the point ends up unlinked
  unresolved: string[]; // referenced labels that matched nothing (dropped)
}

const POINT_PROPOSAL_BLOCK_RE = /```point_proposal\s*\n([\s\S]*?)```/;

// Pulls a point_proposal block out of the reply and resolves its referenced
// skill/routine labels (codes or names) against the athlete's library.
// Unresolvable labels land in `unresolved` — they are dropped rather than
// invented, so a confirmed point never links to a nonexistent id.
export function extractPointProposal(
  reply: string,
  allSkills: Skill[],
  routines: Routine[],
): { stripped: string; proposal: CoachPointProposal | null } {
  const m = reply.match(POINT_PROPOSAL_BLOCK_RE);
  if (!m) return { stripped: reply, proposal: null };
  const stripped = reply.replace(POINT_PROPOSAL_BLOCK_RE, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return { stripped, proposal: null };
  }
  if (!parsed || typeof parsed !== "object") return { stripped, proposal: null };

  const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 200) : "";
  if (!name) return { stripped, proposal: null };

  // Lookup maps over what the prompt's library list shows the model:
  // loggable skills/drills (combined display codes) + frequent connections.
  const skillByKey = new Map<string, CoachPointLink>();
  for (const s of loggableSkills(allSkills)) {
    for (const key of [normalizeKey(s.code), normalizeKey(s.name)]) {
      if (key && !skillByKey.has(key)) skillByKey.set(key, { id: s.id, code: s.code, name: s.name });
    }
  }
  for (const c of loggableConnections(allSkills)) {
    for (const key of [normalizeKey(c.code || ""), normalizeKey(c.name)]) {
      if (key && !skillByKey.has(key)) {
        skillByKey.set(key, { id: c.id, code: c.code || c.name, name: c.name });
      }
    }
  }
  const routineByKey = new Map<string, CoachPointLink>();
  for (const r of loggableRoutines(routines)) {
    for (const key of [normalizeKey(r.code || ""), normalizeKey(r.name)]) {
      if (key && !routineByKey.has(key)) {
        routineByKey.set(key, { id: r.id, code: r.code || r.name, name: r.name });
      }
    }
  }

  const labelsOf = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 10)
      : [];

  const skills: CoachPointLink[] = [];
  const routineLinks: CoachPointLink[] = [];
  const unresolved: string[] = [];
  const seenSkillIds = new Set<number>();
  const seenRoutineIds = new Set<number>();

  for (const label of labelsOf(parsed.skills)) {
    const hit = skillByKey.get(normalizeKey(label));
    if (hit) {
      if (!seenSkillIds.has(hit.id)) {
        seenSkillIds.add(hit.id);
        skills.push(hit);
      }
    } else {
      unresolved.push(label.trim());
    }
  }
  for (const label of labelsOf(parsed.routines)) {
    const hit = routineByKey.get(normalizeKey(label));
    if (hit) {
      if (!seenRoutineIds.has(hit.id)) {
        seenRoutineIds.add(hit.id);
        routineLinks.push(hit);
      }
    } else {
      unresolved.push(label.trim());
    }
  }

  const category: PointCategory = isPointCategory(parsed.category)
    ? parsed.category
    : POINT_CATEGORIES[0];

  return {
    stripped,
    proposal: { name, skills, routines: routineLinks, category, unresolved },
  };
}
