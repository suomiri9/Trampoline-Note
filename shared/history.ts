import type { Note, Routine, Skill } from "./schema";

// History calculations shared by the Express server and the on-device
// store used by the iOS app.

interface SkillEntry { id: number; reps?: number }

export function parseSkillsField(skillsString: string): SkillEntry[] {
  try {
    const parsed = JSON.parse(skillsString);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) =>
        typeof item === "number" ? { id: item } : (item as SkillEntry)
      );
    }
    return skillsString.split(",").map(s => ({ id: parseInt(s) }));
  } catch {
    return skillsString.split(",").map(s => ({ id: parseInt(s) }));
  }
}

export function skillHistory(skillId: number, allNotes: Note[], userRoutines: Routine[], userSkills: Skill[]) {
  const fcMap = new Map<number, number[]>();
  for (const sk of userSkills) {
    if ((sk.isDrill === 2 || sk.isDrill === 3) && sk.skillIds) {
      fcMap.set(sk.id, sk.skillIds);
    }
  }

  const entries: Array<{
    noteId: number;
    date: string;
    reps: number;
    rating: number | null;
  }> = [];

  for (const note of allNotes) {
    if (!note.skills) continue;

    const items = parseSkillsField(note.skills);
    let totalReps = 0;

    for (const item of items) {
      const raw = item as any;

      if (item.id === skillId) {
        const reps = Number(item.reps);
        totalReps += Number.isFinite(reps) && reps > 0 ? reps : 1;
      } else if (item.id === -2 && raw.routineId) {
        const customIds: number[] | undefined = raw.customSkillIds;
        const routine = userRoutines.find(r => r.id === raw.routineId);
        const routineSkillIds = customIds ?? routine?.skillIds ?? [];
        const attempt = raw.attempt ?? routineSkillIds.length;
        const activeSkills = routineSkillIds.slice(0, attempt);
        const count = activeSkills.filter((sid: number) => sid === skillId).length;
        const entryReps = Number(raw.reps);
        totalReps += count * (Number.isFinite(entryReps) && entryReps > 0 ? entryReps : 1);
      } else if (item.id === -3 && raw.fcId) {
        const customIds: number[] | undefined = raw.customSkillIds;
        const fcSkillIds = customIds ?? fcMap.get(raw.fcId) ?? [];
        const count = fcSkillIds.filter((sid: number) => sid === skillId).length;
        const entryReps = Number(raw.reps);
        totalReps += count * (Number.isFinite(entryReps) && entryReps > 0 ? entryReps : 1);
      } else {
        const fcSkillIds = fcMap.get(item.id);
        if (fcSkillIds && fcSkillIds.includes(skillId)) {
          const reps = Number(item.reps);
          const count = Number.isFinite(reps) && reps > 0 ? reps : 1;
          totalReps += count * fcSkillIds.filter(sid => sid === skillId).length;
        }
      }
    }

    if (totalReps > 0) {
      entries.push({
        noteId: note.id,
        date: note.date,
        reps: totalReps,
        rating: note.rating ?? null,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

export function routineHistory(routineId: number, allNotes: Note[], allRoutines: Routine[]) {
  const routine = allRoutines.find(r => r.id === routineId);
  const expectedCount = routine?.skillIds?.length ?? 10;

  const entries: Array<{
    noteId: number;
    date: string;
    rating: number | null;
    attempt: number | null;
    skillCount: number;
    reps: number;
  }> = [];

  for (const note of allNotes) {
    if (!note.skills) continue;
    const items = parseSkillsField(note.skills);

    for (const item of items) {
      const raw = item as any;
      if (item.id === -2 && raw.routineId === routineId) {
        const customIds: number[] | undefined = raw.customSkillIds;
        const explicitAttempt: number | undefined = raw.attempt;
        const reps: number = Number.isFinite(raw.reps) && raw.reps > 0 ? raw.reps : 1;
        let skillCount: number;
        if (explicitAttempt != null) {
          skillCount = explicitAttempt;
        } else if (customIds) {
          skillCount = customIds.length;
        } else {
          skillCount = expectedCount;
        }
        entries.push({
          noteId: note.id,
          date: note.date,
          rating: note.rating ?? null,
          attempt: skillCount !== expectedCount ? skillCount : null,
          skillCount,
          reps,
        });
      }
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

export function connectionHistory(connId: number, allNotes: Note[], userSkills: Skill[]) {
  const conn = userSkills.find(s => s.id === connId);
  const expectedCount = conn?.skillIds?.length ?? 0;

  const entries: Array<{
    noteId: number;
    date: string;
    rating: number | null;
    attempt: number | null;
    skillCount: number;
    reps: number;
  }> = [];

  for (const note of allNotes) {
    if (!note.skills) continue;
    const items = parseSkillsField(note.skills);

    for (const item of items) {
      const raw = item as any;
      const isConnRef = (item.id === -3 && raw.fcId === connId) || item.id === connId;
      if (isConnRef) {
        const customIds: number[] | undefined = raw.customSkillIds;
        const reps: number = Number.isFinite(raw.reps) && raw.reps > 0 ? raw.reps : 1;
        const skillCount = customIds ? customIds.length : expectedCount;
        entries.push({
          noteId: note.id,
          date: note.date,
          rating: note.rating ?? null,
          attempt: expectedCount > 0 && skillCount !== expectedCount ? skillCount : null,
          skillCount,
          reps,
        });
      }
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

/**
 * Where a new skill goes in its category (sorted by difficulty, hardest
 * first) and the sortOrder changes that makes room for it.
 */
export function planSkillInsert(sameCategory: Skill[], difficulty: number) {
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

  const updates: Array<{ id: number; sortOrder: number }> = [];
  for (let i = 0; i < insertIdx; i++) {
    if (sorted[i].sortOrder !== i) updates.push({ id: sorted[i].id, sortOrder: i });
  }
  sorted.slice(insertIdx).forEach((s, i) => updates.push({ id: s.id, sortOrder: insertIdx + i + 1 }));
  return { insertIdx, updates };
}
