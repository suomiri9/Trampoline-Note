import { z } from 'zod';
import { insertNoteSchema, notes } from './schema';

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

export type NoteInput = z.infer<typeof api.notes.create.input>;
export type NoteUpdateInput = z.infer<typeof api.notes.update.input>;
export type NoteResponse = z.infer<typeof api.notes.create.responses[201]>;
export type NotesListResponse = z.infer<typeof api.notes.list.responses[200]>;
