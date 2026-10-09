// One-time load of the FIG Code of Points 2025-2028 difficulty examples
// (Trampoline Part II, pages 55-56) into the shared dictionary. Each shape is
// its own entry, like entries made in the dictionary admin. The short name
// starts as the numeric; the owner fills in short and "also called" names
// later in the admin.

import { sql } from "drizzle-orm";
import { db, dictionaryEntries } from "@workspace/db";
import { logger } from "./lib/logger";

const MIGRATION_KEY = "fig-2025-difficulty-examples-v1";

type Shape = "o" | "<" | "/";
// [name, numeric without shape, { shape: difficulty }]
type Row = [string, string, Partial<Record<Shape, number>>];

export const FIG_DIFFICULTY_EXAMPLES: Row[] = [
  // Singles, forward
  ["Front Drop", "10", { o: 0.1, "<": 0.1, "/": 0.1 }],
  ["1/2 Twist to Back", "11", { "/": 0.2 }],
  ["Full Twist to Front", "12", { "/": 0.3 }],
  ["3/4 Front", "30", { "/": 0.3 }],
  ["Barani to Front", "31", { o: 0.4, "<": 0.4, "/": 0.4 }],
  ["Front Somersault", "40", { o: 0.5, "<": 0.6, "/": 0.6 }],
  ["Barani", "41", { o: 0.6, "<": 0.6, "/": 0.6 }],
  ["Rudolph (Rudy)", "43", { "/": 0.8 }],
  ["Randolph (Randy)", "45", { "/": 1.0 }],
  ["3 1/2 Twisting Front", "47", { "/": 1.2 }],
  ["4 1/2 Twisting Front", "49", { "/": 1.4 }],
  ["Barani Ballout", "51", { o: 0.7, "<": 0.7, "/": 0.7 }],
  ["Rudolph Ballout", "53", { "/": 0.9 }],
  ["Randolph Ballout", "55", { "/": 1.1 }],
  ["1 3/4 Front", "70", { o: 0.8, "<": 0.9, "/": 0.9 }],
  // Singles, backward
  ["Back Drop", "10", { o: 0.1, "<": 0.1, "/": 0.1 }],
  ["1/2 Twist to Front", "11", { "/": 0.2 }],
  ["Full Twist to Back", "12", { "/": 0.3 }],
  ["3/4 Back", "30", { o: 0.3, "<": 0.3, "/": 0.3 }],
  ["Half in 3/4 Front", "31", { "/": 0.4 }],
  ["Back full to Front", "32", { "/": 0.5 }],
  ["Back Somersault", "40", { o: 0.5, "<": 0.6, "/": 0.6 }],
  ["Back Somersault with 1/2 Twist", "41", { o: 0.6, "<": 0.6, "/": 0.6 }],
  ["Back Full", "42", { "/": 0.7 }],
  ["Double Full", "44", { "/": 0.9 }],
  ["Triple Full", "46", { "/": 1.1 }],
  ["Quadruple full", "48", { "/": 1.3 }],
  ["Cody or 1 1/4 Back", "50", { o: 0.6, "<": 0.7, "/": 0.7 }],
  ["Cody with Full Twist", "52", { "/": 0.8 }],
  ["Cody with Double Twist", "54", { "/": 1.0 }],
  // Doubles, forward
  ["Half Out", "801", { o: 1.1, "<": 1.3, "/": 1.3 }],
  ["Rudy Out", "803", { o: 1.3, "<": 1.5, "/": 1.5 }],
  ["Full Half", "821", { o: 1.3, "<": 1.5, "/": 1.5 }],
  ["Full Rudy", "823", { o: 1.6, "<": 1.8, "/": 1.8 }],
  ["Randy Out", "805", { o: 1.6, "<": 1.8, "/": 1.8 }],
  ["Full Randy", "825", { o: 2.0, "<": 2.2, "/": 2.2 }],
  ["3 1/2 Out", "807", { o: 2.0, "<": 2.2, "/": 2.2 }],
  ["2 3/4 Front", "1100", { o: 1.3, "<": 1.5, "/": 1.5 }],
  // Doubles, backward
  ["Double Back", "800", { o: 1.1, "<": 1.3, "/": 1.3 }],
  ["Half In Half Out", "811", { o: 1.3, "<": 1.5, "/": 1.5 }],
  ["Back In Full Out", "802", { o: 1.3, "<": 1.5, "/": 1.5 }],
  ["1 1/2 In Half Out", "831", { o: 1.5, "<": 1.7 }],
  ["Full In Full Out", "822", { o: 1.5, "/": 1.7 }],
  ["Half In Rudy Out", "813", { o: 1.5, "<": 1.7 }],
  ["1 1/2 In 1 1/2 Out", "833", { o: 1.9, "<": 2.1, "/": 2.1 }],
  ["Half In Randy Out", "815", { o: 1.9, "<": 2.1 }],
  ["1 1/2 In Randy Out", "835", { o: 2.3, "<": 2.5 }],
  ["Double Full In Double Full Out", "844", { "/": 2.5 }],
  ["Half In 3 1/2 Out", "817", { o: 2.3, "<": 2.5 }],
  ["2 3/4 Back with Half Twist", "1110", { o: 1.5, "<": 1.7, "/": 1.7 }],
  // Triples, forward
  ["Front Front Half", "12001", { o: 1.7, "<": 2.0 }],
  ["Front Front Rudy", "12003", { o: 2.1, "<": 2.4 }],
  ["Full Front Half", "12201", { o: 2.1, "<": 2.4 }],
  ["Front Full Half", "12021", { o: 2.1, "<": 2.4 }],
  ["Full Front Rudy", "12203", { o: 2.7, "<": 3.0 }],
  ["Front Full Rudy", "12023", { o: 2.7, "<": 3.0 }],
  ["Full Full Half", "12221", { o: 2.7, "<": 3.0 }],
  // Triples, backward
  ["Triple Back", "12000", { o: 1.8, "<": 2.1, "/": 2.1 }],
  ["Half Front Half", "12101", { o: 2.0, "<": 2.3 }],
  ["Half Front Rudy", "12103", { o: 2.6, "<": 2.9 }],
  ["Half Full Half", "12121", { o: 2.6, "<": 2.9 }],
  ["Full Full Full", "12222", { o: 3.2, "/": 3.5 }],
  ["1 1/2 Front Rudy Out", "12303", { o: 3.2, "<": 3.5 }],
  // Quadruples
  ["Front Front Front Half", "160001", { o: 2.5, "<": 2.9 }],
  ["Front Front Front Rudy", "160003", { o: 3.1, "<": 3.5 }],
  ["Half in half out quadriffis", "161001", { o: 3.1, "<": 3.5 }],
  ["Half in rudy out quadriffis", "161003", { o: 3.7, "<": 4.1 }],
];

