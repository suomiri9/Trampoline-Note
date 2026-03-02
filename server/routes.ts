import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

async function seedDatabase() {
  const existingNotes = await storage.getNotes();
  if (existingNotes.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    await storage.createNote({
      date: today,
      content: "Great session today! Focused on basics and height.",
      skills: "straight jump, tuck jump, straddle jump",
      rating: 4
    });
    
    // Seed some skills
    await storage.createSkill({ name: "Back Tuck", code: "BT", difficulty: 0.5 });
    await storage.createSkill({ name: "Front Flip", code: "FF", difficulty: 0.5 });
    await storage.createSkill({ name: "Barani", code: "Ba", difficulty: 0.6 });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  seedDatabase().catch(console.error);

  // Notes
  app.get(api.notes.list.path, async (req, res) => {
    const notesList = await storage.getNotes();
    res.json(notesList);
  });

  app.post(api.notes.create.path, async (req, res) => {
    try {
      const bodySchema = api.notes.create.input.extend({
        rating: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const note = await storage.createNote(input);
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

  app.delete(api.notes.delete.path, async (req, res) => {
    await storage.deleteNote(Number(req.params.id));
    res.status(204).send();
  });

  app.put(api.notes.update.path, async (req, res) => {
    try {
      const bodySchema = api.notes.update.input.extend({
        rating: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const note = await storage.updateNote(Number(req.params.id), input);
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
  app.get(api.skills.list.path, async (req, res) => {
    const skillsList = await storage.getSkills();
    res.json(skillsList);
  });

  app.post(api.skills.create.path, async (req, res) => {
    try {
      const input = api.skills.create.input.parse(req.body);
      const skill = await storage.createSkill(input);
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

  app.delete(api.skills.delete.path, async (req, res) => {
    await storage.deleteSkill(Number(req.params.id));
    res.status(204).send();
  });

  // Routines
  app.get(api.routines.list.path, async (req, res) => {
    const routinesList = await storage.getRoutines();
    res.json(routinesList);
  });

  app.post(api.routines.create.path, async (req, res) => {
    try {
      const input = api.routines.create.input.parse(req.body);
      const routine = await storage.createRoutine(input);
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

  app.delete(api.routines.delete.path, async (req, res) => {
    await storage.deleteRoutine(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
