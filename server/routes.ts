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
    await storage.createNote({
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // yesterday
      content: "Struggled a bit with my twisting, need to keep arms tighter.",
      skills: "front flip, barani",
      rating: 3
    });
    await storage.createNote({
      date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], // 2 days ago
      content: "Nailed the back tuck! Super proud.",
      skills: "back tuck",
      rating: 5
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed the database
  seedDatabase().catch(console.error);

  app.get(api.notes.list.path, async (req, res) => {
    const notesList = await storage.getNotes();
    res.json(notesList);
  });

  app.get(api.notes.get.path, async (req, res) => {
    const note = await storage.getNote(Number(req.params.id));
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.json(note);
  });

  app.post(api.notes.create.path, async (req, res) => {
    try {
      // Coerce numeric inputs if any, though rating is an integer it could come as string
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
      throw err;
    }
  });

  app.put(api.notes.update.path, async (req, res) => {
    try {
      const bodySchema = api.notes.update.input.extend({
        rating: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);
      const note = await storage.updateNote(Number(req.params.id), input);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }
      res.json(note);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.notes.delete.path, async (req, res) => {
    await storage.deleteNote(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
