import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  ensureDictionaryAdminGrant,
  runDictionaryMigration,
} from "./dictionary-migration";

const { Client } = pg;
const hasDatabase = Boolean(process.env.DATABASE_URL);

function testSchema(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

async function withSchema(
  prefix: string,
  run: (client: InstanceType<typeof Client>, schema: string) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = testSchema(prefix);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await run(client, schema);
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}

describe.skipIf(!hasDatabase)("dictionary startup migration", () => {
  it("repairs a partial schema, preserves duplicate personal rows, and applies the owner grant", async () => {
    await withSchema("dictionary_repair", async (client) => {
      await client.query(`
        CREATE TABLE users (
          id varchar PRIMARY KEY
        );
        CREATE TABLE skills (
          id serial PRIMARY KEY,
          user_id varchar,
          archived integer NOT NULL DEFAULT 0,
          dictionary_entry_id integer
        );
        CREATE TABLE dictionary_entries (
          id serial PRIMARY KEY,
          name text NOT NULL,
          code text NOT NULL
        );
        CREATE TABLE dictionary_suggestions (
          id serial PRIMARY KEY,
          entry_id integer NOT NULL,
          user_id varchar NOT NULL,
          suggested_name text NOT NULL
        );

        INSERT INTO users (id) VALUES ('owner');
        INSERT INTO dictionary_entries (name, code) VALUES ('Barani', '41o');
        INSERT INTO skills (user_id, archived, dictionary_entry_id)
          VALUES ('owner', 1, 1), ('owner', 0, 1);
        INSERT INTO dictionary_suggestions (entry_id, user_id, suggested_name)
          VALUES (1, 'owner', 'Barani out');
      `);

      await runDictionaryMigration(client);
      await ensureDictionaryAdminGrant(client, "owner");

      const columns = await client.query<{
        table_name: string;
        column_name: string;
      }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('dictionary_entries', 'dictionary_suggestions', 'dictionary_library_imports', 'skills', 'users')
      `);
      const names = new Set(
        columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
      );
      expect(names.has("dictionary_entries.alt_names")).toBe(true);
      expect(names.has("dictionary_entries.description")).toBe(true);
      expect(names.has("dictionary_entries.long_name")).toBe(true);
      expect(names.has("dictionary_suggestions.status")).toBe(true);
      expect(names.has("dictionary_suggestions.resolved_at")).toBe(true);
      expect(names.has("dictionary_library_imports.completed_at")).toBe(true);
      expect(names.has("skills.dictionary_entry_id")).toBe(true);
      expect(names.has("users.is_admin")).toBe(true);

      const linked = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM skills
        WHERE dictionary_entry_id = 1
      `);
      const total = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM skills
      `);
      expect(linked.rows[0].count).toBe("1");
      expect(total.rows[0].count).toBe("2");

      const owner = await client.query<{ is_admin: boolean }>(
        "SELECT is_admin FROM users WHERE id = 'owner'",
      );
      expect(owner.rows[0].is_admin).toBe(true);

      await expect(
        client.query(`
          INSERT INTO skills (user_id, archived, dictionary_entry_id)
          VALUES ('owner', 0, 1)
        `),
      ).rejects.toMatchObject({ code: "23505" });
    });
  });

  it("rolls back and surfaces an incomplete required row instead of starting partially installed", async () => {
    await withSchema("dictionary_fail_closed", async (client) => {
      await client.query(`
        CREATE TABLE users (id varchar PRIMARY KEY);
        CREATE TABLE skills (
          id serial PRIMARY KEY,
          user_id varchar,
          archived integer NOT NULL DEFAULT 0
        );
        CREATE TABLE dictionary_entries (
          id serial PRIMARY KEY,
          name text,
          code text
        );
        INSERT INTO dictionary_entries (name, code) VALUES (NULL, 'broken');
      `);

      await expect(runDictionaryMigration(client)).rejects.toThrow(
        "Dictionary migration failed; startup aborted",
      );

      const rolledBack = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'dictionary_entries'
            AND column_name = 'alt_names'
        ) AS exists
      `);
      expect(rolledBack.rows[0].exists).toBe(false);
    });
  });
});