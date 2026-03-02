import { pgTable, text, serial, integer, date, real } from "drizzle-orm/pg-core";
  import { sql } from "drizzle-orm";
  import { createInsertSchema } from "drizzle-zod";
  import { z } from "zod";

  export const notes = pgTable("notes", {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    time: text("time"), // Store as HH:mm
    content: text("content").notNull(),
    skillIds: integer("skill_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
    rating: integer("rating"), // 1 to 5
  });

  export const skills = pgTable("skills", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    difficulty: real("difficulty").notNull(),
  });

  export const routines = pgTable("routines", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    skillIds: integer("skill_ids").array().notNull(), // Array of 10 skill IDs
  });

  export const insertNoteSchema = createInsertSchema(notes).omit({ id: true });
  export const insertSkillSchema = createInsertSchema(skills).omit({ id: true });
  export const insertRoutineSchema = createInsertSchema(routines).omit({ id: true });

  export type InsertNote = z.infer<typeof insertNoteSchema>;
  export type Note = typeof notes.$inferSelect;

  export type Skill = typeof skills.$inferSelect;
  export type InsertSkill = z.infer<typeof insertSkillSchema>;

  export type Routine = typeof routines.$inferSelect;
  export type InsertRoutine = z.infer<typeof insertRoutineSchema>;

  export type CreateNoteRequest = InsertNote;
  export type UpdateNoteRequest = Partial<InsertNote>;
  export type NoteResponse = Note;
  export type NotesListResponse = Note[];
  