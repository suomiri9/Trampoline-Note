import { db } from "./db";
import {
  notes,
  skills,
  routines,
  type CreateNoteRequest,
  type UpdateNoteRequest,
  type NoteResponse,
  type Skill,
  type InsertSkill,
  type Routine,
  type InsertRoutine
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Notes
  getNotes(): Promise<NoteResponse[]>;
  getNote(id: number): Promise<NoteResponse | undefined>;
  createNote(note: CreateNoteRequest): Promise<NoteResponse>;
  updateNote(id: number, updates: UpdateNoteRequest): Promise<NoteResponse>;
  deleteNote(id: number): Promise<void>;
  
  // Skills
  getSkills(): Promise<Skill[]>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  deleteSkill(id: number): Promise<void>;
  
  // Routines
  getRoutines(): Promise<Routine[]>;
  createRoutine(routine: InsertRoutine): Promise<Routine>;
  deleteRoutine(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getNotes(): Promise<NoteResponse[]> {
    return await db.select().from(notes);
  }

  async getNote(id: number): Promise<NoteResponse | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note;
  }

  async createNote(insertNote: CreateNoteRequest): Promise<NoteResponse> {
    const [note] = await db.insert(notes).values(insertNote).returning();
    return note;
  }

  async updateNote(id: number, updates: UpdateNoteRequest): Promise<NoteResponse> {
    const [updated] = await db.update(notes)
      .set(updates)
      .where(eq(notes.id, id))
      .returning();
    return updated;
  }

  async deleteNote(id: number): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  async getSkills(): Promise<Skill[]> {
    return await db.select().from(skills);
  }

  async createSkill(insertSkill: InsertSkill): Promise<Skill> {
    const [skill] = await db.insert(skills).values(insertSkill).returning();
    return skill;
  }

  async deleteSkill(id: number): Promise<void> {
    await db.delete(skills).where(eq(skills.id, id));
  }

  async getRoutines(): Promise<Routine[]> {
    return await db.select().from(routines);
  }

  async createRoutine(insertRoutine: InsertRoutine): Promise<Routine> {
    const [routine] = await db.insert(routines).values(insertRoutine).returning();
    return routine;
  }

  async deleteRoutine(id: number): Promise<void> {
    await db.delete(routines).where(eq(routines.id, id));
  }
}

export const storage = new DatabaseStorage();
