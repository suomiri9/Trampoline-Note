import { db } from "./db";
import {
  notes,
  type CreateNoteRequest,
  type UpdateNoteRequest,
  type NoteResponse
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getNotes(): Promise<NoteResponse[]>;
  getNote(id: number): Promise<NoteResponse | undefined>;
  createNote(note: CreateNoteRequest): Promise<NoteResponse>;
  updateNote(id: number, updates: UpdateNoteRequest): Promise<NoteResponse>;
  deleteNote(id: number): Promise<void>;
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
}

export const storage = new DatabaseStorage();
