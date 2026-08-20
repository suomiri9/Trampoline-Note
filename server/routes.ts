import type { Express } from "express";
import type { Server } from "http";
import { storage, SkillLinkError, TofRoutineError, DictionaryError } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated, isAdmin, getUserId, getBaseUrl } from "./auth";
import { getPushRecommendation, clearCoachPushCache, coachChat, parseMenuPhoto, parseTofScreenshot, parseExecutionSheet, parseScoreSheet, menuChat, CoachUnavailableError, CoachStoppedError } from "./coach";
import { serveCoachImage } from "./coach-images";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { parsePoints, mergePoints, isPointCategory, type PointToFix } from "@shared/points";
import { lineupOnDate, versionIndexOnDate } from "@shared/routine-versions";
import {
  getWhoopDashboardDataCached,
  WhoopNotConnectedError,
  WhoopApiError,
  isWhoopConfigured,
  buildWhoopAuthUrl,
  isWhoopLinked,
  completeWhoopLink,
  disconnectWhoop,
} from "./whoop";

class PointsMemoTooLargeError extends Error {}

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
      // A new session changes today's training load — regenerate the coach's
      // daily push recommendation on next fetch.
      clearCoachPushCache(getUserId(req));
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
    clearCoachPushCache(getUserId(req));
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
      clearCoachPushCache(getUserId(req));
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
      // Backward compatibility for an adoption queued by the previous client:
      // never trust the copied fields. Resolve the active dictionary entry on
      // the server and use the same idempotent operation as the new endpoint.
      if (input.dictionaryEntryId != null) {
        const result = await storage.adoptDictionaryEntry(
          getUserId(req),
          input.dictionaryEntryId,
        );
        return res.status(201).json(result.skill);
      }
      const skill = await storage.createSkill(getUserId(req), input);
      res.status(201).json(skill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      if (err instanceof SkillLinkError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof DictionaryError) {
        const status = err.code === "not_found" ? 404 : 400;
        return res.status(status).json({ message: err.message });
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
      if (input.dictionaryEntryId !== undefined) {
        return res.status(400).json({
          message: "A skill's dictionary source cannot be changed",
          field: "dictionaryEntryId",
        });
      }
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
      if (err instanceof SkillLinkError) {
        return res.status(400).json({ message: err.message });
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

  // Shared skills & drills dictionary. Browsing + suggesting is open to any
  // signed-in user; entry curation and the review queue are admin-only and
  // enforced HERE via the isAdmin middleware — hiding buttons client-side is
  // never the security boundary.
  app.get(api.dictionary.list.path, isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      // Admins also receive archived entries so they can review/unarchive
      // them; everyone else only ever sees active rows.
      const entries = await storage.getDictionaryEntries(!!user?.isAdmin);
      res.json(entries);
    } catch (err) {
      console.error("Dictionary list error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.dictionary.create.path, isAdmin, async (req, res) => {
    try {
      const input = api.dictionary.create.input.parse(req.body);
      const entry = await storage.createDictionaryEntry(input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Dictionary create error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.dictionary.update.path, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ message: "Entry not found" });
      }
      const input = api.dictionary.update.input.parse(req.body);
      const entry = await storage.updateDictionaryEntry(id, input);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Dictionary update error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.dictionary.importPreview.path, isAdmin, async (req, res) => {
    try {
      res.json(await storage.previewDictionaryImport(getUserId(req)));
    } catch (err) {
      console.error("Dictionary import preview error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.dictionary.importLibrary.path, isAdmin, async (req, res) => {
    try {
      res.json(await storage.importLibraryToDictionary(getUserId(req)));
    } catch (err) {
      console.error("Dictionary library import error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.dictionary.adopt.path, isAuthenticated, async (req, res) => {
    try {
      const entryId = Number(req.params.id);
      if (!Number.isInteger(entryId) || entryId <= 0) {
        return res.status(404).json({ message: "Dictionary entry not found" });
      }
      const result = await storage.adoptDictionaryEntry(
        getUserId(req),
        entryId,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof DictionaryError) {
        const status = err.code === "not_found" ? 404 : 400;
        return res.status(status).json({ message: err.message });
      }
      console.error("Dictionary adopt error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.dictionary.suggest.path, isAuthenticated, async (req, res) => {
    try {
      const entryId = Number(req.params.id);
      if (!Number.isInteger(entryId) || entryId <= 0) {
        return res.status(404).json({ message: "Dictionary entry not found" });
      }
      const input = api.dictionary.suggest.input.parse(req.body);
      const suggestion = await storage.createDictionarySuggestion(getUserId(req), entryId, input);
      res.status(201).json(suggestion);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (err instanceof DictionaryError) {
        const status = err.code === "not_found" ? 404 : err.code === "duplicate" ? 409 : 400;
        return res.status(status).json({ message: err.message });
      }
      console.error("Dictionary suggest error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.dictionary.suggestions.path, isAdmin, async (_req, res) => {
    try {
      res.json(await storage.getPendingDictionarySuggestions());
    } catch (err) {
      console.error("Dictionary suggestions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.dictionary.resolveSuggestion.path, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      const { action } = api.dictionary.resolveSuggestion.input.parse(req.body);
      const result = await storage.resolveDictionarySuggestion(id, action);
      if (!result) {
        return res.status(404).json({ message: "Suggestion not found or already resolved" });
      }
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Dictionary resolve error:", err);
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

  // ToF sessions (time-of-flight tracker)
  app.get(api.tofSessions.list.path, isAuthenticated, async (req, res) => {
    const sessions = await storage.getTofSessions(getUserId(req));
    res.json(sessions);
  });

  app.post(api.tofSessions.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.tofSessions.create.input.parse(req.body);
      const session = await storage.createTofSession(getUserId(req), input);
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof TofRoutineError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.tofSessions.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.tofSessions.update.input.parse(req.body);
      const session = await storage.updateTofSession(Number(req.params.id), getUserId(req), input);
      if (!session) return res.status(404).json({ message: "Session not found" });
      res.json(session);
    } catch (err) {
      if (err instanceof TofRoutineError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.tofSessions.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteTofSession(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  // Veriflite screenshot → per-jump ToF values. Returns the parsed values
  // for user review; nothing is saved here.
  app.post("/api/tof-sessions/parse-screenshot", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        images: z
          .array(
            z
              .string()
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
              .max(4 * 1024 * 1024, "Image too large"),
          )
          .min(1)
          .max(3),
      });
      const { images } = schema.parse(req.body);
      const result = await parseTofScreenshot(images);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("parse-tof-screenshot error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Execution deduction sessions (judges'-sheet tracker)
  app.get(api.executionSessions.list.path, isAuthenticated, async (req, res) => {
    const sessions = await storage.getExecutionSessions(getUserId(req));
    res.json(sessions);
  });

  app.post(api.executionSessions.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.executionSessions.create.input.parse(req.body);
      const session = await storage.createExecutionSession(getUserId(req), input);
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof TofRoutineError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.executionSessions.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.executionSessions.update.input.parse(req.body);
      const session = await storage.updateExecutionSession(Number(req.params.id), getUserId(req), input);
      if (!session) return res.status(404).json({ message: "Session not found" });
      res.json(session);
    } catch (err) {
      if (err instanceof TofRoutineError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.executionSessions.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteExecutionSession(Number(req.params.id), getUserId(req));
    res.status(204).send();
  });

  // Judges' execution sheet photo → per-skill deduction rows (R1/R2).
  // Returns the parsed rows for user review; nothing is saved here.
  app.post("/api/execution-sessions/parse-photo", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        images: z
          .array(
            z
              .string()
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
              .max(4 * 1024 * 1024, "Image too large"),
          )
          .min(1)
          .max(3),
      });
      const { images } = schema.parse(req.body);
      const result = await parseExecutionSheet(images);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("parse-execution-sheet error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Competition scoresheet photo → per-routine E/D/H/T/total lines plus
  // competition header. Returns parsed values for user review; nothing saved.
  app.post("/api/scores/parse-photo", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        images: z
          .array(
            z
              .string()
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
              .max(4 * 1024 * 1024, "Image too large"),
          )
          .min(1)
          .max(3),
      });
      const { images } = schema.parse(req.body);
      const result = await parseScoreSheet(images);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("parse-score-sheet error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
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
            // Resolve against the lineup in effect on the note's date, so a
            // skill swapped out stops accruing reps after the change day and
            // a swapped-in skill only counts from it.
            const routineSkillIds = customIds ??
              (routine ? lineupOnDate(routine.skillIds, routine.versions, note.date) : []);
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
      const versions = routine?.versions ?? [];

      const entries: Array<{
        noteId: number;
        date: string;
        rating: number | null;
        attempt: number | null;
        skillCount: number;
        reps: number;
        // Which lineup was in effect on the note's date: 0..n-1 = past
        // versions (oldest first), n = current lineup. Lets the client split
        // stats per version.
        version: number;
        // Length of that lineup — full-vs-attempt is judged against it.
        expected: number;
      }> = [];

      for (const note of allNotes) {
        if (!note.skills) continue;
        const items = parseSkillsField(note.skills);

        for (const item of items) {
          const raw = item as any;
          if (item.id === -2 && raw.routineId === routineId) {
            // Classify against the lineup in effect on the note's date, not
            // today's lineup — historical entries stay true to what was
            // actually trained.
            const effectiveLineup = routine
              ? lineupOnDate(routine.skillIds, versions, note.date)
              : undefined;
            const expectedCount = effectiveLineup?.length ?? 10;
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
              version: versionIndexOnDate(versions, note.date),
              expected: expectedCount,
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

  // ---- WHOOP: per-user OAuth ("Sign in with WHOOP") + dashboard data ----

  const whoopRedirectUri = (req: Parameters<typeof getBaseUrl>[0]) =>
    `${getBaseUrl(req)}/api/whoop/callback`;

  // Kick off the WHOOP OAuth flow: stash a CSRF state in the session and
  // redirect the browser to WHOOP's login/consent page.
  app.get("/api/whoop/auth", isAuthenticated, (req, res) => {
    if (!isWhoopConfigured()) {
      return res.redirect("/whoop?whoop=not_configured");
    }
    const state = crypto.randomBytes(16).toString("hex");
    req.session.whoopOauthState = { value: state, expiresAt: Date.now() + 10 * 60 * 1000 };
    req.session.save(() => {
      res.redirect(buildWhoopAuthUrl(whoopRedirectUri(req), state));
    });
  });

  // OAuth callback: verify state, exchange the code, store tokens for the user.
  app.get("/api/whoop/callback", isAuthenticated, async (req, res) => {
    const expected = req.session.whoopOauthState;
    req.session.whoopOauthState = undefined;

    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
      // User hit "deny" (or WHOOP reported an error) — not a server failure.
      return res.redirect("/whoop?whoop=denied");
    }
    if (
      !code ||
      !state ||
      !expected ||
      expected.value !== state ||
      Date.now() > expected.expiresAt
    ) {
      return res.redirect("/whoop?whoop=state_mismatch");
    }
    try {
      await completeWhoopLink(getUserId(req), code, whoopRedirectUri(req));
      // Recovery data just became available — regenerate the push card.
      clearCoachPushCache(getUserId(req));
      res.redirect("/whoop?whoop=connected");
    } catch (err) {
      console.error("WHOOP link error:", err);
      res.redirect("/whoop?whoop=link_failed");
    }
  });

  // Unlink the signed-in user's WHOOP account.
  app.post("/api/whoop/disconnect", isAuthenticated, async (req, res) => {
    try {
      await disconnectWhoop(getUserId(req));
      clearCoachPushCache(getUserId(req));
      res.status(204).end();
    } catch (err) {
      console.error("WHOOP disconnect error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // WHOOP dashboard data (read-only, fetched server-side with the user's token)
  app.get("/api/whoop/data/:days", isAuthenticated, async (req, res) => {
    try {
      const days = Number(req.params.days);
      if (![7, 30, 90, 180].includes(days)) {
        return res.status(400).json({ message: "Invalid range" });
      }
      const data = await getWhoopDashboardDataCached(getUserId(req), days);
      res.json(data);
    } catch (err) {
      if (err instanceof WhoopNotConnectedError) {
        return res.status(503).json({
          code: "not_connected",
          message: "WHOOP is not connected.",
        });
      }
      if (err instanceof WhoopApiError) {
        return res.status(502).json({ code: "whoop_error", message: err.message });
      }
      console.error("WHOOP data error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Per-day WHOOP recovery/strain snapshot used to annotate training-note
  // cards. Unlike /api/whoop/data this is quiet when WHOOP isn't linked —
  // it returns 200 {connected:false} so the Training tab doesn't log errors
  // for users who never connected WHOOP.
  app.get("/api/whoop/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await isWhoopLinked(userId))) {
        return res.json({ connected: false, days: {} });
      }
      const data = await getWhoopDashboardDataCached(userId, 180);
      const days: Record<string, { recovery: number | null; strain: number | null }> = {};
      const dayOf = (date: string) => days[date] ?? (days[date] = { recovery: null, strain: null });
      for (const r of data.recovery) {
        if (r.date && r.recoveryScore != null) dayOf(r.date).recovery = r.recoveryScore;
      }
      for (const c of data.cycles) {
        if (!c.date || c.strain == null) continue;
        const d = dayOf(c.date);
        d.strain = Math.max(d.strain ?? 0, c.strain);
      }
      res.json({ connected: true, days });
    } catch (err) {
      if (err instanceof WhoopNotConnectedError) {
        return res.json({ connected: false, days: {} });
      }
      if (err instanceof WhoopApiError) {
        return res.status(502).json({ code: "whoop_error", message: err.message });
      }
      console.error("WHOOP daily error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- AI coach ----

  app.get("/api/coach/push", isAuthenticated, async (req, res) => {
    try {
      const rec = await getPushRecommendation(
        getUserId(req),
        typeof req.query.date === "string" ? req.query.date : undefined,
        req.query.refresh === "1",
      );
      res.json(rec);
    } catch (err) {
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("Coach push error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // History list: base64 images are stripped and replaced with per-image
  // URLs so the payload stays small as photo history grows. The images
  // column still holds a JSON string array, just of URLs instead of data
  // URLs, so existing clients parse it unchanged.
  app.get("/api/coach/messages", isAuthenticated, async (req, res) => {
    try {
      const msgs = await storage.getCoachMessages(getUserId(req));
      const light = msgs.map((m) => {
        if (!m.images) return m;
        let count = 0;
        try {
          const parsed = JSON.parse(m.images);
          count = Array.isArray(parsed) ? parsed.length : 0;
        } catch {}
        if (count === 0) return { ...m, images: null };
        const urls = Array.from(
          { length: count },
          (_, i) => `/api/coach/messages/${m.id}/images/${i}`,
        );
        return { ...m, images: JSON.stringify(urls) };
      });
      res.json(light);
    } catch (err) {
      console.error("Coach messages error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serves one stored chat image (decoded from its data URL) so the history
  // list doesn't have to embed multi-megabyte base64 blobs. Messages are
  // immutable, so the response is cacheable per user.
  app.get("/api/coach/messages/:id/images/:idx", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const idx = Number(req.params.idx);
      if (!Number.isInteger(id) || !Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ message: "Bad request" });
      }
      const msg = await storage.getCoachMessage(getUserId(req), id);
      if (!msg?.images) return res.status(404).json({ message: "Not found" });
      let images: unknown;
      try {
        images = JSON.parse(msg.images);
      } catch {
        return res.status(404).json({ message: "Not found" });
      }
      const entry = Array.isArray(images) ? images[idx] : undefined;
      const served = await serveCoachImage(getUserId(req), entry, res);
      if (!served) return res.status(404).json({ message: "Not found" });
    } catch (err) {
      console.error("Coach message image error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.end();
      }
    }
  });

  app.post("/api/coach/messages", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        content: z.string().trim().max(4000).default(""),
        page: z.string().max(200).optional(),
        // Client-compressed JPEG data URLs, max 3, ~4MB of base64 each.
        images: z
          .array(
            z
              .string()
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
              .max(4 * 1024 * 1024, "Image too large"),
          )
          .max(3)
          .optional(),
        // Athlete's local calendar date (YYYY-MM-DD) so the coach's "today"
        // matches their timezone, not the server's UTC day.
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const { content, page, images, date } = schema.parse(req.body);
      if (!content && (!images || images.length === 0)) {
        return res.status(400).json({ message: "Message is empty" });
      }

      // Stream the reply as Server-Sent Events so long answers appear
      // progressively. Events: {delta} chunks, then {done, reply}; a failure
      // before any output is a normal JSON error, after headers it's an
      // {error} event.
      let streaming = false;
      const sendEvent = (payload: unknown) => {
        if (!streaming) {
          streaming = true;
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders?.();
        }
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // Stop support: if the client aborts the fetch mid-stream (the Stop
      // button), abort the upstream OpenAI stream too and persist nothing —
      // a stopped question can simply be re-asked.
      const aborter = new AbortController();
      let finished = false;
      res.on("close", () => {
        if (!finished) aborter.abort();
      });

      try {
        const { reply, draft, guideUpdated, skillProposal, pointProposal, suggestions } = await coachChat(
          getUserId(req),
          content,
          page,
          images,
          (chunk) => sendEvent({ delta: chunk }),
          date,
          aborter.signal,
        );
        finished = true;
        // Chips are persisted on the assistant message row inside coachChat,
        // so reopening the chat later re-shows them.
        sendEvent({ done: true, reply, draft, guideUpdated, suggestions, skillProposal, pointProposal });
        res.end();
      } catch (err) {
        finished = true;
        if (err instanceof CoachStoppedError) {
          // The athlete stopped the reply — the connection is already gone;
          // nothing was persisted. Just make sure the response is closed.
          res.end();
          return;
        }
        const message =
          err instanceof CoachUnavailableError
            ? err.message
            : "Internal server error";
        if (!(err instanceof CoachUnavailableError)) {
          console.error("Coach chat error:", err);
        }
        if (streaming) {
          sendEvent({ error: message });
          res.end();
        } else if (err instanceof CoachUnavailableError) {
          res.status(503).json({ code: "coach_unavailable", message });
        } else {
          res.status(500).json({ message });
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Coach chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/coach/messages", isAuthenticated, async (req, res) => {
    try {
      await storage.clearCoachMessages(getUserId(req));
      res.status(204).end();
    } catch (err) {
      console.error("Coach clear error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Conversational menu-chat: multi-turn back-and-forth where the AI reads
  // a cropped menu photo and asks clarifying questions before emitting a
  // final draft_entry block.
  app.post("/api/coach/menu-chat", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        cropDataUrl: z
          .string()
          .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
          .max(4 * 1024 * 1024, "Image too large"),
        messages: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
          .min(1)
          .max(40),
      });
      const { cropDataUrl, messages } = schema.parse(req.body);
      const { reply, draft, suggestions, guideUpdated } = await menuChat(getUserId(req), cropDataUrl, messages);
      res.json({ reply, draft, suggestions, guideUpdated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("menu-chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Direct menu-photo → practice-list parsing. No chat history or streaming;
  // returns the matched draft JSON so the note-dialog can apply it inline.
  app.post("/api/coach/parse-menu", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        images: z
          .array(
            z
              .string()
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
              .max(4 * 1024 * 1024, "Image too large"),
          )
          .min(1)
          .max(3),
        note: z.string().max(500).optional(),
      });
      const { images, note } = schema.parse(req.body);
      const { draft } = await parseMenuPhoto(getUserId(req), images, note);
      res.json({ draft });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      if (err instanceof CoachUnavailableError) {
        return res.status(503).json({ code: "coach_unavailable", message: err.message });
      }
      console.error("parse-menu error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Debuts page picker: which rows the user switched off, stored per user so
  // the choices follow them across devices. Whole-blob last-write-wins.
  app.patch("/api/auth/debuts-hidden", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        debutsHidden: z
          .string()
          .max(20000)
          .refine((raw) => {
            try {
              const parsed = JSON.parse(raw);
              return (
                parsed !== null &&
                typeof parsed === "object" &&
                !Array.isArray(parsed) &&
                Object.values(parsed).every(
                  (v) => Array.isArray(v) && v.every((k) => typeof k === "string"),
                )
              );
            } catch {
              return false;
            }
          }, { message: "debutsHidden must be a JSON object of string arrays" }),
      });
      const { debutsHidden } = schema.parse(req.body);
      const userId = getUserId(req);
      const [updated] = await db
        .update(users)
        .set({ debutsHidden, updatedAt: new Date() })
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
      res.status(500).json({ message: "Failed to update debuts preferences" });
    }
  });

  // Per-user AI menu-reading settings: a free-text notation guide (what the
  // athlete's abbreviations mean) and the "one menu row = one connection"
  // toggle. Both feed into the coach's draft_entry instructions.
  app.patch("/api/auth/menu-settings", isAuthenticated, async (req, res) => {
    try {
      const schema = z
        .object({
          menuGuide: z.string().max(10000).optional(),
          menuRowConnections: z.boolean().optional(),
        })
        .refine((v) => v.menuGuide !== undefined || v.menuRowConnections !== undefined, {
          message: "Nothing to update",
        });
      const body = schema.parse(req.body);
      const userId = getUserId(req);
      const updates: Partial<{ menuGuide: string; menuRowConnections: boolean }> = {};
      if (body.menuGuide !== undefined) updates.menuGuide = body.menuGuide;
      if (body.menuRowConnections !== undefined) updates.menuRowConnections = body.menuRowConnections;
      const [updated] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
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
      res.status(500).json({ message: "Failed to update menu settings" });
    }
  });

  // Debuts-page visibility choices (which skills/routines are switched off),
  // stored per account so they follow the user across devices.
  app.patch("/api/auth/debuts-hidden", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        debutsHidden: z
          .record(z.array(z.string().max(40)).max(500))
          .refine((v) => Object.keys(v).length <= 10, { message: "Too many groups" }),
      });
      const { debutsHidden } = schema.parse(req.body);
      const userId = getUserId(req);
      const [updated] = await db
        .update(users)
        .set({ debutsHidden: JSON.stringify(debutsHidden), updatedAt: new Date() })
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
      res.status(500).json({ message: "Failed to update debuts settings" });
    }
  });

  // General app preferences synced across devices (theme, time format, etc.).
  app.patch("/api/auth/app-settings", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        appSettings: z
          .object({
            theme: z.enum(["dark", "light"]).optional(),
            timeFormat: z.enum(["12h", "24h"]).optional(),
            showSkillNames: z.boolean().optional(),
            trackTurns: z.boolean().optional(),
            archiveCascade: z.boolean().optional(),
          })
          .strict(),
      });
      const { appSettings } = schema.parse(req.body);
      const userId = getUserId(req);
      // Merge into the stored blob inside a transaction with a row lock so
      // two devices changing DIFFERENT settings can't overwrite each other.
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!row) return undefined;
        let current: Record<string, unknown> = {};
        try {
          const parsed = row.appSettings ? JSON.parse(row.appSettings) : null;
          if (parsed && typeof parsed === "object") current = parsed;
        } catch {
          // corrupted blob — start fresh
        }
        const merged = { ...current, ...appSettings };
        const [u] = await tx
          .update(users)
          .set({ appSettings: JSON.stringify(merged), updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        return u;
      });
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update app settings" });
    }
  });

  // Atomic single-point append. Unlike the whole-blob PATCH below (which is
  // last-write-wins), this parses the CURRENT stored list, appends one point
  // and writes back inside a transaction with a row lock — two devices adding
  // points at the same moment can no longer drop one of them.
  app.post("/api/auth/points-to-fix", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        id: z.string().min(1).max(80).optional(),
        name: z.string().trim().min(1).max(200),
        skillIds: z.array(z.number().int().refine((n) => n !== 0)).max(50).default([]),
        routineIds: z.array(z.number().int().refine((n) => n !== 0)).max(50).default([]),
        category: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const userId = getUserId(req);
      const isLinked = body.skillIds.length > 0 || body.routineIds.length > 0;
      const newPoint: PointToFix = {
        id: body.id ?? `p-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        name: body.name,
        skillIds: body.skillIds,
        routineIds: body.routineIds,
        ...(!isLinked && isPointCategory(body.category) ? { category: body.category } : {}),
      };

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (!row) return null;
        const current = parsePoints(row.focusMemo);
        // Idempotent on retry: if this exact point id already exists,
        // return the current state instead of appending a duplicate.
        if (newPoint.id && current.some((p) => p.id === newPoint.id)) {
          return row;
        }
        const nextStr = JSON.stringify([...current, newPoint]);
        if (nextStr.length > 20000) {
          throw new PointsMemoTooLargeError();
        }
        const [saved] = await tx
          .update(users)
          .set({ focusMemo: nextStr, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        return saved ?? null;
      });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = updated;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof PointsMemoTooLargeError) {
        return res.status(400).json({ message: "Points to Fix list is too large" });
      }
      res.status(500).json({ message: "Failed to add point to fix" });
    }
  });

  // Whole-list focus-memo write. When the client also sends `baseFocusMemo`
  // (the list it last read), the write becomes a server-side three-way merge
  // inside a row-locked transaction: only the points the client actually
  // changed/deleted are applied on top of the CURRENT stored list, so two
  // devices editing different points at the same moment no longer overwrite
  // each other. Without `baseFocusMemo` (legacy clients) it stays
  // last-write-wins.
  app.patch("/api/auth/focus-memo", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        focusMemo: z.string().max(20000),
        baseFocusMemo: z.string().max(20000).optional(),
      });
      const { focusMemo, baseFocusMemo } = schema.parse(req.body);
      const userId = getUserId(req);

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (!row) return null;

        // Only merge when the stored memo is already the migrated JSON-array
        // format. Legacy plain-text memos get fresh ids on every parse, so a
        // three-way merge would duplicate points — fall back to
        // last-write-wins (the client's write completes the migration).
        const storedIsJsonArray = (() => {
          if (!row.focusMemo) return true; // empty → merge is a no-op either way
          try {
            return Array.isArray(JSON.parse(row.focusMemo));
          } catch {
            return false;
          }
        })();

        let nextStr = focusMemo;
        if (baseFocusMemo !== undefined && storedIsJsonArray) {
          const theirs = parsePoints(row.focusMemo);
          const base = parsePoints(baseFocusMemo);
          const mine = parsePoints(focusMemo);
          const merged = mergePoints(base, mine, theirs);
          nextStr = JSON.stringify(merged);
          if (nextStr.length > 20000) {
            throw new PointsMemoTooLargeError();
          }
        }

        const [saved] = await tx
          .update(users)
          .set({ focusMemo: nextStr, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        return saved ?? null;
      });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof PointsMemoTooLargeError) {
        return res.status(400).json({ message: "Points to Fix list is too large" });
      }
      res.status(500).json({ message: "Failed to update focus memo" });
    }
  });

  return httpServer;
}
