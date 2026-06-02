import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated, getUserId } from "./auth";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

interface SkillEntry { id: number; reps?: number }

function parseSkillsField(skillsString: string): SkillEntry[] {
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Notes
  app.get(api.notes.list.path, isAuthenticated, async (req, res) => {
    const limitRaw = req.query.limit;
    const offsetRaw = req.query.offset;
    const limit =
      typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? Math.min(parseInt(limitRaw, 10), 200)
        : undefined;
    const offset =
      typeof offsetRaw === "string" && /^\d+$/.test(offsetRaw)
        ? parseInt(offsetRaw, 10)
        : undefined;
    const userId = getUserId(req);
    const [notesList, total] = await Promise.all([
      storage.getNotes(userId, { limit, offset }),
      storage.getNotesCount(userId),
    ]);
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
    res.json(notesList);
  });

  app.post(api.notes.create.path, isAuthenticated, async (req, res) => {
    try {
      const bodySchema = api.notes.create.input.extend({
        rating: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const note = await storage.createNote(getUserId(req), input);
      res.status(201).json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.notes.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteNote(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  app.put(api.notes.update.path, isAuthenticated, async (req, res) => {
    try {
      const bodySchema = api.notes.update.input.extend({
        rating: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const note = await storage.updateNote(Number(req.params.id), getUserId(req), input);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      res.json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Skills
  app.get(api.skills.list.path, isAuthenticated, async (req, res) => {
    const skillsList = await storage.getSkills(getUserId(req));
    res.json(skillsList);
  });

  app.post(api.skills.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.skills.create.input.parse(req.body);
      const skill = await storage.createSkill(getUserId(req), input);
      res.status(201).json(skill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.skills.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteSkill(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  app.put(api.skills.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.skills.update.input.parse(req.body);
      const userId = getUserId(req);
      const skillId = Number(req.params.id);
      const skill = await storage.updateSkill(skillId, userId, input);
      if (!skill) {
        return res.status(404).json({ message: "Skill not found" });
      }

      if (skill.isDrill === 0 && input.difficulty != null) {
        const allSkills = await storage.getSkills(userId);
        const connections = allSkills.filter(s => (s.isDrill === 2 || s.isDrill === 3) && s.skillIds?.includes(skillId));
        for (const conn of connections) {
          const newDD = (conn.skillIds || []).reduce((acc, sId) => {
            const sk = allSkills.find(s => s.id === sId);
            return acc + (sk?.difficulty || 0);
          }, 0);
          await storage.updateSkill(conn.id, userId, { difficulty: newDD });
        }
      }

      res.json(skill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/skills/reorder", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({ orderedIds: z.array(z.number()) });
      const { orderedIds } = schema.parse(req.body);
      await storage.reorderSkills(getUserId(req), orderedIds);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Routines
  app.get(api.routines.list.path, isAuthenticated, async (req, res) => {
    const routinesList = await storage.getRoutines(getUserId(req));
    res.json(routinesList);
  });

  app.post(api.routines.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.routines.create.input.parse(req.body);
      const routine = await storage.createRoutine(getUserId(req), input);
      res.status(201).json(routine);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.routines.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteRoutine(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  app.put(api.routines.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.routines.update.input.parse(req.body);
      const routine = await storage.updateRoutine(Number(req.params.id), getUserId(req), input);
      if (!routine) {
        return res.status(404).json({ message: "Routine not found" });
      }
      res.json(routine);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Scores
  app.get(api.scores.list.path, isAuthenticated, async (req, res) => {
    const scoresList = await storage.getScores(getUserId(req));
    res.json(scoresList);
  });

  app.post(api.scores.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.scores.create.input.parse(req.body);
      const score = await storage.createScore(getUserId(req), input);
      res.status(201).json(score);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.scores.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.scores.update.input.parse(req.body);
      const score = await storage.updateScore(Number(req.params.id), getUserId(req), input);
      if (!score) return res.status(404).json({ message: "Score not found" });
      res.json(score);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.scores.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteScore(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  app.get("/api/skills/:id/history", isAuthenticated, async (req, res) => {
    try {
      const skillId = Number(req.params.id);
      if (!Number.isFinite(skillId) || skillId <= 0) {
        return res.status(400).json({ message: "Invalid skill ID" });
      }
      const userId = getUserId(req);
      const [allNotes, userRoutines, userSkills] = await Promise.all([
        storage.getNotes(userId),
        storage.getRoutines(userId),
        storage.getSkills(userId),
      ]);

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
      res.json(entries);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/routines/:id/history", isAuthenticated, async (req, res) => {
    try {
      const routineId = Number(req.params.id);
      if (!Number.isFinite(routineId) || routineId <= 0) {
        return res.status(400).json({ message: "Invalid routine ID" });
      }
      const userId = getUserId(req);
      const allNotes = await storage.getNotes(userId);
      const allRoutines = await storage.getRoutines(userId);
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
      res.json(entries);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/connections/:id/history", isAuthenticated, async (req, res) => {
    try {
      const connId = Number(req.params.id);
      if (!Number.isFinite(connId) || connId <= 0) {
        return res.status(400).json({ message: "Invalid connection ID" });
      }
      const userId = getUserId(req);
      const [allNotes, userSkills] = await Promise.all([
        storage.getNotes(userId),
        storage.getSkills(userId),
      ]);
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
      res.json(entries);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/auth/focus-memo", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({ focusMemo: z.string().max(20000) });
      const { focusMemo } = schema.parse(req.body);
      const userId = getUserId(req);
      const [updated] = await db
        .update(users)
        .set({ focusMemo, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update focus memo" });
    }
  });

  return httpServer;
}
