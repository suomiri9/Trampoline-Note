import { db } from "./db";
import {
  notes,
  skills,
  routines,
  scores,
  type CreateNoteRequest,
  type UpdateNoteRequest,
  type NoteResponse,
  type Skill,
  type InsertSkill,
  type Routine,
  type InsertRoutine,
  type Score,
  type InsertScore
} from "@shared/schema";
import { eq, desc, and, isNull, sql, gte, lte } from "drizzle-orm";
import { parseNoteSkills, calculateTotalDD } from "@shared/training-utils";

export interface DailyDDPoint {
  date: string;
  difficulty: number;
  sessions: number;
}

export interface IStorage {
  // Notes
  getNotes(userId: string, opts?: { limit?: number; offset?: number }): Promise<NoteResponse[]>;
  getNotesCount(userId: string): Promise<number>;
  getDailyDD(userId: string, from: string, to: string): Promise<DailyDDPoint[]>;
  getNote(id: number): Promise<NoteResponse | undefined>;
  createNote(userId: string, note: CreateNoteRequest): Promise<NoteResponse>;
  updateNote(id: number, userId: string, updates: UpdateNoteRequest): Promise<NoteResponse>;
  deleteNote(id: number, userId: string): Promise<void>;

  // Skills
  getSkills(userId: string): Promise<Skill[]>;
  createSkill(userId: string, skill: InsertSkill): Promise<Skill>;
  updateSkill(id: number, userId: string, updates: Partial<InsertSkill>): Promise<Skill | undefined>;
  deleteSkill(id: number, userId: string): Promise<void>;

  // Routines
  getRoutines(userId: string): Promise<Routine[]>;
  createRoutine(userId: string, routine: InsertRoutine): Promise<Routine>;
  updateRoutine(id: number, userId: string, updates: Partial<InsertRoutine>): Promise<Routine | undefined>;
  deleteRoutine(id: number, userId: string): Promise<void>;

  // Scores
  getScores(userId: string): Promise<Score[]>;
  createScore(userId: string, score: InsertScore): Promise<Score>;
  updateScore(id: number, userId: string, updates: Partial<InsertScore>): Promise<Score | undefined>;
  deleteScore(id: number, userId: string): Promise<void>;

  // Reorder
  reorderSkills(userId: string, orderedIds: number[]): Promise<void>;

  // Data migration
  claimLegacyData(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getNotes(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<NoteResponse[]> {
    const base = db
      .select()
      .from(notes)
      .where(eq(notes.userId, userId))
      .orderBy(desc(notes.date), desc(notes.id));
    if (opts?.limit !== undefined) {
      return await base.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await base;
  }

  async getNotesCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notes)
      .where(eq(notes.userId, userId));
    return row?.count ?? 0;
  }

  async getNote(id: number): Promise<NoteResponse | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note;
  }

  async createNote(userId: string, insertNote: CreateNoteRequest): Promise<NoteResponse> {
    const [note] = await db.insert(notes).values({ ...insertNote, userId }).returning();
    return note;
  }

  async updateNote(id: number, userId: string, updates: UpdateNoteRequest): Promise<NoteResponse> {
    const [updated] = await db.update(notes)
      .set(updates)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning();
    return updated;
  }

  async deleteNote(id: number, userId: string): Promise<void> {
    await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
  }

