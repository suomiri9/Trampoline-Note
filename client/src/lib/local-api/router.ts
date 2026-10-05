import { getTableColumns, type Table } from "drizzle-orm";
import { z } from "zod";
import { api } from "@shared/routes";
import { notes, skills, routines, scores, type Note, type Skill } from "@shared/schema";
import { skillHistory, routineHistory, connectionHistory, planSkillInsert } from "@shared/history";
import { loadData, saveData } from "./store";

/**
 * Answers the app's /api requests on the device, mirroring server/routes.ts,
 * so the iOS app works with no server. Data lives in ./store.
 */

const LOCAL_USER_ID = "local";

type Json = Record<string, unknown>;

class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.errors[0];
    throw new HttpError(400, issue.message, issue.path.join("."));
  }
  return result.data;
}

/** Fills in the columns the database would default (or leave null). */
function withDefaults<T>(table: Table, input: Json, id: number): T {
  const row: Json = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (key in input && input[key] !== undefined) row[key] = input[key];
    else if (col.hasDefault && col.default !== undefined) row[key] = col.default;
    else row[key] = null;
  }
  row.id = id;
  row.userId = LOCAL_USER_ID;
  return row as T;
}

function nextId(rows: Array<{ id: number }>) {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

function findIndex(rows: Array<{ id: number }>, id: number, what: string) {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) throw new HttpError(404, `${what} not found`);
  return idx;
}

function sortNotes(list: Note[]) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

const noteCreate = api.notes.create.input.extend({ rating: z.coerce.number().optional().nullable() });
const noteUpdate = api.notes.update.input.extend({ rating: z.coerce.number().optional().nullable() });

