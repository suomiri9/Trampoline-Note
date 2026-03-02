import { pgTable, text, serial, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  content: text("content").notNull(),
  skills: text("skills"), // e.g. "front flip, back tuck"
  rating: integer("rating"), // 1 to 5
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true });

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type CreateNoteRequest = InsertNote;
export type UpdateNoteRequest = Partial<InsertNote>;
export type NoteResponse = Note;
export type NotesListResponse = Note[];
