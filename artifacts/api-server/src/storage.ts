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
  routineVersions,
  type RoutineVersion,
  type RoutineWithVersions,
  type Score,
  type InsertScore,
  tofSessions,
  type TofSession,
  type InsertTofSession,
  executionSessions,
  type ExecutionSession,
  type InsertExecutionSession,
  whoopTokens,
  type WhoopToken,
  coachMessages,
  type CoachMessage,
  dictionaryEntries,
  type DictionaryEntry,
  type InsertDictionaryEntry,
  dictionarySuggestions,
  dictionaryLibraryImports,
  type DictionarySuggestion,
  type DictionarySuggestionWithMeta,
  type DictionaryAdoptionResult,
  type DictionaryImportPreview,
  type DictionaryImportResult,
} from "@workspace/db";
import {
  users,
  sessions,
  passwordResetTokens,
  type User,
  type PasswordResetToken,
} from "@shared/models/auth";
import { eq, desc, asc, and, isNull, sql, gte, gt, inArray } from "drizzle-orm";
import { applyLineupChange, normalizeVersions, sameLineup } from "@shared/routine-versions";
import { buildDictionaryImportPreview } from "@shared/dictionary-import";

// Thrown when a shape grouping link (parentSkillId) is invalid. Routes map this
// to a 400 so bad links never silently persist.
export class SkillLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillLinkError";
  }
}

// Thrown when a ToF or execution session references a routine the user
// doesn't own. Routes map this to a 400.
export class TofRoutineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TofRoutineError";
  }
}