export function figDictionaryEntries() {
  return FIG_DIFFICULTY_EXAMPLES.flatMap(([name, base, shapes]) =>
    (Object.entries(shapes) as [Shape, number][]).map(([shape, difficulty]) => {
      const numeric = `${base}${shape}`;
      return { name, shortName: numeric, numeric, isDrill: 0, difficulty };
    }),
  );
}

const sameKey = (name: string, numeric: string | null) =>
  `${name.trim().toLowerCase()}|${(numeric ?? "").replace(/\s+/g, "").toLowerCase()}`;

// Runs once per database (guarded by a dictionary_data_migrations marker) and
// skips any entry whose name and numeric already exist, so nothing is
// duplicated or overwritten.
export async function seedFigDictionary(): Promise<void> {
  const added = await db.transaction(async (tx) => {
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS dictionary_data_migrations (
        key text PRIMARY KEY,
        completed_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const claimed = await tx.execute(sql`
      INSERT INTO dictionary_data_migrations (key) VALUES (${MIGRATION_KEY})
      ON CONFLICT (key) DO NOTHING RETURNING key
    `);
    if (claimed.rows.length === 0) return null;

    const existing = await tx
      .select({ name: dictionaryEntries.name, numeric: dictionaryEntries.numeric })
      .from(dictionaryEntries);
    const have = new Set(existing.map((e) => sameKey(e.name, e.numeric)));
    const toAdd = figDictionaryEntries().filter((e) => !have.has(sameKey(e.name, e.numeric)));
    if (toAdd.length > 0) await tx.insert(dictionaryEntries).values(toAdd);
    return toAdd.length;
  });
  if (added !== null) logger.info({ added }, "Loaded FIG difficulty examples into the dictionary");
}
