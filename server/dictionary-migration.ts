import type { PoolClient } from "pg";

export const DICTIONARY_ADMIN_USER_ID = "55504735";

type Queryable = Pick<PoolClient, "query">;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  dictionary_entries: [
    "id",
    "name",
    "code",
    "numeric",
    "is_drill",
    "difficulty",
    "description",
    "alt_names",
    "archived",
    "sort_order",
    "draft_image_key", "draft_image_content_type", "draft_image_prompt",
    "draft_image_model", "draft_image_created_at", "approved_image_key",
    "approved_image_content_type", "approved_image_prompt", "approved_image_model",
    "approved_image_approved_at",
  ],
  dictionary_suggestions: [
    "id",
    "entry_id",
    "user_id",
    "suggested_name",
    "note",
    "status",
    "created_at",
    "resolved_at",
  ],
  dictionary_library_imports: ["user_id", "completed_at"],
  dictionary_data_migrations: ["key", "completed_at"],
  skills: ["dictionary_entry_id"],
  users: ["is_admin"],
};

// This is deliberately a repair migration, not just CREATE TABLE IF NOT
// EXISTS. A previous partial rollout may already have one of the tables but be
// missing columns, constraints, or indexes.
export async function runDictionaryMigration(
  client: PoolClient,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dictionary_entries (
        id serial PRIMARY KEY,
        name text NOT NULL,
        code text NOT NULL,
        numeric text,
        is_drill integer NOT NULL DEFAULT 0,
        difficulty real NOT NULL DEFAULT 0,
        description text,
        alt_names text[] NOT NULL DEFAULT '{}',
        archived integer NOT NULL DEFAULT 0,
        sort_order integer,
        draft_image_key text, draft_image_content_type text, draft_image_prompt text,
        draft_image_model text, draft_image_created_at timestamp,
        approved_image_key text, approved_image_content_type text,
        approved_image_prompt text, approved_image_model text,
        approved_image_approved_at timestamp
      );

      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS id serial;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS code text;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS numeric text;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS is_drill integer DEFAULT 0;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS difficulty real DEFAULT 0;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS description text;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS alt_names text[] DEFAULT '{}';
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS archived integer DEFAULT 0;
      ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS sort_order integer;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS draft_image_key text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS draft_image_content_type text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS draft_image_prompt text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS draft_image_model text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS draft_image_created_at timestamp;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS approved_image_key text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS approved_image_content_type text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS approved_image_prompt text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS approved_image_model text;
       ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS approved_image_approved_at timestamp;

      UPDATE dictionary_entries SET is_drill = 0 WHERE is_drill IS NULL;
      UPDATE dictionary_entries SET difficulty = 0 WHERE difficulty IS NULL;
      UPDATE dictionary_entries SET alt_names = '{}' WHERE alt_names IS NULL;
      UPDATE dictionary_entries SET archived = 0 WHERE archived IS NULL;

      DO $dictionary_entries_required$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM dictionary_entries
          WHERE id IS NULL OR name IS NULL OR code IS NULL
        ) THEN
          RAISE EXCEPTION 'dictionary_entries contains rows missing id, name, or code';
        END IF;
      END
      $dictionary_entries_required$;

      ALTER TABLE dictionary_entries ALTER COLUMN name SET NOT NULL;
      ALTER TABLE dictionary_entries ALTER COLUMN code SET NOT NULL;
      ALTER TABLE dictionary_entries ALTER COLUMN is_drill SET DEFAULT 0;
      ALTER TABLE dictionary_entries ALTER COLUMN is_drill SET NOT NULL;
      ALTER TABLE dictionary_entries ALTER COLUMN difficulty SET DEFAULT 0;
      ALTER TABLE dictionary_entries ALTER COLUMN difficulty SET NOT NULL;
      ALTER TABLE dictionary_entries ALTER COLUMN alt_names SET DEFAULT '{}';
      ALTER TABLE dictionary_entries ALTER COLUMN alt_names SET NOT NULL;
      ALTER TABLE dictionary_entries ALTER COLUMN archived SET DEFAULT 0;
      ALTER TABLE dictionary_entries ALTER COLUMN archived SET NOT NULL;

      DO $dictionary_entries_pk$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_entries'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE dictionary_entries
            ADD CONSTRAINT dictionary_entries_pkey PRIMARY KEY (id);
        END IF;
      END
      $dictionary_entries_pk$;

      DO $dictionary_entries_checks$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_entries'::regclass
            AND conname = 'dictionary_entries_is_drill_check'
        ) THEN
          ALTER TABLE dictionary_entries
            ADD CONSTRAINT dictionary_entries_is_drill_check
            CHECK (is_drill IN (0, 1));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_entries'::regclass
            AND conname = 'dictionary_entries_archived_check'
        ) THEN
          ALTER TABLE dictionary_entries
            ADD CONSTRAINT dictionary_entries_archived_check
            CHECK (archived IN (0, 1));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_entries'::regclass
            AND conname = 'dictionary_entries_difficulty_check'
        ) THEN
          ALTER TABLE dictionary_entries
            ADD CONSTRAINT dictionary_entries_difficulty_check
            CHECK (difficulty >= 0 AND difficulty <= 30);
        END IF;
      END
      $dictionary_entries_checks$;

      CREATE TABLE IF NOT EXISTS dictionary_suggestions (
        id serial PRIMARY KEY,
        entry_id integer NOT NULL,
        user_id varchar NOT NULL,
        suggested_name text NOT NULL,
        note text,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamp NOT NULL DEFAULT now(),
        resolved_at timestamp
      );

      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS id serial;
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS entry_id integer;
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS user_id varchar;
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS suggested_name text;
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS note text;
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
      ALTER TABLE dictionary_suggestions ADD COLUMN IF NOT EXISTS resolved_at timestamp;

      CREATE TABLE IF NOT EXISTS dictionary_library_imports (
        user_id varchar PRIMARY KEY,
        completed_at timestamp NOT NULL DEFAULT now()
      );
      ALTER TABLE dictionary_library_imports ADD COLUMN IF NOT EXISTS user_id varchar;
      ALTER TABLE dictionary_library_imports ADD COLUMN IF NOT EXISTS completed_at timestamp DEFAULT now();
      UPDATE dictionary_library_imports SET completed_at = now() WHERE completed_at IS NULL;
      ALTER TABLE dictionary_library_imports ALTER COLUMN user_id SET NOT NULL;
      ALTER TABLE dictionary_library_imports ALTER COLUMN completed_at SET DEFAULT now();
      ALTER TABLE dictionary_library_imports ALTER COLUMN completed_at SET NOT NULL;

      DO $dictionary_library_imports_pk$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_library_imports'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE dictionary_library_imports
            ADD CONSTRAINT dictionary_library_imports_pkey PRIMARY KEY (user_id);
        END IF;
      END
      $dictionary_library_imports_pk$;

      CREATE TABLE IF NOT EXISTS dictionary_data_migrations (
        key text PRIMARY KEY,
        completed_at timestamp NOT NULL DEFAULT now()
      );

      -- One-time backfill only. The marker prevents future app restarts from
      -- restoring Numeric after the owner intentionally clears an exception.
      WITH claimed AS (
        INSERT INTO dictionary_data_migrations (key)
        VALUES ('copy-short-name-to-numeric-v1')
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      )
      UPDATE dictionary_entries
      SET numeric = code
      FROM claimed
      WHERE numeric IS NULL;

      UPDATE dictionary_suggestions SET status = 'pending' WHERE status IS NULL;
      UPDATE dictionary_suggestions SET created_at = now() WHERE created_at IS NULL;

      DO $dictionary_suggestions_required$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM dictionary_suggestions
          WHERE id IS NULL
             OR entry_id IS NULL
             OR user_id IS NULL
             OR suggested_name IS NULL
        ) THEN
          RAISE EXCEPTION 'dictionary_suggestions contains rows missing required references or text';
        END IF;
      END
      $dictionary_suggestions_required$;

      ALTER TABLE dictionary_suggestions ALTER COLUMN entry_id SET NOT NULL;
      ALTER TABLE dictionary_suggestions ALTER COLUMN user_id SET NOT NULL;
      ALTER TABLE dictionary_suggestions ALTER COLUMN suggested_name SET NOT NULL;
      ALTER TABLE dictionary_suggestions ALTER COLUMN status SET DEFAULT 'pending';
      ALTER TABLE dictionary_suggestions ALTER COLUMN status SET NOT NULL;
      ALTER TABLE dictionary_suggestions ALTER COLUMN created_at SET DEFAULT now();
      ALTER TABLE dictionary_suggestions ALTER COLUMN created_at SET NOT NULL;

      DO $dictionary_suggestions_pk$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_suggestions'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE dictionary_suggestions
            ADD CONSTRAINT dictionary_suggestions_pkey PRIMARY KEY (id);
        END IF;
      END
      $dictionary_suggestions_pk$;

      DO $dictionary_suggestions_status$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_suggestions'::regclass
            AND conname = 'dictionary_suggestions_status_check'
        ) THEN
          ALTER TABLE dictionary_suggestions
            ADD CONSTRAINT dictionary_suggestions_status_check
            CHECK (status IN ('pending', 'accepted', 'rejected'));
        END IF;
      END
      $dictionary_suggestions_status$;

      ALTER TABLE skills ADD COLUMN IF NOT EXISTS dictionary_entry_id integer;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
      UPDATE users SET is_admin = false WHERE is_admin IS NULL;
      ALTER TABLE users ALTER COLUMN is_admin SET DEFAULT false;
      ALTER TABLE users ALTER COLUMN is_admin SET NOT NULL;

      -- Preserve all personal rows when repairing duplicates. The preferred
      -- active/oldest copy keeps provenance; other copies become ordinary
      -- personal skills rather than being deleted.
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY user_id, dictionary_entry_id
            ORDER BY CASE WHEN archived = 0 THEN 0 ELSE 1 END, id
          ) AS duplicate_rank
        FROM skills
        WHERE dictionary_entry_id IS NOT NULL
      )
      UPDATE skills
      SET dictionary_entry_id = NULL
      FROM ranked
      WHERE skills.id = ranked.id AND ranked.duplicate_rank > 1;

      CREATE UNIQUE INDEX IF NOT EXISTS skills_user_dictionary_entry_unique
        ON skills (user_id, dictionary_entry_id)
        WHERE dictionary_entry_id IS NOT NULL;

      -- Keep one pending copy of a repeated suggestion and resolve older
      -- duplicate rows so the unique guard can be installed safely.
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY entry_id, user_id, lower(btrim(suggested_name))
            ORDER BY id
          ) AS duplicate_rank
        FROM dictionary_suggestions
        WHERE status = 'pending'
      )
      UPDATE dictionary_suggestions
      SET status = 'rejected', resolved_at = COALESCE(resolved_at, now())
      FROM ranked
      WHERE dictionary_suggestions.id = ranked.id
        AND ranked.duplicate_rank > 1;

      CREATE UNIQUE INDEX IF NOT EXISTS dictionary_pending_suggestion_unique
        ON dictionary_suggestions (
          entry_id,
          user_id,
          lower(btrim(suggested_name))
        )
        WHERE status = 'pending';

      DO $dictionary_foreign_keys$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'skills'::regclass
            AND conname = 'skills_dictionary_entry_fk'
        ) THEN
          ALTER TABLE skills
            ADD CONSTRAINT skills_dictionary_entry_fk
            FOREIGN KEY (dictionary_entry_id)
            REFERENCES dictionary_entries(id)
            ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_suggestions'::regclass
            AND conname = 'dictionary_suggestions_entry_fk'
        ) THEN
          ALTER TABLE dictionary_suggestions
            ADD CONSTRAINT dictionary_suggestions_entry_fk
            FOREIGN KEY (entry_id)
            REFERENCES dictionary_entries(id)
            ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'dictionary_suggestions'::regclass
            AND conname = 'dictionary_suggestions_user_fk'
        ) THEN
          ALTER TABLE dictionary_suggestions
            ADD CONSTRAINT dictionary_suggestions_user_fk
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE RESTRICT;
        END IF;
      END
      $dictionary_foreign_keys$;
    `);

    const found = await client.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `, [Object.keys(REQUIRED_COLUMNS)]);
    const foundSet = new Set(
      found.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    const missing = Object.entries(REQUIRED_COLUMNS).flatMap(
      ([table, columns]) =>
        columns
          .filter((column) => !foundSet.has(`${table}.${column}`))
          .map((column) => `${table}.${column}`),
    );
    if (missing.length > 0) {
      throw new Error(`dictionary schema verification failed; missing ${missing.join(", ")}`);
    }

    const indexes = await client.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = ANY($1::text[])
    `, [[
      "skills_user_dictionary_entry_unique",
      "dictionary_pending_suggestion_unique",
    ]]);
    if (indexes.rowCount !== 2) {
      throw new Error("dictionary schema verification failed; uniqueness indexes are missing");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error("Dictionary migration failed; startup aborted", { cause: error });
  }
}

export async function ensureDictionaryAdminGrant(
  client: Queryable,
  userId = DICTIONARY_ADMIN_USER_ID,
): Promise<void> {
  const result = await client.query(
    "UPDATE users SET is_admin = true WHERE id = $1",
    [userId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Dictionary admin grant failed: owner user ${userId} was not found`);
  }
}