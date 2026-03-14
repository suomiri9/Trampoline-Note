import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated, getUserId } from "./auth";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Notes
  app.get(api.notes.list.path, isAuthenticated, async (req, res) => {
    const notesList = await storage.getNotes(getUserId(req));
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
      const skill = await storage.updateSkill(Number(req.params.id), getUserId(req), input);
      if (!skill) {
        return res.status(404).json({ message: "Skill not found" });
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

  app.patch("/api/auth/focus-memo", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({ focusMemo: z.string().max(1000) });
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
