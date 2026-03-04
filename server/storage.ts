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
import { eq, desc, and, isNull } from "drizzle-orm";

export interface IStorage {
  // Notes
  getNotes(userId: string): Promise<NoteResponse[]>;
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
  deleteScore(id: number, userId: string): Promise<void>;

  // Data migration
  claimLegacyData(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getNotes(userId: string): Promise<NoteResponse[]> {
    return await db.select().from(notes).where(eq(notes.userId, userId));
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

  async createSkill(userId: string, insertSkill: InsertSkill): Promise<Skill> {
    const [skill] = await db.insert(skills).values({ ...insertSkill, userId }).returning();
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

  async deleteScore(id: number, userId: string): Promise<void> {
    await db.delete(scores).where(and(eq(scores.id, id), eq(scores.userId, userId)));
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
