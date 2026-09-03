import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertDictionaryEntrySchema } from '@workspace/db/schema';

describe('dictionary admin contract', () => {
  it('accepts boundary difficulty values through 30', () => {
    const base = {
      name: 'Boundary skill',
      shortName: 'BS',
      isDrill: 0,
    };

    expect(insertDictionaryEntrySchema.parse({ ...base, difficulty: 30 }).difficulty).toBe(30);
    expect(() => insertDictionaryEntrySchema.parse({ ...base, difficulty: 30.1 })).toThrow();
  });

  it('keeps list and library import routes behind the admin middleware', () => {
    const routesPath = fileURLToPath(new URL('./routes/routes.ts', import.meta.url));
    const routes = readFileSync(routesPath, 'utf8');

    expect(routes).toContain('app.get("/api/admin/dictionary", isAdmin');
    expect(routes).toContain('app.get(api.dictionary.importPreview.path, isAdmin');
    expect(routes).toContain('app.post(api.dictionary.importLibrary.path, isAdmin');
  });
});