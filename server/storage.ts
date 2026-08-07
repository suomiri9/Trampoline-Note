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
  type CoachMessage
} from "@shared/schema";
import {
  users,
  sessions,
  passwordResetTokens,
  type User,
  type PasswordResetToken,
} from "@shared/models/auth";
import { eq, desc, asc, and, isNull, sql, gte, gt, inArray } from "drizzle-orm";
import { applyLineupChange, sameLineup } from "@shared/routine-versions";

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
  updateRoutine(id: number, userId: string, updates: Partial<InsertRoutine> & { applyFromDay?: string }): Promise<RoutineWithVersions | undefined>;
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
    updates: Partial<InsertRoutine> & { applyFromDay?: string },
  ): Promise<RoutineWithVersions | undefined> {
    const { applyFromDay, ...fields } = updates;
    const [existing] = await db.select().from(routines)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)));
    if (!existing) return undefined;

    // Lineup versioning: only a real lineup change touches versions. With
    // applyFromDay ("change from this day") the pre-edit lineup is preserved
    // for dates before that day; without it, the edit rewrites all history,
    // so any past versions are cleared. Name-only edits (or archive toggles)
    // leave versions untouched.
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

  async createTofSession(userId: string, session: InsertTofSession): Promise<TofSession> {
    const seqLen = await this.assertSessionTarget(userId, session.routineId, session.skillId, session.skillIds);
    this.assertValuesFitTarget(session.tofValues.length, seqLen);
    const [row] = await db.insert(tofSessions).values({ ...session, userId }).returning();
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
    const [row] = await db.insert(executionSessions).values({ ...session, userId }).returning();
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