async function route(method: string, url: URL, body: unknown): Promise<Response> {
  const db = await loadData();
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [resource, idPart, sub] = parts;
  const id = idPart !== undefined ? Number(idPart) : undefined;

  const user = () => ({
    id: LOCAL_USER_ID,
    email: null,
    displayName: db.user.displayName ?? "Me",
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    focusMemo: db.user.focusMemo,
    createdAt: null,
    updatedAt: null,
  });

  // Auth: the app has a single local user and no sign-in.
  if (resource === "auth") {
    if (idPart === "focus-memo" && method === "PATCH") {
      const { focusMemo } = parse(z.object({ focusMemo: z.string().max(20000) }), body);
      db.user.focusMemo = focusMemo;
      await saveData();
      return json(200, user());
    }
    if (idPart === "logout") return json(200, { message: "Logged out" });
    return json(200, user());
  }

  if (resource === "notes") {
    if (id === undefined) {
      if (method === "GET") {
        const all = sortNotes(db.notes);
        const limit = url.searchParams.get("limit");
        const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
        const page = limit && /^\d+$/.test(limit)
          ? all.slice(offset, offset + Math.min(parseInt(limit, 10), 200))
          : all;
        return json(200, page, { "X-Total-Count": String(all.length) });
      }
      if (method === "POST") {
        const input = parse(noteCreate, body);
        const note = withDefaults<Note>(notes, input, nextId(db.notes));
        db.notes.push(note);
        await saveData();
        return json(201, note);
      }
    } else {
      if (method === "GET") {
        const note = db.notes.find((n) => n.id === id);
        return note ? json(200, note) : json(404, { message: "Note not found" });
      }
      if (method === "PUT") {
        const input = parse(noteUpdate, body);
        const idx = findIndex(db.notes, id, "Note");
        db.notes[idx] = { ...db.notes[idx], ...input, id } as Note;
        await saveData();
        return json(200, db.notes[idx]);
      }
      if (method === "DELETE") {
        db.notes = db.notes.filter((n) => n.id !== id);
        await saveData();
        return new Response(null, { status: 204 });
      }
    }
  }

  if (resource === "skills") {
    if (idPart === "reorder" && method === "PATCH") {
      const { orderedIds } = parse(z.object({ orderedIds: z.array(z.number()) }), body);
      orderedIds.forEach((sid, index) => {
        const skill = db.skills.find((s) => s.id === sid);
        if (skill) skill.sortOrder = index;
      });
      await saveData();
      return json(200, { ok: true });
    }
    if (sub === "history" && method === "GET") {
      if (!Number.isFinite(id) || id! <= 0) throw new HttpError(400, "Invalid skill ID");
      return json(200, skillHistory(id!, db.notes, db.routines, db.skills));
    }
    if (id === undefined) {
      if (method === "GET") return json(200, db.skills);
      if (method === "POST") {
        const input = parse(api.skills.create.input, body);
        const isDrill = input.isDrill ?? 0;
        const sameCategory = db.skills.filter((s) => s.isDrill === isDrill);
        const { insertIdx, updates } = planSkillInsert(sameCategory, input.difficulty ?? 0);
        for (const u of updates) {
          const s = db.skills.find((x) => x.id === u.id);
          if (s) s.sortOrder = u.sortOrder;
        }
        const skill = withDefaults<Skill>(skills, { ...input, sortOrder: insertIdx }, nextId(db.skills));
        db.skills.push(skill);
        await saveData();
        return json(201, skill);
      }
    } else {
      if (method === "PUT") {
        const input = parse(api.skills.update.input, body);
        const idx = findIndex(db.skills, id, "Skill");
        const skill = { ...db.skills[idx], ...input, id } as Skill;
        db.skills[idx] = skill;
        // Keep connection difficulty in sync with its skills (as the server does).
        if (skill.isDrill === 0 && input.difficulty != null) {
          for (const conn of db.skills) {
            if ((conn.isDrill === 2 || conn.isDrill === 3) && conn.skillIds?.includes(id)) {
              conn.difficulty = conn.skillIds.reduce(
                (acc, sId) => acc + (db.skills.find((s) => s.id === sId)?.difficulty || 0),
                0,
              );
            }
          }
        }
        await saveData();
        return json(200, skill);
      }
      if (method === "DELETE") {
        db.skills = db.skills.filter((s) => s.id !== id);
        await saveData();
        return new Response(null, { status: 204 });
      }
    }
  }

  if (resource === "connections" && sub === "history" && method === "GET") {
    if (!Number.isFinite(id) || id! <= 0) throw new HttpError(400, "Invalid connection ID");
    return json(200, connectionHistory(id!, db.notes, db.skills));
  }

  if (resource === "routines") {
    if (sub === "history" && method === "GET") {
      if (!Number.isFinite(id) || id! <= 0) throw new HttpError(400, "Invalid routine ID");
      return json(200, routineHistory(id!, db.notes, db.routines));
    }
    if (id === undefined) {
      if (method === "GET") return json(200, db.routines);
      if (method === "POST") {
        const input = parse(api.routines.create.input, body);
        const routine = withDefaults<(typeof db.routines)[number]>(routines, input, nextId(db.routines));
        db.routines.push(routine);
        await saveData();
        return json(201, routine);
      }
    } else {
      if (method === "PUT") {
        const input = parse(api.routines.update.input, body);
        const idx = findIndex(db.routines, id, "Routine");
        db.routines[idx] = { ...db.routines[idx], ...input, id } as (typeof db.routines)[number];
        await saveData();
        return json(200, db.routines[idx]);
      }
      if (method === "DELETE") {
        db.routines = db.routines.filter((r) => r.id !== id);
        await saveData();
        return new Response(null, { status: 204 });
      }
    }
  }

  if (resource === "scores") {
    if (id === undefined) {
      if (method === "GET") {
        return json(200, [...db.scores].sort((a, b) => b.date.localeCompare(a.date)));
      }
      if (method === "POST") {
        const input = parse(api.scores.create.input, body);
        const score = withDefaults<(typeof db.scores)[number]>(scores, input, nextId(db.scores));
        db.scores.push(score);
        await saveData();
        return json(201, score);
      }
    } else {
      if (method === "PUT") {
        const input = parse(api.scores.update.input, body);
        const idx = findIndex(db.scores, id, "Score");
        db.scores[idx] = { ...db.scores[idx], ...input, id } as (typeof db.scores)[number];
        await saveData();
        return json(200, db.scores[idx]);
      }
      if (method === "DELETE") {
        db.scores = db.scores.filter((s) => s.id !== id);
        await saveData();
        return new Response(null, { status: 204 });
      }
    }
  }

  return json(404, { message: "Not found" });
}

export async function handleLocalApi(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(input, "http://local");
  let body: unknown;
  if (typeof init?.body === "string" && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      return json(400, { message: "Invalid JSON" });
    }
  }
  try {
    return await route(method, url, body);
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.status, err.field ? { message: err.message, field: err.field } : { message: err.message });
    }
    console.error("Local API error:", err);
    return json(500, { message: "Internal server error" });
  }
}
