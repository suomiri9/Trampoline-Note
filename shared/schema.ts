import { pgTable, text, serial, integer, date, real, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
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
  parentSkillId: integer("parent_skill_id"), // when set, this skill row is a SHAPE of the referenced base skill
  shape: text("shape"), // shape symbol/label (e.g. "o" tuck, "<" pike, "/" straight); null for non-shape rows
  sourceRoutineId: integer("source_routine_id"), // for routine parts (isDrill 3): the routine this part was sliced from; null for legacy/other rows
});

export const routines = pgTable("routines", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  code: text("code"),
  skillIds: integer("skill_ids").array().notNull(), // Array of 10 skill IDs
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  competitionId: text("competition_id"), // groups rounds (prelims/final) of one competition; null for practice/trial
  round: text("round"), // "prelims" or "final" for competitions; null otherwise
  rank: integer("rank"),
  synchro: boolean("synchro").default(false), // synchro mode: E = avg(E1,E2), HD = avg(H1,H2), TOF field is "Sync"
  // Set scores (also used for single vol)
  execution: real("execution").notNull().default(0), // first execution judge (E1)
  executionTwo: real("execution_two"), // second execution judge (E2); null when not used
  doubleExecution: boolean("double_execution").default(false), // when true, E = E1 * 2 (second judge mirrors first)
  difficulty: real("difficulty").notNull().default(0),
  horizontal: real("horizontal").notNull().default(0),
  horizontalTwo: real("horizontal_two"), // second HD (athlete 2) when synchro; null otherwise
  timeOfFlight: real("time_of_flight").notNull().default(0),
  total: real("total").notNull().default(0),
  attempt: integer("attempt"), // null = full 10 skills, 1-9 = partial attempt
  // Vol scores (used when category is "both" or "vol_vol")
  executionVol: real("execution_vol"),
  executionTwoVol: real("execution_two_vol"), // second execution judge (E2) for the vol routine
  doubleExecutionVol: boolean("double_execution_vol").default(false),
  difficultyVol: real("difficulty_vol"),
  horizontalVol: real("horizontal_vol"),
  horizontalTwoVol: real("horizontal_two_vol"), // second HD (athlete 2) for the vol group when synchro
  timeOfFlightVol: real("time_of_flight_vol"),
  totalVol: real("total_vol"),
  attemptVol: integer("attempt_vol"), // null = full 10 skills, 1-9 = partial attempt
});

// Time-of-Flight tracker sessions (per user). Each session records the
// per-jump ToF values (in seconds, in jump order) for one routine attempt —
// entered manually or parsed from a Veriflite screenshot. The routine defines
// which skill was performed at each position, so values map to skills.
export const tofSessions = pgTable("tof_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  routineId: integer("routine_id").notNull().references(() => routines.id),
  tofValues: real("tof_values").array().notNull(), // 1-10 per-jump ToF seconds, jump order
  // Optional in-bounce jump ToF right before skill 1, so the first skill also
  // gets a drop-vs-previous value. Derivable from a Veriflite screenshot as
  // jump1 ToF minus jump1's "Difference".
  preJumpTof: real("pre_jump_tof"),
  note: text("note"),
});

// Execution deduction tracker sessions (per user). Each session records the
// per-skill execution deductions for one routine attempt — 10 skills plus a
// landing deduction — entered manually or parsed from a judges'-sheet photo.
// Values are stored in POINTS (0.2), while sheets print tenths (2 = 0.2);
// the shared/execution.ts helpers convert. The routine defines which skill
// each deduction belongs to. Implied E score = 20 - (sum + landing).
export const executionSessions = pgTable("execution_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  routineId: integer("routine_id").notNull().references(() => routines.id),
  category: text("category").notNull().default("vol"), // "set" (compulsory) or "vol" (voluntary)
  deductions: real("deductions").array().notNull(), // 1-10 per-skill deductions in points, skill order (0 = perfect skill)
  // Landing deduction in points; 0 = clean landing as printed, null = not
  // recorded (e.g. interrupted routine with no landing judged).
  landingDeduction: real("landing_deduction"),
  note: text("note"),
});

// AI coach chat history (per user). Read-only advisor; messages persist so
// the conversation survives reloads.
export const coachMessages = pgTable("coach_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  images: text("images"), // JSON array of images attached to a user message; entries are object-storage refs {key, contentType} (new) or legacy base64 data URLs; null when none
  draft: text("draft"), // JSON draft training-log entry proposed by the assistant; null when none
  proposals: text("proposals"), // JSON {skill?, point?} confirm-first proposals (skill addition / point to fix) from the assistant; null when none
  suggestions: text("suggestions"), // JSON array of quick-reply chip strings on an assistant message; null when none (draft/proposal turns skip chips)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-user WHOOP OAuth tokens ("Sign in with WHOOP"). One row per user;
// tokens live server-side only and are never sent to the frontend.
export const whoopTokens = pgTable("whoop_tokens", {
  userId: varchar("user_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"), // present when the "offline" scope was granted
  expiresAt: timestamp("expires_at").notNull(),
  scope: text("scope"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true });
export const insertSkillSchema = createInsertSchema(skills).omit({ id: true });
export const insertRoutineSchema = createInsertSchema(routines).omit({ id: true, createdAt: true });
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true });
export const insertTofSessionSchema = createInsertSchema(tofSessions)
  .omit({ id: true })
  .extend({
    tofValues: z.array(z.number().gt(0).max(30)).min(1).max(10),
    preJumpTof: z.number().gt(0).max(30).nullable().optional(),
  });

// Deductions are in points (a printed "2" is stored as 0.2). A skill can have
// a 0 deduction (perfect skill), unlike ToF values; per-skill deductions are
// realistically <= 1.0 and the landing <= 2.0, but we allow up to 3 to avoid
// rejecting unusual sheets.
export const insertExecutionSessionSchema = createInsertSchema(executionSessions)
  .omit({ id: true })
  .extend({
    category: z.enum(["set", "vol"]),
    deductions: z.array(z.number().min(0).max(3)).min(1).max(10),
    landingDeduction: z.number().min(0).max(3).nullable().optional(),
  });

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = z.infer<typeof insertRoutineSchema>;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type TofSession = typeof tofSessions.$inferSelect;
export type InsertTofSession = z.infer<typeof insertTofSessionSchema>;

export type ExecutionSession = typeof executionSessions.$inferSelect;
export type InsertExecutionSession = z.infer<typeof insertExecutionSessionSchema>;

export type WhoopToken = typeof whoopTokens.$inferSelect;

export type CoachMessage = typeof coachMessages.$inferSelect;

export type CreateNoteRequest = InsertNote;
export type UpdateNoteRequest = Partial<InsertNote>;
export type NoteResponse = Note;
export type NotesListResponse = Note[];