  async getDailyDD(userId: string, from: string, to: string): Promise<DailyDDPoint[]> {
    // Fetch only the notes inside the requested date window. We need full
    // skills + routines to resolve DD because notes store skill ids and
    // routine references that need lookups.
    const [rows, allSkills, allRoutines] = await Promise.all([
      db
        .select({ date: notes.date, skills: notes.skills })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            gte(notes.date, from),
            lte(notes.date, to),
          ),
        ),
      db.select().from(skills).where(eq(skills.userId, userId)),
      db.select().from(routines).where(eq(routines.userId, userId)),
    ]);

    const byDay = new Map<string, { difficulty: number; sessions: number }>();
    for (const row of rows) {
      const raw = row.date as unknown;
      const key = (raw instanceof Date
        ? raw.toISOString()
        : String(raw ?? "")
      ).substring(0, 10);
      if (!key) continue;
      const items = parseNoteSkills(row.skills);
      const dd = calculateTotalDD(items, allSkills, allRoutines);
      const cur = byDay.get(key) || { difficulty: 0, sessions: 0 };
      cur.difficulty += dd;
      cur.sessions += 1;
      byDay.set(key, cur);
    }
    return Array.from(byDay.entries())
      .map(([date, v]) => ({ date, difficulty: v.difficulty, sessions: v.sessions }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async getSkills(userId: string): Promise<Skill[]> {
    return await db.select().from(skills).where(eq(skills.userId, userId));
  }

  async createSkill(userId: string, insertSkill: InsertSkill): Promise<Skill> {
    const isDrill = insertSkill.isDrill ?? 0;
    const difficulty = insertSkill.difficulty ?? 0;

    const sameCategory = await db.select()
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.isDrill, isDrill)));

    const sorted = sameCategory
      .map(s => ({ id: s.id, sortOrder: s.sortOrder ?? 999999, difficulty: s.difficulty }))
      .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : b.difficulty - a.difficulty);

    let insertIdx = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
      if (difficulty >= sorted[i].difficulty) {
        insertIdx = i;
        break;
      }
    }

    const shiftUpdates = sorted.slice(insertIdx).map((s, i) =>
      db.update(skills)
        .set({ sortOrder: insertIdx + i + 1 })
        .where(eq(skills.id, s.id))
    );
    await Promise.all(shiftUpdates);

    for (let i = 0; i < insertIdx; i++) {
      if (sorted[i].sortOrder !== i) {
        await db.update(skills).set({ sortOrder: i }).where(eq(skills.id, sorted[i].id));
      }
    }

    const [skill] = await db.insert(skills)
      .values({ ...insertSkill, userId, sortOrder: insertIdx })
      .returning();
    return skill;
  }

  async updateSkill(id: number, userId: string, updates: Partial<InsertSkill>): Promise<Skill | undefined> {
    const [updated] = await db.update(skills)
      .set(updates)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSkill(id: number, userId: string): Promise<void> {
    await db.delete(skills).where(and(eq(skills.id, id), eq(skills.userId, userId)));
  }

  async getRoutines(userId: string): Promise<Routine[]> {
    return await db.select().from(routines).where(eq(routines.userId, userId));
  }

  async createRoutine(userId: string, insertRoutine: InsertRoutine): Promise<Routine> {
    const [routine] = await db.insert(routines).values({ ...insertRoutine, userId }).returning();
    return routine;
  }

  async updateRoutine(id: number, userId: string, updates: Partial<InsertRoutine>): Promise<Routine | undefined> {
    const [updated] = await db.update(routines)
      .set(updates)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)))
      .returning();
    return updated;
  }

  async deleteRoutine(id: number, userId: string): Promise<void> {
    await db.delete(routines).where(and(eq(routines.id, id), eq(routines.userId, userId)));
  }

  async getScores(userId: string): Promise<Score[]> {
    return await db.select().from(scores)
      .where(eq(scores.userId, userId))
      .orderBy(desc(scores.date));
  }

  async createScore(userId: string, insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values({ ...insertScore, userId }).returning();
    return score;
  }

  async updateScore(id: number, userId: string, updates: Partial<InsertScore>): Promise<Score | undefined> {
    const [updated] = await db.update(scores)
      .set(updates)
      .where(and(eq(scores.id, id), eq(scores.userId, userId)))
      .returning();
    return updated;
  }

  async deleteScore(id: number, userId: string): Promise<void> {
    await db.delete(scores).where(and(eq(scores.id, id), eq(scores.userId, userId)));
  }

  async reorderSkills(userId: string, orderedIds: number[]): Promise<void> {
    const updates = orderedIds.map((id, index) =>
      db.update(skills)
        .set({ sortOrder: index })
        .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    );
    await Promise.all(updates);
  }

  async claimLegacyData(userId: string): Promise<void> {
    await Promise.all([
      db.update(notes).set({ userId }).where(isNull(notes.userId)),
      db.update(skills).set({ userId }).where(isNull(skills.userId)),
      db.update(routines).set({ userId }).where(isNull(routines.userId)),
      db.update(scores).set({ userId }).where(isNull(scores.userId)),
    ]);
  }
}

export const storage = new DatabaseStorage();
