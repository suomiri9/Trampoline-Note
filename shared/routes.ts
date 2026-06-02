import { z } from 'zod';
import { insertNoteSchema, notes, skills, routines, scores, insertSkillSchema, insertRoutineSchema, insertScoreSchema } from './schema';

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
        200: z.array(z.custom<typeof routines.$inferSelect>()),
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
      input: insertRoutineSchema.partial(),
      responses: {
        200: z.custom<typeof routines.$inferSelect>(),
        400: errorSchemas.validation,
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
