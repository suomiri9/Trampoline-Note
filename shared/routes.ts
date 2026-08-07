import { z } from 'zod';
import { insertNoteSchema, notes, skills, routines, scores, tofSessions, executionSessions, insertSkillSchema, insertRoutineSchema, insertScoreSchema, insertTofSessionSchema, insertExecutionSessionSchema, type RoutineWithVersions } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  notes: {
    list: {
      method: 'GET' as const,
      path: '/api/notes' as const,
      responses: {
        200: z.array(z.custom<typeof notes.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/notes/:id' as const,
      responses: {
        200: z.custom<typeof notes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/notes' as const,
      input: insertNoteSchema,
      responses: {
        201: z.custom<typeof notes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/notes/:id' as const,
      input: insertNoteSchema.partial(),
      responses: {
        200: z.custom<typeof notes.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/notes/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  skills: {
    list: {
      method: 'GET' as const,
      path: '/api/skills' as const,
      responses: {
        200: z.array(z.custom<typeof skills.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/skills' as const,
      input: insertSkillSchema,
      responses: {
        201: z.custom<typeof skills.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/skills/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/skills/:id' as const,
      input: insertSkillSchema.partial(),
      responses: {
        200: z.custom<typeof skills.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  routines: {
    list: {
      method: 'GET' as const,
      path: '/api/routines' as const,
      responses: {
        // Routines embed their past lineup versions so every consumer (and
        // the offline mirror) can resolve date-appropriate lineups.
        200: z.array(z.custom<RoutineWithVersions>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/routines' as const,
      input: insertRoutineSchema,
      responses: {
        201: z.custom<typeof routines.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/routines/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/routines/:id' as const,
      // applyFromDay: when the lineup changed, snapshot the previous lineup as
      // a version applying to athlete-local dates BEFORE this day ("change
      // from this day"); omitted = rewrite all history (versions cleared).
      // versions: explicit past-version management (correct a change day /
      // delete a version) — the FULL desired list; only applied when the
      // lineup itself is NOT changing (a lineup change recomputes versions
      // server-side from applyFromDay and ignores this field, so the same
      // key doubles as the client's optimistic precompute during lineup
      // edits without risk of divergence).
      input: insertRoutineSchema.partial().extend({
        applyFromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        versions: z
          .array(
            z.object({
              skillIds: z.array(z.number().int().positive()).max(10),
              effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            }),
          )
          .max(100)
          .optional(),
      }),
      responses: {
        200: z.custom<RoutineWithVersions>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  tofSessions: {
    list: {
      method: 'GET' as const,
      path: '/api/tof-sessions' as const,
      responses: {
        200: z.array(z.custom<typeof tofSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tof-sessions' as const,
      input: insertTofSessionSchema,
      responses: {
        201: z.custom<typeof tofSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tof-sessions/:id' as const,
      input: insertTofSessionSchema.partial(),
      responses: {
        200: z.custom<typeof tofSessions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tof-sessions/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  executionSessions: {
    list: {
      method: 'GET' as const,
      path: '/api/execution-sessions' as const,
      responses: {
        200: z.array(z.custom<typeof executionSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/execution-sessions' as const,
      input: insertExecutionSessionSchema,
      responses: {
        201: z.custom<typeof executionSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/execution-sessions/:id' as const,
      input: insertExecutionSessionSchema.partial(),
      responses: {
        200: z.custom<typeof executionSessions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/execution-sessions/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  scores: {
    list: {
      method: 'GET' as const,
      path: '/api/scores' as const,
      responses: {
        200: z.array(z.custom<typeof scores.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/scores' as const,
      input: insertScoreSchema,
      responses: {
        201: z.custom<typeof scores.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/scores/:id' as const,
      input: insertScoreSchema.partial(),
      responses: {
        200: z.custom<typeof scores.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scores/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
