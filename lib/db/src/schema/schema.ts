import { pgTable, text, serial, integer, date, real, varchar, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

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

export const skills = pgTable(
  "skills",
  {
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
    // When set, this personal row was adopted (copied) from the shared
    // dictionary entry with this id. Used ONLY to mark "already in your
    // library" in the dictionary UI — there is no sync-back; later dictionary
    // edits never touch adopted copies.
    dictionaryEntryId: integer("dictionary_entry_id"),
  },
  (table) => [
    // One provenance-linked copy per athlete. Archived copies keep the link so
    // adopting again can restore the same row instead of creating a duplicate.
    uniqueIndex("skills_user_dictionary_entry_unique")
      .on(table.userId, table.dictionaryEntryId)
      .where(sql`${table.dictionaryEntryId} IS NOT NULL`),
  ],
);

export const routines = pgTable("routines", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  code: text("code"),
  // Which competition slot this lineup is: "set" | "vol" | null (unlabeled).
  // Drives score-entry defaults and set/vol badges; scores keep their own
  // per-entry category (what was actually performed that day).
  category: text("category"),
  skillIds: integer("skill_ids").array().notNull(), // Array of 10 skill IDs (the CURRENT lineup)
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Past lineups of a routine ("change from this day" versioning). Each row is a
// lineup that applied to training dates strictly BEFORE effective_until (an
// athlete-local yyyy-mm-dd day); the routines row itself always holds the
// CURRENT lineup, so all "current routine" surfaces keep working unchanged.
// Resolution rules live in shared/routine-versions.ts.
export const routineVersions = pgTable("routine_versions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  routineId: integer("routine_id").notNull(),
  skillIds: integer("skill_ids").array().notNull(),
  effectiveUntil: date("effective_until").notNull(), // exclusive end day
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
// per-jump ToF values (in seconds, in jump order) for one attempt — entered
// manually or parsed from a Veriflite screenshot. The target is EITHER a
// routine (routineId) OR a library item (skillId — skill, drill, connection,
// routine part); exactly one of the two is set. A sequence target (routine /
// connection / routine part) defines which skill was performed at each
// position; a single skill or drill target means every value is another
// attempt of that same skill (e.g. a swing series).
export const tofSessions = pgTable("tof_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  routineId: integer("routine_id").references(() => routines.id),
  skillId: integer("skill_id").references(() => skills.id),
  // Ad-hoc "connect skills" target: 2-10 skill ids in performed order, stored
  // inline (no library item). Exactly one of routineId/skillId/skillIds is set.
  skillIds: integer("skill_ids").array(),
  tofValues: real("tof_values").array().notNull(), // 1-10 per-jump ToF seconds, jump order
  // Optional in-bounce jump ToF right before skill 1, so the first skill also
  // gets a drop-vs-previous value. Derivable from a Veriflite screenshot as
  // jump1 ToF minus jump1's "Difference".
  preJumpTof: real("pre_jump_tof"),
  note: text("note"),
  // Where this run happened: normal training ("practice", default) or a
  // competition ("comp"). Comp sessions carry the competition's name.
  context: text("context").notNull().default("practice"),
  compName: text("comp_name"),
});

// Execution deduction tracker sessions (per user). Each session records the
// per-skill execution deductions for one routine attempt — 10 skills plus a
// landing deduction — entered manually or parsed from a judges'-sheet photo.
// Values are stored in POINTS (0.2), while sheets print tenths (2 = 0.2);
// the shared/execution.ts helpers convert. The target (routine or library
// item — same rules as tofSessions) defines which skill each deduction
// belongs to. Implied E score = 20 - (sum + landing), routine targets only.
export const executionSessions = pgTable("execution_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  routineId: integer("routine_id").references(() => routines.id),
  skillId: integer("skill_id").references(() => skills.id), // library-item target
  // Ad-hoc "connect skills" target: 2-10 skill ids in performed order, stored
  // inline (no library item). Exactly one of routineId/skillId/skillIds is set.
  skillIds: integer("skill_ids").array(),
  category: text("category").notNull().default("vol"), // "set" (compulsory) or "vol" (voluntary); only meaningful for routine targets
  deductions: real("deductions").array().notNull(), // 1-10 per-skill deductions in points, skill order (0 = perfect skill)
  // Landing deduction in points; 0 = clean landing as printed, null = not
  // recorded (e.g. interrupted routine with no landing judged).
  landingDeduction: real("landing_deduction"),
  note: text("note"),
  // Where this run happened: normal training ("practice", default) or a
  // competition ("comp"). Comp sessions carry the competition's name.
  context: text("context").notNull().default("practice"),
  compName: text("comp_name"),
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

// Shared skills & drills dictionary, curated by the app owner (users.isAdmin).
// GLOBAL rows — no userId. Every signed-in user can browse/search entries and
// copy one into their personal library ("adopt" = a plain skills-row copy);
// entries are flat (no shape groups) and adopted copies never sync back.
export const dictionaryEntries = pgTable("dictionary_entries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // `code` is the legacy physical column name. In the product this value is
  // the familiar short name copied into a personal skill's `code` field.
  shortName: text("code").notNull(),
  // Trampoline numeric notation is separate and not available for every item.
  numeric: text("numeric"),
  isDrill: integer("is_drill").notNull().default(0), // 0 = skill, 1 = drill
  difficulty: real("difficulty").notNull().default(0),
  description: text("description"),
  // Accepted "also called ..." names, appended when the owner accepts a
  // user suggestion (never edited directly through the entry editor).
  altNames: text("alt_names").array().notNull().default(sql`'{}'::text[]`),
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived (hidden from non-admins)
  sortOrder: integer("sort_order"),
  draftImageKey: text("draft_image_key"),
  draftImageContentType: text("draft_image_content_type"),
  draftImagePrompt: text("draft_image_prompt"),
  draftImageModel: text("draft_image_model"),
  draftImageCreatedAt: timestamp("draft_image_created_at"),
  approvedImageKey: text("approved_image_key"),
  approvedImageContentType: text("approved_image_content_type"),
  approvedImagePrompt: text("approved_image_prompt"),
  approvedImageModel: text("approved_image_model"),
  approvedImageApprovedAt: timestamp("approved_image_approved_at"),
});

// User-submitted corrections for dictionary entries ("this skill is also
// called X"). Pending rows form the owner's review queue; accepting stores
// the text on the entry's altNames, rejecting just resolves the row.
export const dictionarySuggestions = pgTable("dictionary_suggestions", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  userId: varchar("user_id").notNull(), // submitting user
  suggestedName: text("suggested_name").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // "pending" | "accepted" | "rejected"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Marks the owner's explicitly confirmed one-time library import as complete
// in each environment. The normal Import button can still be run later for
// newly added personal skills; this marker only prevents startup from silently
// importing future additions on every deploy/restart.
export const dictionaryLibraryImports = pgTable("dictionary_library_imports", {
  userId: varchar("user_id").primaryKey(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
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
export const insertRoutineSchema = createInsertSchema(routines)
  .omit({ id: true, createdAt: true })
  .extend({
    // Only the two competition slots (or null to clear) — free-text here would
    // silently break badges and score-entry defaulting.
    category: z.enum(["set", "vol"]).nullable().optional(),
  });
export const insertScoreSchema = createInsertSchema(scores)
  .omit({ id: true })
  .extend({
    // The client derives this from the picked routine's tag; reject junk here
    // so nothing can write a category the stats splits don't understand.
    category: z.enum(["set", "vol", "both", "vol_vol"]).optional(),
  });
export const insertTofSessionSchema = createInsertSchema(tofSessions)
  .omit({ id: true })
  .extend({
    tofValues: z.array(z.number().gt(0).max(30)).min(1).max(10),
    preJumpTof: z.number().gt(0).max(30).nullable().optional(),
    skillIds: z.array(z.number().int().positive()).min(2).max(10).nullable().optional(),
    context: z.enum(["practice", "comp"]).optional(),
    compName: z.string().trim().max(80).nullable().optional(),
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
    skillIds: z.array(z.number().int().positive()).min(2).max(10).nullable().optional(),
    context: z.enum(["practice", "comp"]).optional(),
    compName: z.string().trim().max(80).nullable().optional(),
  });

// altNames is deliberately NOT part of the entry editor payload — it can only
// grow via accepted suggestions (storage-side), so the editor can't clobber it.
export const insertDictionaryEntrySchema = createInsertSchema(dictionaryEntries)
  .omit({
    id: true, altNames: true,
    draftImageKey: true, draftImageContentType: true, draftImagePrompt: true,
    draftImageModel: true, draftImageCreatedAt: true,
    approvedImageKey: true, approvedImageContentType: true,
    approvedImagePrompt: true, approvedImageModel: true, approvedImageApprovedAt: true,
  })
  .extend({
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: z.string().trim().min(1, "Short name is required").max(40),
    numeric: z.string().trim().max(40).nullable().optional(),
    isDrill: z.union([z.literal(0), z.literal(1)]).optional(), // dictionary entries are only skills or drills
    difficulty: z.number().min(0).max(30).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  });

// What a user fills in on the per-entry "suggest a correction" form; the
// entry id comes from the URL and everything else is server-set.
export const dictionarySuggestionFormSchema = z.object({
  suggestedName: z.string().trim().min(1, "Suggested name is required").max(120),
  note: z.string().trim().max(500).nullable().optional(),
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = z.infer<typeof insertRoutineSchema>;

export type RoutineVersion = typeof routineVersions.$inferSelect;
// Minimal snapshot shape shared by server rows and client-computed optimistic
// versions (offline edits precompute these before the server row exists).
export type RoutineVersionSnapshot = { id?: number; skillIds: number[]; effectiveUntil: string };
// Routines travel with their past versions everywhere (API + offline mirror).
export type RoutineWithVersions = Routine & { versions?: RoutineVersionSnapshot[] };

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type TofSession = typeof tofSessions.$inferSelect;
export type InsertTofSession = z.infer<typeof insertTofSessionSchema>;

export type ExecutionSession = typeof executionSessions.$inferSelect;
export type InsertExecutionSession = z.infer<typeof insertExecutionSessionSchema>;

export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type InsertDictionaryEntry = z.infer<typeof insertDictionaryEntrySchema>;

export type DictionarySuggestion = typeof dictionarySuggestions.$inferSelect;
export type DictionarySuggestionForm = z.infer<typeof dictionarySuggestionFormSchema>;
// A pending suggestion as shown in the owner's review queue: joined with the
// entry it corrects and the submitting user's display info.
export type DictionarySuggestionWithMeta = DictionarySuggestion & {
  entryName: string;
  entryShortName: string;
  entryIsDrill: number;
  submitterName: string | null;
};

export type DictionaryAdoptionResult = {
  skill: Skill;
  status: "created" | "existing" | "restored";
};

export type DictionaryImportCandidate = {
  skillId: number;
  name: string;
  shortName: string;
  isDrill: 0 | 1;
  difficulty: number;
  sortOrder: number | null;
  status: "new" | "linked" | "matched";
  dictionaryEntryId: number | null;
};

export type DictionaryImportSkipped = {
  skillId: number;
  name: string;
  reason: "archived" | "not-a-skill-or-drill" | "shape-group" | "invalid" | "duplicate";
};

export type DictionaryImportPreview = {
  candidates: DictionaryImportCandidate[];
  skipped: DictionaryImportSkipped[];
  counts: {
    total: number;
    toAdd: number;
    reused: number;
    skipped: number;
  };
};

export type DictionaryImportResult = {
  total: number;
  added: number;
  reused: number;
  linked: number;
  skipped: number;
};

export type WhoopToken = typeof whoopTokens.$inferSelect;

export type CoachMessage = typeof coachMessages.$inferSelect;

export type CreateNoteRequest = InsertNote;
export type UpdateNoteRequest = Partial<InsertNote>;
export type NoteResponse = Note;
export type NotesListResponse = Note[];
