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
import { eq, desc, and, isNull, sql, gte } from "drizzle-orm";

// Thrown when a shape grouping link (parentSkillId) is invalid. Routes map this
// to a 400 so bad links never silently persist.
export class SkillLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillLinkError";
  }
}

export interface IStorage {
  // Notes
  getNotes(userId: string, opts?: { limit?: number; offset?: number }): Promise<NoteResponse[]>;
  getNotesCount(userId: string): Promise<number>;
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

  async getSkills(userId: string): Promise<Skill[]> {
    return await db.select().from(skills).where(eq(skills.userId, userId));
  }

  // Validate a shape-grouping link before it is persisted: the parent must be
  // the caller's own top-level base (a skill OR a drill), never a connection or
  // routine part, never a shape itself (no nesting), and never the row itself. A
  // shape must be the SAME type (skill/drill) as its base. When relinking an
  // existing row, that row must not already own shapes (which would nest a group).
  private async assertValidParent(userId: string, parentSkillId: number, childIsDrill: number, selfId?: number): Promise<void> {
    if (!Number.isInteger(parentSkillId) || parentSkillId <= 0) {
      throw new SkillLinkError("Invalid parent.");
    }
    if (selfId != null && parentSkillId === selfId) {
      throw new SkillLinkError("An item cannot be its own shape parent.");
    }
    const [parent] = await db.select().from(skills)
      .where(and(eq(skills.id, parentSkillId), eq(skills.userId, userId)));
    if (!parent) {
      throw new SkillLinkError("Parent not found.");
    }
    if (parent.isDrill !== 0 && parent.isDrill !== 1) {
      throw new SkillLinkError("Shapes can only be grouped under a skill or drill.");
    }
    if (parent.isDrill !== childIsDrill) {
      throw new SkillLinkError("A shape must be the same type (skill/drill) as its base.");
    }
    if (parent.parentSkillId != null) {
      throw new SkillLinkError("Shapes cannot be nested under another shape.");
    }
    if (selfId != null) {
      const [child] = await db.select().from(skills)
        .where(and(eq(skills.parentSkillId, selfId), eq(skills.userId, userId)))
        .limit(1);
      if (child) {
        throw new SkillLinkError("This item has its own shapes, so it cannot become a shape of another.");
      }
    }
  }

  async createSkill(userId: string, insertSkill: InsertSkill): Promise<Skill> {
    const isDrill = insertSkill.isDrill ?? 0;
    if (insertSkill.parentSkillId != null) {
      await this.assertValidParent(userId, insertSkill.parentSkillId, isDrill);
    }
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
    const [existing] = await db.select().from(skills)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)));
    if (existing) {
      const effectiveIsDrill = updates.isDrill ?? existing.isDrill;
      if (updates.parentSkillId != null) {
        await this.assertValidParent(userId, updates.parentSkillId, effectiveIsDrill, id);
      }
      // A base that already owns shapes can't switch type — its children would
      // become a different type than their base, breaking the grouping invariant.
      if (updates.isDrill != null && updates.isDrill !== existing.isDrill) {
        const [child] = await db.select().from(skills)
          .where(and(eq(skills.parentSkillId, id), eq(skills.userId, userId)))
          .limit(1);
        if (child) {
          throw new SkillLinkError("Cannot change the type of an item that has shapes.");
        }
      }
    }
    const [updated] = await db.update(skills)
      .set(updates)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning();
    // Cascade archive/unarchive of a base skill to its shape children so a
    // shape never outlives (or gets orphaned in active lists from) its base.
    if (updated && updates.archived != null) {
      await db.update(skills)
        .set({ archived: updates.archived })
        .where(and(eq(skills.parentSkillId, id), eq(skills.userId, userId)));
    }
    return updated;
  }

  async deleteSkill(id: number, userId: string): Promise<void> {
    // Cascade delete: remove any shape children of this base skill first so
    // no orphaned shapes remain.
    await db.delete(skills).where(and(eq(skills.parentSkillId, id), eq(skills.userId, userId)));
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