// Thrown when a dictionary suggestion can't be created (entry missing or a
// duplicate/pointless submission). Routes map codes to 404/409/400 so users
// get a friendly message instead of a silent 500.
export class DictionaryError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "duplicate" | "invalid" = "invalid",
  ) {
    super(message);
    this.name = "DictionaryError";
  }
}
export type DictionaryImageMutation = { entry: DictionaryEntry; staleKeys: string[] };

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

  // Routines (always returned with their past lineup versions embedded)
  getRoutines(userId: string): Promise<RoutineWithVersions[]>;
  getRoutineVersions(userId: string, routineId: number): Promise<RoutineVersion[]>;
  createRoutine(userId: string, routine: InsertRoutine): Promise<RoutineWithVersions>;
  updateRoutine(id: number, userId: string, updates: Partial<InsertRoutine> & { applyFromDay?: string; versions?: { skillIds: number[]; effectiveUntil: string }[] }): Promise<RoutineWithVersions | undefined>;
  deleteRoutine(id: number, userId: string): Promise<void>;

  // Scores
  getScores(userId: string): Promise<Score[]>;
  createScore(userId: string, score: InsertScore): Promise<Score>;
  updateScore(id: number, userId: string, updates: Partial<InsertScore>): Promise<Score | undefined>;
  deleteScore(id: number, userId: string): Promise<void>;

  // ToF sessions
  getTofSessions(userId: string): Promise<TofSession[]>;
  createTofSession(userId: string, session: InsertTofSession): Promise<TofSession>;
  updateTofSession(id: number, userId: string, updates: Partial<InsertTofSession>): Promise<TofSession | undefined>;
  deleteTofSession(id: number, userId: string): Promise<void>;

  // Execution deduction sessions
  getExecutionSessions(userId: string): Promise<ExecutionSession[]>;
  createExecutionSession(userId: string, session: InsertExecutionSession): Promise<ExecutionSession>;
  updateExecutionSession(id: number, userId: string, updates: Partial<InsertExecutionSession>): Promise<ExecutionSession | undefined>;
  deleteExecutionSession(id: number, userId: string): Promise<void>;

  // Shared skills & drills dictionary (owner-curated, global rows)
  getDictionaryEntries(includeArchived: boolean): Promise<DictionaryEntry[]>;
  getDictionaryEntry(id: number): Promise<DictionaryEntry | undefined>;
  createDictionaryEntry(entry: InsertDictionaryEntry): Promise<DictionaryEntry>;
  updateDictionaryEntry(id: number, updates: Partial<InsertDictionaryEntry>): Promise<DictionaryEntry | undefined>;
  setDictionaryDraftImage(id: number, image: { key: string; contentType: string; prompt: string; model: string }): Promise<DictionaryImageMutation>;
  approveDictionaryDraftImage(id: number): Promise<DictionaryImageMutation>;
  removeDictionaryImage(id: number, target: "draft" | "approved" | "all"): Promise<DictionaryImageMutation>;
  previewDictionaryImport(userId: string): Promise<DictionaryImportPreview>;
  importLibraryToDictionary(userId: string): Promise<DictionaryImportResult>;
  ensureInitialDictionaryImport(userId: string): Promise<DictionaryImportResult | null>;
  adoptDictionaryEntry(userId: string, entryId: number): Promise<DictionaryAdoptionResult>;
  createDictionarySuggestion(userId: string, entryId: number, form: { suggestedName: string; note?: string | null }): Promise<DictionarySuggestion>;
  getPendingDictionarySuggestions(): Promise<DictionarySuggestionWithMeta[]>;
  resolveDictionarySuggestion(id: number, action: "accept" | "reject"): Promise<{ suggestion: DictionarySuggestion; entry: DictionaryEntry | null } | undefined>;

  // Reorder
  reorderSkills(userId: string, orderedIds: number[]): Promise<void>;

  // Data migration
  claimLegacyData(userId: string): Promise<void>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  updateUserMenuGuide(id: string, menuGuide: string): Promise<void>;

  // Password reset
  getUserByEmail(email: string): Promise<User | undefined>;
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  getValidResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  completePasswordReset(userId: string, tokenId: string, hashedPassword: string): Promise<boolean>;

  // WHOOP OAuth tokens (per user)
  getWhoopToken(userId: string): Promise<WhoopToken | undefined>;
  upsertWhoopToken(userId: string, token: { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string | null }): Promise<void>;
  deleteWhoopToken(userId: string): Promise<void>;

  // AI coach chat history (per user)
  getCoachMessages(userId: string): Promise<CoachMessage[]>;
  getCoachMessage(userId: string, id: number): Promise<CoachMessage | undefined>;
  createCoachMessage(userId: string, role: "user" | "assistant", content: string, extras?: { images?: string | null; draft?: string | null; proposals?: string | null; suggestions?: string | null }): Promise<CoachMessage>;
  commitCoachExchange(userId: string, exchange: {
    menuGuide?: string | null;
    userMessage: { content: string; images?: string | null };
    assistantMessage: { content: string; draft?: string | null; proposals?: string | null; suggestions?: string | null };
  }): Promise<void>;
  clearCoachMessages(userId: string): Promise<void>;

  // Account deletion
  deleteUserAccount(userId: string): Promise<{ coachImageRefs: unknown[] }>;
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

  async getRoutines(userId: string): Promise<RoutineWithVersions[]> {
    const [rows, versionRows] = await Promise.all([
      db.select().from(routines).where(eq(routines.userId, userId)),
      db.select().from(routineVersions)
        .where(eq(routineVersions.userId, userId))
        .orderBy(asc(routineVersions.effectiveUntil), asc(routineVersions.id)),
    ]);
    const byRoutine = new Map<number, RoutineVersion[]>();
    for (const v of versionRows) {
      const list = byRoutine.get(v.routineId);
      if (list) list.push(v);
      else byRoutine.set(v.routineId, [v]);
    }
    return rows.map((r) => ({ ...r, versions: byRoutine.get(r.id) ?? [] }));
  }

  async getRoutineVersions(userId: string, routineId: number): Promise<RoutineVersion[]> {
    return await db.select().from(routineVersions)
      .where(and(eq(routineVersions.userId, userId), eq(routineVersions.routineId, routineId)))
      .orderBy(asc(routineVersions.effectiveUntil), asc(routineVersions.id));
  }

  async createRoutine(userId: string, insertRoutine: InsertRoutine): Promise<RoutineWithVersions> {
    const [routine] = await db.insert(routines).values({ ...insertRoutine, userId }).returning();
    return { ...routine, versions: [] };
  }

  async updateRoutine(
    id: number,
    userId: string,
    updates: Partial<InsertRoutine> & {
      applyFromDay?: string;
      versions?: { skillIds: number[]; effectiveUntil: string }[];
    },
  ): Promise<RoutineWithVersions | undefined> {
    const { applyFromDay, versions: explicitVersions, ...fields } = updates;
    const [existing] = await db.select().from(routines)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)));
    if (!existing) return undefined;

    // Lineup versioning: only a real lineup change touches versions. With
    // applyFromDay ("change from this day") the pre-edit lineup is preserved
    // for dates before that day; without it, the edit rewrites all history,
    // so any past versions are cleared. Name-only edits (or archive toggles)
    // leave versions untouched.
    //
    // Concurrency (verified end-to-end with the offline queue): the server
    // always recomputes versions from ITS OWN current state, ignoring any
    // client-precomputed list. If another session edits the routine between an
    // offline edit being queued and drained:
    // - a conflicting lineup edit with an EARLIER from-day survives as a
    //   version covering its (non-empty) window;
    // - a conflicting lineup edit with the SAME from-day is dropped by
    //   applyLineupChange because its covered range is empty (exclusive end
    //   days) — correct, not data loss;
    // - non-lineup fields (e.g. a rename) follow last-writer-wins, since the
    //   queued PUT carries the full routine body.
    const lineupChanged = fields.skillIds != null && !sameLineup(fields.skillIds, existing.skillIds);
    if (lineupChanged) {
      const next = applyFromDay
        ? applyLineupChange(existing.skillIds, await this.getRoutineVersions(userId, id), applyFromDay)
        : [];
      await db.delete(routineVersions)
        .where(and(eq(routineVersions.userId, userId), eq(routineVersions.routineId, id)));
      if (next.length > 0) {
        // Insert oldest-first so serial ids preserve the sort order ties rely on.
        await db.insert(routineVersions).values(
          next.map((v) => ({ userId, routineId: id, skillIds: v.skillIds, effectiveUntil: v.effectiveUntil })),
        );
      }
    } else if (explicitVersions !== undefined) {
      // Explicit past-version management (correct a change day / delete a
      // version) with an unchanged current lineup. Normalizing keeps the
      // one-version-per-end-day invariant; a deleted version's date range
      // merges into its neighbor via exclusive-end-day semantics. When a
      // lineup change is in flight, this field is IGNORED above — the server
      // recomputes versions from applyFromDay and stays authoritative.
      const next = normalizeVersions(explicitVersions);
      await db.delete(routineVersions)
        .where(and(eq(routineVersions.userId, userId), eq(routineVersions.routineId, id)));
      if (next.length > 0) {
        await db.insert(routineVersions).values(
          next.map((v) => ({ userId, routineId: id, skillIds: v.skillIds, effectiveUntil: v.effectiveUntil })),
        );
      }
    }

    let updated: Routine | undefined = existing;
    if (Object.keys(fields).length > 0) {
      [updated] = await db.update(routines)
        .set(fields)
        .where(and(eq(routines.id, id), eq(routines.userId, userId)))
        .returning();
    }
    if (updated && fields.name !== undefined && existing.name !== fields.name) {
      await this.renameRoutineParts(userId, id, existing.name, fields.name);
    }
    if (!updated) return undefined;
    return { ...updated, versions: await this.getRoutineVersions(userId, id) };
  }

  // When a routine is renamed, keep ITS OWN auto-named routine parts (isDrill === 3)
  // in sync. Parts are scoped to the renamed routine via the sourceRoutineId link,
  // so renaming one routine NEVER touches another routine's parts (even if names
  // collide). Among that routine's parts, the name/code are rewritten only when
  // they still match the auto pattern from suggestRoutinePartName — either exactly
  // the routine name (full range) or "... of <routineName>" — so user-customized
  // part names/codes (e.g. a short code like "L5") are left untouched.
  private renamePartField(value: string, oldName: string, newName: string): string | null {
    const suffix = ` of ${oldName}`;
    if (value === oldName) return newName;
    if (value.endsWith(suffix)) {
      return value.slice(0, value.length - suffix.length) + ` of ${newName}`;
    }
    return null;
  }

  private async renameRoutineParts(userId: string, routineId: number, oldName: string, newName: string): Promise<void> {
    if (!oldName || oldName === newName) return;
    const parts = await db.select().from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.isDrill, 3), eq(skills.sourceRoutineId, routineId)));
    for (const part of parts) {
      const nextName = this.renamePartField(part.name, oldName, newName);
      const nextCode = this.renamePartField(part.code, oldName, newName);
      if (nextName === null && nextCode === null) continue;
      await db.update(skills)
        .set({ name: nextName ?? part.name, code: nextCode ?? part.code })
        .where(and(eq(skills.id, part.id), eq(skills.userId, userId)));
    }
  }

  async deleteRoutine(id: number, userId: string): Promise<void> {
    await db.delete(routineVersions)
      .where(and(eq(routineVersions.userId, userId), eq(routineVersions.routineId, id)));
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

  async getTofSessions(userId: string): Promise<TofSession[]> {
    return await db.select().from(tofSessions)
      .where(eq(tofSessions.userId, userId))
      .orderBy(desc(tofSessions.date), desc(tofSessions.id));
  }

  // A ToF/execution session targets EITHER a routine or a library item
  // (skill / drill / connection / routine part); exactly one of
  // routineId/skillId must be set and it must belong to the same user.
  // Returns the target's sequence length, or null for a single skill/drill
  // (whose values are repeated attempts of the same skill). The target is
  // exactly one of: a routine, a library skill, or an ad-hoc "connect skills"
  // sequence (2-10 skill ids stored inline on the session row).
  private async assertSessionTarget(
    userId: string,
    routineId: number | null | undefined,
    skillId: number | null | undefined,
    adhocSkillIds: number[] | null | undefined,
  ): Promise<number | null> {
    const hasAdhoc = adhocSkillIds != null && adhocSkillIds.length > 0;
    const picked = [routineId != null, skillId != null, hasAdhoc].filter(Boolean).length;
    if (picked !== 1) {
      throw new TofRoutineError("Pick exactly one target: a routine, a library skill, or a custom skill connection");
    }
    if (routineId != null) {
      const [routine] = await db.select({ skillIds: routines.skillIds }).from(routines)
        .where(and(eq(routines.id, routineId), eq(routines.userId, userId)));
      if (!routine) throw new TofRoutineError("Routine not found");
      return routine.skillIds.length;
    }
    if (skillId != null) {
      const [skill] = await db.select({ skillIds: skills.skillIds }).from(skills)
        .where(and(eq(skills.id, skillId), eq(skills.userId, userId)));
      if (!skill) throw new TofRoutineError("Skill not found");
      return skill.skillIds && skill.skillIds.length > 0 ? skill.skillIds.length : null;
    }
    const ids = adhocSkillIds!;
    if (ids.length < 2 || ids.length > 10) {
      throw new TofRoutineError("A custom skill connection needs 2-10 skills");
    }
    const found = await db.select({ id: skills.id }).from(skills)
      .where(and(inArray(skills.id, Array.from(new Set(ids))), eq(skills.userId, userId)));
    const foundIds = new Set(found.map(r => r.id));
    if (ids.some(id => !foundIds.has(id))) throw new TofRoutineError("Skill not found");
    return ids.length;
  }

  // Values beyond the target's sequence length can't be attributed to any
  // skill; single skills/drills take up to 10 attempts (matching the forms).
  private assertValuesFitTarget(count: number, seqLen: number | null): void {
    const cap = seqLen ?? 10;
    if (count > cap) {
      throw new TofRoutineError(`Too many values for this target (max ${cap})`);
    }
  }

  // Practice/comp invariant (storage-enforced like the target rules): a
  // "comp" session must carry a non-empty competition name, and a practice
  // session never keeps one — so a comp→practice flip can't leave a stale name.
  private normalizeSessionContext(
    context: string | null | undefined,
    compName: string | null | undefined,
  ): { context: "practice" | "comp"; compName: string | null } {
    const ctx = context === "comp" ? "comp" : "practice";
    const name = (compName ?? "").trim();
    if (ctx === "comp" && !name) {
      throw new TofRoutineError("Competition sessions need the competition's name");
    }
    return { context: ctx, compName: ctx === "comp" ? name : null };
  }

  async createTofSession(userId: string, session: InsertTofSession): Promise<TofSession> {
    const seqLen = await this.assertSessionTarget(userId, session.routineId, session.skillId, session.skillIds);
    this.assertValuesFitTarget(session.tofValues.length, seqLen);
    const norm = this.normalizeSessionContext(session.context, session.compName);
    const [row] = await db.insert(tofSessions).values({ ...session, ...norm, userId }).returning();
    return row;
  }

  async updateTofSession(id: number, userId: string, updates: Partial<InsertTofSession>): Promise<TofSession | undefined> {
    if (updates.routineId !== undefined || updates.skillId !== undefined || updates.skillIds !== undefined || updates.tofValues !== undefined) {
      const [existing] = await db.select({ routineId: tofSessions.routineId, skillId: tofSessions.skillId, skillIds: tofSessions.skillIds, tofValues: tofSessions.tofValues })
        .from(tofSessions)
        .where(and(eq(tofSessions.id, id), eq(tofSessions.userId, userId)));
      if (!existing) return undefined;
      const seqLen = await this.assertSessionTarget(
        userId,
        updates.routineId !== undefined ? updates.routineId : existing.routineId,
        updates.skillId !== undefined ? updates.skillId : existing.skillId,
        updates.skillIds !== undefined ? updates.skillIds : existing.skillIds,
      );
      const values = updates.tofValues !== undefined ? updates.tofValues : existing.tofValues;
      this.assertValuesFitTarget(values?.length ?? 0, seqLen);
    }
    if (updates.context !== undefined || updates.compName !== undefined) {
      const [row] = await db.select({ context: tofSessions.context, compName: tofSessions.compName })
        .from(tofSessions)
        .where(and(eq(tofSessions.id, id), eq(tofSessions.userId, userId)));
      if (!row) return undefined;
      updates = {
        ...updates,
        ...this.normalizeSessionContext(
          updates.context !== undefined ? updates.context : row.context,
          updates.compName !== undefined ? updates.compName : row.compName,
        ),
      };
    }
    const [updated] = await db.update(tofSessions)
      .set(updates)
      .where(and(eq(tofSessions.id, id), eq(tofSessions.userId, userId)))
      .returning();
    return updated;
  }

  async getExecutionSessions(userId: string): Promise<ExecutionSession[]> {
    return await db.select().from(executionSessions)
      .where(eq(executionSessions.userId, userId))
      .orderBy(desc(executionSessions.date), desc(executionSessions.id));
  }

  async createExecutionSession(userId: string, session: InsertExecutionSession): Promise<ExecutionSession> {
    const seqLen = await this.assertSessionTarget(userId, session.routineId, session.skillId, session.skillIds);
    this.assertValuesFitTarget(session.deductions.length, seqLen);
    const norm = this.normalizeSessionContext(session.context, session.compName);
    const [row] = await db.insert(executionSessions).values({ ...session, ...norm, userId }).returning();
    return row;
  }

  async updateExecutionSession(id: number, userId: string, updates: Partial<InsertExecutionSession>): Promise<ExecutionSession | undefined> {
    if (updates.routineId !== undefined || updates.skillId !== undefined || updates.skillIds !== undefined || updates.deductions !== undefined) {
      const [existing] = await db.select({ routineId: executionSessions.routineId, skillId: executionSessions.skillId, skillIds: executionSessions.skillIds, deductions: executionSessions.deductions })
        .from(executionSessions)
        .where(and(eq(executionSessions.id, id), eq(executionSessions.userId, userId)));
      if (!existing) return undefined;
      const seqLen = await this.assertSessionTarget(
        userId,
        updates.routineId !== undefined ? updates.routineId : existing.routineId,
        updates.skillId !== undefined ? updates.skillId : existing.skillId,
        updates.skillIds !== undefined ? updates.skillIds : existing.skillIds,
      );
      const values = updates.deductions !== undefined ? updates.deductions : existing.deductions;
      this.assertValuesFitTarget(values?.length ?? 0, seqLen);
    }
    if (updates.context !== undefined || updates.compName !== undefined) {
      const [row] = await db.select({ context: executionSessions.context, compName: executionSessions.compName })
        .from(executionSessions)
        .where(and(eq(executionSessions.id, id), eq(executionSessions.userId, userId)));
      if (!row) return undefined;
      updates = {
        ...updates,
        ...this.normalizeSessionContext(
          updates.context !== undefined ? updates.context : row.context,
          updates.compName !== undefined ? updates.compName : row.compName,
        ),
      };
    }
    const [updated] = await db.update(executionSessions)
      .set(updates)
      .where(and(eq(executionSessions.id, id), eq(executionSessions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteExecutionSession(id: number, userId: string): Promise<void> {
    await db.delete(executionSessions).where(and(eq(executionSessions.id, id), eq(executionSessions.userId, userId)));
  }

  async deleteTofSession(id: number, userId: string): Promise<void> {
    await db.delete(tofSessions).where(and(eq(tofSessions.id, id), eq(tofSessions.userId, userId)));
  }

  // ---- Shared skills & drills dictionary ----

  async getDictionaryEntries(includeArchived: boolean): Promise<DictionaryEntry[]> {
    const base = db.select().from(dictionaryEntries);
    const query = includeArchived ? base : base.where(eq(dictionaryEntries.archived, 0));
    // Same feel as the personal library: explicit sort order first (nulls
    // last), then hardest skills first, then insertion order.
    return await query.orderBy(
      sql`coalesce(${dictionaryEntries.sortOrder}, 2147483647)`,
      desc(dictionaryEntries.difficulty),
      asc(dictionaryEntries.id),
    );
  }

  async getDictionaryEntry(id: number): Promise<DictionaryEntry | undefined> {
    const [entry] = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, id));
    return entry;
  }

  async createDictionaryEntry(entry: InsertDictionaryEntry): Promise<DictionaryEntry> {
    const [created] = await db.insert(dictionaryEntries).values(entry).returning();
    return created;
  }

  async updateDictionaryEntry(id: number, updates: Partial<InsertDictionaryEntry>): Promise<DictionaryEntry | undefined> {
    if (Object.keys(updates).length === 0) {
      return await this.getDictionaryEntry(id);
    }
    const [updated] = await db.update(dictionaryEntries)
      .set(updates)
      .where(eq(dictionaryEntries.id, id))
      .returning();
    return updated;
  }

  async setDictionaryDraftImage(
    id: number,
    image: { key: string; contentType: string; prompt: string; model: string },
  ): Promise<DictionaryImageMutation> {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(dictionaryEntries)
        .where(eq(dictionaryEntries.id, id)).for("update");
      if (!current) throw new DictionaryError("Dictionary entry not found", "not_found");
      const [entry] = await tx.update(dictionaryEntries).set({
        draftImageKey: image.key, draftImageContentType: image.contentType,
        draftImagePrompt: image.prompt, draftImageModel: image.model,
        draftImageCreatedAt: new Date(),
      }).where(eq(dictionaryEntries.id, id)).returning();
      return { entry, staleKeys: current.draftImageKey ? [current.draftImageKey] : [] };
    });
  }

  async approveDictionaryDraftImage(id: number): Promise<DictionaryImageMutation> {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(dictionaryEntries)
        .where(eq(dictionaryEntries.id, id)).for("update");
      if (!current) throw new DictionaryError("Dictionary entry not found", "not_found");
      if (!current.draftImageKey || !current.draftImageContentType) {
        throw new DictionaryError("Generate an image draft before approving it", "invalid");
      }
      const [entry] = await tx.update(dictionaryEntries).set({
        approvedImageKey: current.draftImageKey,
        approvedImageContentType: current.draftImageContentType,
        approvedImagePrompt: current.draftImagePrompt,
        approvedImageModel: current.draftImageModel,
        approvedImageApprovedAt: new Date(),
        draftImageKey: null, draftImageContentType: null, draftImagePrompt: null,
        draftImageModel: null, draftImageCreatedAt: null,
      }).where(eq(dictionaryEntries.id, id)).returning();
      return { entry, staleKeys: current.approvedImageKey ? [current.approvedImageKey] : [] };
    });
  }

  async removeDictionaryImage(
    id: number, target: "draft" | "approved" | "all",
  ): Promise<DictionaryImageMutation> {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(dictionaryEntries)
        .where(eq(dictionaryEntries.id, id)).for("update");
      if (!current) throw new DictionaryError("Dictionary entry not found", "not_found");
      const removeDraft = target === "draft" || target === "all";
      const removeApproved = target === "approved" || target === "all";
      const [entry] = await tx.update(dictionaryEntries).set({
        ...(removeDraft ? { draftImageKey: null, draftImageContentType: null, draftImagePrompt: null, draftImageModel: null, draftImageCreatedAt: null } : {}),
        ...(removeApproved ? { approvedImageKey: null, approvedImageContentType: null, approvedImagePrompt: null, approvedImageModel: null, approvedImageApprovedAt: null } : {}),
      }).where(eq(dictionaryEntries.id, id)).returning();
      return {
        entry,
        staleKeys: [removeDraft ? current.draftImageKey : null, removeApproved ? current.approvedImageKey : null]
          .filter((key): key is string => !!key),
      };
    });
  }

  async previewDictionaryImport(userId: string): Promise<DictionaryImportPreview> {
    const [library, entries] = await Promise.all([
      db.select().from(skills).where(eq(skills.userId, userId)),
      db.select().from(dictionaryEntries),
    ]);
    return buildDictionaryImportPreview(library, entries);
  }

  private async runDictionaryImport(
    userId: string,
    claimInitialImport: boolean,
  ): Promise<DictionaryImportResult | null> {
    return await db.transaction(async (tx) => {
      // Dictionary rows are global, so every import shares ONE lock. A per-user
      // lock lets two admins create the same normalized entry concurrently.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"dictionary-library-import"}))`,
      );

      if (claimInitialImport) {
        const [completed] = await tx
          .select({ userId: dictionaryLibraryImports.userId })
          .from(dictionaryLibraryImports)
          .where(eq(dictionaryLibraryImports.userId, userId))
          .limit(1);
        if (completed) return null;
      }

      const [library, entries] = await Promise.all([
        tx.select().from(skills).where(eq(skills.userId, userId)),
        tx.select().from(dictionaryEntries),
      ]);
      const preview = buildDictionaryImportPreview(library, entries);
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      const linkedEntryIds = new Set(
        library
          .map((skill) => skill.dictionaryEntryId)
          .filter((id): id is number => id != null),
      );
      let added = 0;
      let reused = 0;
      let linked = 0;

      for (const candidate of preview.candidates) {
        let entryId = candidate.dictionaryEntryId;
        if (entryId == null) {
          const [created] = await tx
            .insert(dictionaryEntries)
            .values({
              name: candidate.name,
              shortName: candidate.shortName,
              // Most existing personal codes are the numeric notation. Copy
              // every value so the owner only has to clear the exceptions.
              numeric: candidate.shortName,
              isDrill: candidate.isDrill,
              difficulty: candidate.difficulty,
              description: null,
              sortOrder: candidate.sortOrder,
              archived: 0,
            })
            .returning();
          entryId = created.id;
          entriesById.set(created.id, created);
          added += 1;
        } else {
          reused += 1;
          const existing = entriesById.get(entryId);
          if (existing?.archived === 1) {
            await tx
              .update(dictionaryEntries)
              .set({ archived: 0 })
              .where(eq(dictionaryEntries.id, entryId));
            entriesById.set(entryId, { ...existing, archived: 0 });
          }
        }

        // Linking the original row makes the dictionary show "Added" for the
        // owner and is the durable idempotency key after an entry is renamed.
        // A duplicate personal row may resolve to an entry already linked by
        // its twin; in that case the shared entry is still correctly reused.
        if (!linkedEntryIds.has(entryId)) {
          const [sourceLinked] = await tx
            .update(skills)
            .set({ dictionaryEntryId: entryId })
            .where(and(
              eq(skills.id, candidate.skillId),
              eq(skills.userId, userId),
              isNull(skills.dictionaryEntryId),
            ))
            .returning({ id: skills.id });
          if (sourceLinked) {
            linked += 1;
            linkedEntryIds.add(entryId);
          }
        }
      }

      if (claimInitialImport) {
        await tx
          .insert(dictionaryLibraryImports)
          .values({ userId });
      }

      return {
        total: preview.counts.total,
        added,
        reused,
        linked,
        skipped: preview.counts.skipped,
      };
    });
  }

  async importLibraryToDictionary(userId: string): Promise<DictionaryImportResult> {
    const result = await this.runDictionaryImport(userId, false);
    // A manual import never claims the startup marker, so this cannot be null.
    if (!result) throw new Error("Dictionary import unexpectedly skipped");
    return result;
  }

  async ensureInitialDictionaryImport(userId: string): Promise<DictionaryImportResult | null> {
    return await this.runDictionaryImport(userId, true);
  }

  async adoptDictionaryEntry(
    userId: string,
    entryId: number,
  ): Promise<DictionaryAdoptionResult> {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(and(
          eq(dictionaryEntries.id, entryId),
          eq(dictionaryEntries.archived, 0),
        ))
        .limit(1);
      if (!entry) {
        throw new DictionaryError("Dictionary entry not found", "not_found");
      }

      const findExisting = async () => {
        const [existing] = await tx
          .select()
          .from(skills)
          .where(and(
            eq(skills.userId, userId),
            eq(skills.dictionaryEntryId, entryId),
          ))
          .limit(1);
        return existing;
      };

      const restoreOrReturn = async (
        existing: Skill,
      ): Promise<DictionaryAdoptionResult> => {
        if (existing.archived !== 1) {
          return { skill: existing, status: "existing" };
        }
        const [restored] = await tx
          .update(skills)
          .set({ archived: 0 })
          .where(and(eq(skills.id, existing.id), eq(skills.userId, userId)))
          .returning();
        return { skill: restored ?? { ...existing, archived: 0 }, status: "restored" };
      };

      const existing = await findExisting();
      if (existing) return await restoreOrReturn(existing);

      const sameCategory = await tx
        .select()
        .from(skills)
        .where(and(
          eq(skills.userId, userId),
          eq(skills.isDrill, entry.isDrill),
        ));
      const sorted = sameCategory
        .map((skill) => ({
          id: skill.id,
          sortOrder: skill.sortOrder ?? 999999,
          difficulty: skill.difficulty,
        }))
        .sort((a, b) =>
          a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : b.difficulty - a.difficulty,
        );
      let insertIdx = sorted.length;
      for (let i = 0; i < sorted.length; i += 1) {
        if (entry.difficulty >= sorted[i].difficulty) {
          insertIdx = i;
          break;
        }
      }

      await Promise.all(
        sorted.slice(insertIdx).map((skill, offset) =>
          tx
            .update(skills)
            .set({ sortOrder: insertIdx + offset + 1 })
            .where(eq(skills.id, skill.id)),
        ),
      );
      for (let i = 0; i < insertIdx; i += 1) {
        if (sorted[i].sortOrder !== i) {
          await tx
            .update(skills)
            .set({ sortOrder: i })
            .where(eq(skills.id, sorted[i].id));
        }
      }

      const [created] = await tx
        .insert(skills)
        .values({
          userId,
          name: entry.name,
          code: entry.shortName,
          difficulty: entry.difficulty,
          isDrill: entry.isDrill,
          sortOrder: insertIdx,
          dictionaryEntryId: entry.id,
        })
        .onConflictDoNothing({
          target: [skills.userId, skills.dictionaryEntryId],
          // drizzle-orm 0.39 types this partial-index predicate as `where`
          // (newer releases call it targetWhere).
          where: sql`${skills.dictionaryEntryId} IS NOT NULL`,
        })
        .returning();
      if (created) {
        return { skill: created, status: "created" };
      }

      // A concurrent retry won the unique-index race. READ COMMITTED gives
      // this statement a fresh snapshot, so return that same copy.
      const raced = await findExisting();
      if (!raced) {
        throw new DictionaryError("Couldn't add this entry to your library");
      }
      return await restoreOrReturn(raced);
    });
  }

  async createDictionarySuggestion(
    userId: string,
    entryId: number,
    form: { suggestedName: string; note?: string | null },
  ): Promise<DictionarySuggestion> {
    const entry = await this.getDictionaryEntry(entryId);
    if (!entry || entry.archived === 1) {
      throw new DictionaryError("Dictionary entry not found", "not_found");
    }
    const suggestedName = form.suggestedName.trim();
    const normalized = suggestedName.toLowerCase();
    const alreadyListed = [entry.name, ...(entry.altNames ?? [])]
      .some((n) => n.trim().toLowerCase() === normalized);
    if (alreadyListed) {
      throw new DictionaryError("That name is already listed on this entry", "duplicate");
    }
    // Obvious-duplicate guard: the same user re-submitting the same text for
    // the same entry while the first one is still pending.
    const [dup] = await db.select({ id: dictionarySuggestions.id })
      .from(dictionarySuggestions)
      .where(and(
        eq(dictionarySuggestions.entryId, entryId),
        eq(dictionarySuggestions.userId, userId),
        eq(dictionarySuggestions.status, "pending"),
        sql`lower(trim(${dictionarySuggestions.suggestedName})) = ${normalized}`,
      ))
      .limit(1);
    if (dup) {
      throw new DictionaryError("You've already suggested this — it's waiting for review", "duplicate");
    }
    const note = (form.note ?? "").trim();
    try {
      const [created] = await db.insert(dictionarySuggestions)
        .values({ entryId, userId, suggestedName, note: note || null })
        .returning();
      return created;
    } catch (error) {
      // The partial expression index is the race-safe counterpart to the
      // friendly pre-check above.
      if ((error as { code?: string } | null)?.code === "23505") {
        throw new DictionaryError("You've already suggested this — it's waiting for review", "duplicate");
      }
      throw error;
    }
  }

  async getPendingDictionarySuggestions(): Promise<DictionarySuggestionWithMeta[]> {
    const rows = await db
      .select({
        suggestion: dictionarySuggestions,
        entryName: dictionaryEntries.name,
        entryShortName: dictionaryEntries.shortName,
        entryIsDrill: dictionaryEntries.isDrill,
        submitterDisplayName: users.displayName,
        submitterEmail: users.email,
      })
      .from(dictionarySuggestions)
      .leftJoin(dictionaryEntries, eq(dictionarySuggestions.entryId, dictionaryEntries.id))
      .leftJoin(users, eq(dictionarySuggestions.userId, users.id))
      .where(eq(dictionarySuggestions.status, "pending"))
      .orderBy(asc(dictionarySuggestions.createdAt), asc(dictionarySuggestions.id));
    return rows.map((r) => ({
      ...r.suggestion,
      entryName: r.entryName ?? "(deleted entry)",
      entryShortName: r.entryShortName ?? "",
      entryIsDrill: r.entryIsDrill ?? 0,
      submitterName: r.submitterDisplayName || r.submitterEmail || null,
    }));
  }

  async resolveDictionarySuggestion(
    id: number,
    action: "accept" | "reject",
  ): Promise<{ suggestion: DictionarySuggestion; entry: DictionaryEntry | null } | undefined> {
    return await db.transaction(async (tx) => {
      // Conditional update is the atomic guard: only a PENDING row resolves,
      // so a double-click can't accept the same suggestion twice.
      const [suggestion] = await tx.update(dictionarySuggestions)
        .set({ status: action === "accept" ? "accepted" : "rejected", resolvedAt: new Date() })
        .where(and(eq(dictionarySuggestions.id, id), eq(dictionarySuggestions.status, "pending")))
        .returning();
      if (!suggestion) return undefined;

      let entry: DictionaryEntry | null = null;
      if (action === "accept") {
        const [existing] = await tx.select().from(dictionaryEntries)
          .where(eq(dictionaryEntries.id, suggestion.entryId));
        if (existing) {
          entry = existing;
          const name = suggestion.suggestedName.trim();
          const normalized = name.toLowerCase();
          // Compute the append inside the UPDATE so two different accepted
          // suggestions cannot overwrite each other's altNames arrays.
          const [updated] = await tx.update(dictionaryEntries)
            .set({
              altNames: sql`
                CASE
                  WHEN lower(btrim(${dictionaryEntries.name})) = ${normalized}
                    OR EXISTS (
                      SELECT 1
                      FROM unnest(${dictionaryEntries.altNames}) AS listed(name)
                      WHERE lower(btrim(listed.name)) = ${normalized}
                    )
                  THEN ${dictionaryEntries.altNames}
                  ELSE array_append(${dictionaryEntries.altNames}, ${name})
                END
              `,
            })
            .where(eq(dictionaryEntries.id, existing.id))
            .returning();
          entry = updated ?? existing;
        }
      }
      return { suggestion, entry };
    });
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

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserMenuGuide(id: string, menuGuide: string): Promise<void> {
    await db.update(users).set({ menuGuide, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  }

  async getValidResetTokenByHash(
    tokenHash: string,
  ): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      );
    return token;
  }

  // Atomic reset completion. Returns false if the specific token could not be
  // consumed (already used, expired, or lost a concurrent race) — in that case
  // nothing is changed. On success: consume THIS token, set the new password,
  // invalidate every other outstanding reset token for the user, and destroy
  // all of that user's sessions (force re-login everywhere after a change).
  async completePasswordReset(
    userId: string,
    tokenId: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // Conditional UPDATE...RETURNING is the atomic single-use guard: a
      // concurrent submit blocks on the row lock, then re-evaluates the
      // `usedAt IS NULL` predicate against the committed row and matches 0 rows.
      const consumed = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.id, tokenId),
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .returning({ id: passwordResetTokens.id });

      if (consumed.length === 0) {
        return false;
      }

      await tx
        .update(users)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
          ),
        );

      await tx
        .delete(sessions)
        .where(sql`${sessions.sess}->>'userId' = ${userId}`);

      return true;
    });
  }

  // ---- WHOOP OAuth tokens (per user) ----

  async getWhoopToken(userId: string): Promise<WhoopToken | undefined> {
    const [row] = await db.select().from(whoopTokens).where(eq(whoopTokens.userId, userId));
    return row;
  }

  async upsertWhoopToken(
    userId: string,
    token: { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string | null },
  ): Promise<void> {
    await db
      .insert(whoopTokens)
      .values({
        userId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scope: token.scope,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: whoopTokens.userId,
        set: {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
          scope: token.scope,
          updatedAt: new Date(),
        },
      });
  }

  async deleteWhoopToken(userId: string): Promise<void> {
    await db.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
  }

  // ---- AI coach chat history (per user) ----

  async getCoachMessages(userId: string): Promise<CoachMessage[]> {
    return await db.select().from(coachMessages)
      .where(eq(coachMessages.userId, userId))
      .orderBy(coachMessages.createdAt, coachMessages.id);
  }

  async getCoachMessage(userId: string, id: number): Promise<CoachMessage | undefined> {
    const [row] = await db.select().from(coachMessages)
      .where(and(eq(coachMessages.userId, userId), eq(coachMessages.id, id)));
    return row;
  }

  async createCoachMessage(
    userId: string,
    role: "user" | "assistant",
    content: string,
    extras?: { images?: string | null; draft?: string | null; proposals?: string | null; suggestions?: string | null },
  ): Promise<CoachMessage> {
    const [row] = await db.insert(coachMessages)
      .values({
        userId,
        role,
        content,
        images: extras?.images ?? null,
        draft: extras?.draft ?? null,
        proposals: extras?.proposals ?? null,
        suggestions: extras?.suggestions ?? null,
      })
      .returning();
    return row;
  }

  async clearCoachMessages(userId: string): Promise<void> {
    await db.delete(coachMessages).where(eq(coachMessages.userId, userId));
  }

  // Permanently removes a user and every row that belongs to them, in one
  // transaction. Returns the coach photo entries so the caller can remove
  // the stored files afterwards (best-effort, outside the transaction).
  async deleteUserAccount(userId: string): Promise<{ coachImageRefs: unknown[] }> {
    return await db.transaction(async (tx) => {
      const messages = await tx
        .select({ images: coachMessages.images })
        .from(coachMessages)
        .where(eq(coachMessages.userId, userId));
      const coachImageRefs: unknown[] = [];
      for (const m of messages) {
        if (!m.images) continue;
        try {
          const parsed = JSON.parse(m.images);
          if (Array.isArray(parsed)) coachImageRefs.push(...parsed);
        } catch {
          // Malformed legacy value; nothing stored to clean up.
        }
      }

      await tx.delete(coachMessages).where(eq(coachMessages.userId, userId));
      await tx.delete(notes).where(eq(notes.userId, userId));
      await tx.delete(scores).where(eq(scores.userId, userId));
      await tx.delete(routineVersions).where(eq(routineVersions.userId, userId));
      await tx.delete(routines).where(eq(routines.userId, userId));
      await tx.delete(skills).where(eq(skills.userId, userId));
      await tx.delete(tofSessions).where(eq(tofSessions.userId, userId));
      await tx.delete(executionSessions).where(eq(executionSessions.userId, userId));
      await tx.delete(dictionarySuggestions).where(eq(dictionarySuggestions.userId, userId));
      await tx.delete(dictionaryLibraryImports).where(eq(dictionaryLibraryImports.userId, userId));
      await tx.delete(whoopTokens).where(eq(whoopTokens.userId, userId));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
      // Sign the user out everywhere.
      await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${userId}`);
      await tx.delete(users).where(eq(users.id, userId));
      return { coachImageRefs };
    });
  }

  // One coach chat turn = one atomic commit: the optional menu-guide update
  // plus BOTH message rows land in a single database transaction. Used by the
  // streaming chat so a stopped reply can never leave partial state (an
  // orphaned user turn or a guide change without its visible reply).
  async commitCoachExchange(
    userId: string,
    exchange: {
      menuGuide?: string | null;
      userMessage: { content: string; images?: string | null };
      assistantMessage: { content: string; draft?: string | null; proposals?: string | null; suggestions?: string | null };
    },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      if (exchange.menuGuide != null) {
        await tx.update(users).set({ menuGuide: exchange.menuGuide, updatedAt: new Date() }).where(eq(users.id, userId));
      }
      await tx.insert(coachMessages).values({
        userId,
        role: "user",
        content: exchange.userMessage.content,
        images: exchange.userMessage.images ?? null,
      });
      await tx.insert(coachMessages).values({
        userId,
        role: "assistant",
        content: exchange.assistantMessage.content,
        draft: exchange.assistantMessage.draft ?? null,
        proposals: exchange.assistantMessage.proposals ?? null,
        suggestions: exchange.assistantMessage.suggestions ?? null,
      });
    });
  }
}

export const storage = new DatabaseStorage();
