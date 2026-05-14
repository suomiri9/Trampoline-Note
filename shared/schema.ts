import { pgTable, text, serial, integer, date, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  startTime: text("start_time"), // Store as HH:mm
  endTime: text("end_time"), // Store as HH:mm
  content: text("content").notNull(),
  skills: text("skills"), // JSON string: [{"id": 1, "reps": 5}, {"id": -1}, {"id": 2, "reps": 10}]
  rating: integer("rating"), // 1 to 5
  sleepScore: integer("sleep_score"), // 0 to 100
});

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  code: text("code").notNull(),
  difficulty: real("difficulty").notNull(),
  isDrill: integer("is_drill").notNull().default(0), // 0 for skill, 1 for drill, 2 for frequent connection, 3 for part of routine
  skillIds: integer("skill_ids").array(), // For frequent connections (type 2) and routine parts (type 3)
  sortOrder: integer("sort_order"),
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived
});

export const routines = pgTable("routines", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  code: text("code"),
  skillIds: integer("skill_ids").array().notNull(), // Array of 10 skill IDs
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  routineId: integer("routine_id").references(() => routines.id),
  routineIdVol: integer("routine_id_vol").references(() => routines.id),
  type: text("type").notNull().default("practice"), // "practice" or "competition"
  category: text("category").notNull().default("vol"), // "set", "vol", "both", or "vol_vol"
  competitionName: text("competition_name"),
  rank: integer("rank"),
  // Set scores (also used for single vol)
  execution: real("execution").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  horizontal: real("horizontal").notNull().default(0),
  timeOfFlight: real("time_of_flight").notNull().default(0),
  total: real("total").notNull().default(0),
  attempt: integer("attempt"), // null = full 10 skills, 1-9 = partial attempt
  // Vol scores (used when category is "both" or "vol_vol")
  executionVol: real("execution_vol"),
  difficultyVol: real("difficulty_vol"),
  horizontalVol: real("horizontal_vol"),
  timeOfFlightVol: real("time_of_flight_vol"),
  totalVol: real("total_vol"),
  attemptVol: integer("attempt_vol"), // null = full 10 skills, 1-9 = partial attempt
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true });
export const insertSkillSchema = createInsertSchema(skills).omit({ id: true });
export const insertRoutineSchema = createInsertSchema(routines).omit({ id: true });
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true });

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = z.infer<typeof insertRoutineSchema>;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type CreateNoteRequest = InsertNote;
export type UpdateNoteRequest = Partial<InsertNote>;
export type NoteResponse = Note;
export type NotesListResponse = Note[];
