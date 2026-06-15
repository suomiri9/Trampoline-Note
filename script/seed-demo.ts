/**
 * Regenerates the demo user's preview data so it exercises the shape-grouping
 * feature (skills/drills that own tuck/pike/straight shape children).
 *
 * Run once with:  npx tsx script/seed-demo.ts
 *
 * This wipes the demo user's skills / notes / routines / scores and rebuilds a
 * clean, internally-consistent dataset. It does NOT run on startup.
 */
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { skills, notes, routines, scores } from "@shared/schema";

const UID = "55504735";

type Ref = number;

let sortCounter = 0;

async function insSkill(s: {
  name: string;
  code: string;
  difficulty: number;
  isDrill?: number;
  parentSkillId?: number | null;
  shape?: string | null;
  skillIds?: number[];
}): Promise<Ref> {
  const [row] = await db
    .insert(skills)
    .values({
      userId: UID,
      name: s.name,
      code: s.code,
      difficulty: s.difficulty,
      isDrill: s.isDrill ?? 0,
      parentSkillId: s.parentSkillId ?? null,
      shape: s.shape ?? null,
      skillIds: s.skillIds ?? null,
      sortOrder: sortCounter++,
      archived: 0,
    })
    .returning({ id: skills.id });
  return row.id;
}

async function insRoutine(name: string, code: string, skillIds: number[]): Promise<Ref> {
  const [row] = await db
    .insert(routines)
    .values({ userId: UID, name, code, skillIds, archived: 0 })
    .returning({ id: routines.id });
  return row.id;
}

async function main() {
  console.log("Wiping existing demo data…");
  await db.delete(scores).where(eq(scores.userId, UID));
  await db.delete(notes).where(eq(notes.userId, UID));
  await db.delete(routines).where(eq(routines.userId, UID));
  await db.delete(skills).where(eq(skills.userId, UID));

  console.log("Inserting skills (shape-grouped bases + children + standalones)…");

  // ----- Shape-grouped SKILL bases (DD 0, pure grouping, not loggable) -----
  const backBase = await insSkill({ name: "Back Somersault", code: "4-", difficulty: 0 });
  const back = {
    tuck: await insSkill({ name: "Tuck", code: "o", shape: "o", difficulty: 0.5, parentSkillId: backBase }),
    pike: await insSkill({ name: "Pike", code: "<", shape: "<", difficulty: 0.6, parentSkillId: backBase }),
    straight: await insSkill({ name: "Straight", code: "/", shape: "/", difficulty: 0.6, parentSkillId: backBase }),
  };

  const dblBase = await insSkill({ name: "Double Back", code: "8-", difficulty: 0 });
  const dbl = {
    tuck: await insSkill({ name: "Tuck", code: "o", shape: "o", difficulty: 1.6, parentSkillId: dblBase }),
    pike: await insSkill({ name: "Pike", code: "<", shape: "<", difficulty: 1.8, parentSkillId: dblBase }),
  };

  const halfOutBase = await insSkill({ name: "Half Out", code: "41-", difficulty: 0 });
  const halfOut = {
    tuck: await insSkill({ name: "Tuck", code: "o", shape: "o", difficulty: 1.1, parentSkillId: halfOutBase }),
    pike: await insSkill({ name: "Pike", code: "<", shape: "<", difficulty: 1.3, parentSkillId: halfOutBase }),
    straight: await insSkill({ name: "Straight", code: "/", shape: "/", difficulty: 1.6, parentSkillId: halfOutBase }),
  };

  // ----- Standalone loggable SKILLS -----
  const barani = await insSkill({ name: "Barani", code: "Ba", difficulty: 0.6 });
  const rudy = await insSkill({ name: "Rudy", code: "Ru", difficulty: 0.9 });
  const randy = await insSkill({ name: "Randy", code: "Ra", difficulty: 1.3 });
  const full = await insSkill({ name: "Full", code: "Fu", difficulty: 0.6 });
  const dblFull = await insSkill({ name: "Double Full", code: "DFu", difficulty: 1.0 });
  const baraniBallOut = await insSkill({ name: "Barani Ball Out", code: "BBO", difficulty: 0.8 });
  const rudyBallOut = await insSkill({ name: "Rudy Ball Out", code: "RBO", difficulty: 1.0 });
  const fullOut = await insSkill({ name: "Full Out", code: "FO", difficulty: 1.2 });
  const miller = await insSkill({ name: "Miller", code: "Mi", difficulty: 1.7 });

  // ----- DRILLS (incl. a shape-grouped drill base) -----
  const tuckJump = await insSkill({ name: "Tuck Jump", code: "TJ", difficulty: 0, isDrill: 1 });
  const pikeJump = await insSkill({ name: "Pike Jump", code: "PJ", difficulty: 0, isDrill: 1 });
  const straddleJump = await insSkill({ name: "Straddle Jump", code: "StJ", difficulty: 0, isDrill: 1 });
  const somDrillBase = await insSkill({ name: "Somersault Drill", code: "SD-", difficulty: 0, isDrill: 1 });
  const somDrill = {
    tuck: await insSkill({ name: "Tuck", code: "o", shape: "o", difficulty: 0.2, isDrill: 1, parentSkillId: somDrillBase }),
    pike: await insSkill({ name: "Pike", code: "<", shape: "<", difficulty: 0.2, isDrill: 1, parentSkillId: somDrillBase }),
  };

  // ----- Frequent CONNECTIONS (is_drill = 2) -----
  // stored difficulty = sum of member DDs (the library table shows this value)
  const connBaraniBack = await insSkill({
    name: "Barani → Back Tuck", code: "Ba+4o", difficulty: 0.6 + 0.5, isDrill: 2,
    skillIds: [barani, back.tuck],
  });
  const connFullRudy = await insSkill({
    name: "Full → Rudy", code: "Fu+Ru", difficulty: 0.6 + 0.9, isDrill: 2,
    skillIds: [full, rudy],
  });

  console.log("Inserting routines…");
  const volIds = [fullOut, miller, halfOut.straight, rudyBallOut, baraniBallOut, dbl.pike, randy, dbl.tuck, full, barani];
  const setIds = [back.tuck, barani, back.pike, full, back.straight, rudy, back.tuck, barani, halfOut.tuck, dbl.tuck];
  const volRoutine = await insRoutine("Vol", "Vol", volIds);
  const setRoutine = await insRoutine("Set", "Set", setIds);

  // ----- Routine PART (is_drill = 3): last 5 of Vol -----
  // stored difficulty = sum of the 5 member DDs (1.8 + 1.3 + 1.6 + 0.6 + 0.6)
  const partLast5Vol = await insSkill({
    name: "Last 5 of Vol", code: "L5", difficulty: 1.8 + 1.3 + 1.6 + 0.6 + 0.6, isDrill: 3,
    skillIds: volIds.slice(5),
  });

  console.log("Inserting notes…");

  // note-building helpers (groups are separated by {id:-1})
  const s = (id: number, reps = 1) => ({ id, reps });
  const SEP = { id: -1 };
  const rt = (id: number, name: string, ids: number[]) => ({ id: -2, routineId: id, routineName: name, customSkillIds: ids });
  const fc = (id: number, name: string, ids: number[], reps = 1) => ({ id: -3, fcId: id, fcName: name, customSkillIds: ids, reps });
  // each "line" is a group (a single skill, a connection of skills, a routine, or an fc)
  const buildSkills = (lines: any[][]): string => {
    const out: any[] = [];
    lines.forEach((line, i) => {
      if (i > 0) out.push(SEP);
      out.push(...line);
    });
    return JSON.stringify(out);
  };

  const noteSpecs: {
    date: string; content: string; rating?: number | null; start?: string; end?: string;
    sleep?: number | null; lines: any[][];
  }[] = [
    { date: "2026-01-12", start: "17:00", end: "18:30", rating: 3, sleep: 72,
      content: "First session back after break. Shape work — back tuck / pike / straight, all a bit flat.",
      lines: [[s(somDrill.tuck, 10)], [s(somDrill.pike, 10)], [s(back.tuck, 8)], [s(back.pike, 6)], [s(back.straight, 6)]] },
    { date: "2026-01-19", start: "17:00", end: "18:45", rating: 4, sleep: 80,
      content: "Twisting basics. Barani and full feeling smoother.",
      lines: [[s(tuckJump, 12)], [s(barani, 8)], [s(full, 6)], [s(rudy, 4)]] },
    { date: "2026-01-26", start: "16:30", end: "18:00", rating: 3,
      content: "Connection day. Barani into back tuck.",
      lines: [[s(barani, 4), s(back.tuck, 4)], [fc(connBaraniBack, "Barani → Back Tuck", [barani, back.tuck], 3)]] },
    { date: "2026-02-02", start: "17:00", end: "18:30", rating: 4, sleep: 78,
      content: "Half out shapes. Straight version is the goal for vol.",
      lines: [[s(halfOut.tuck, 5)], [s(halfOut.pike, 5)], [s(halfOut.straight, 4)]] },
    { date: "2026-02-09", start: "17:00", end: "19:00", rating: 5, sleep: 85,
      content: "Great session. Double back tuck and pike both landing.",
      lines: [[s(dbl.tuck, 6)], [s(dbl.pike, 5)], [s(fullOut, 4)]] },
    { date: "2026-02-16", start: "16:30", end: "18:00", rating: 3,
      content: "Set routine run-throughs.",
      lines: [[rt(setRoutine, "Set", setIds)], [rt(setRoutine, "Set", setIds)]] },
    { date: "2026-02-23", start: "17:00", end: "18:45", rating: 4, sleep: 76,
      content: "Vol build. First half then last 5 separately.",
      lines: [[fc(partLast5Vol, "Last 5 of Vol", volIds.slice(5), 2)], [s(miller, 3)], [s(randy, 4)]] },
    { date: "2026-03-02", start: "17:00", end: "19:00", rating: 4,
      content: "Full vol attempts. Miller still needs height.",
      lines: [[rt(volRoutine, "Vol", volIds)], [s(miller, 5)]] },
    { date: "2026-03-09", start: "16:30", end: "18:00", rating: 2, sleep: 60,
      content: "Tired day. Just basics and shapes.",
      lines: [[s(back.tuck, 8)], [s(back.straight, 6)], [s(barani, 6)]] },
    { date: "2026-03-16", start: "17:00", end: "18:30", rating: 4, sleep: 82,
      content: "Ball-out work. Barani ball out into rudy ball out.",
      lines: [[s(baraniBallOut, 5)], [s(rudyBallOut, 4)], [fc(connFullRudy, "Full → Rudy", [full, rudy], 3)]] },
    { date: "2026-03-23", start: "17:00", end: "19:00", rating: 5, sleep: 88,
      content: "Best vol of the block. Clean through 8 skills.",
      lines: [[rt(volRoutine, "Vol", volIds)], [rt(volRoutine, "Vol", volIds)]] },
    { date: "2026-03-30", start: "16:30", end: "18:00", rating: 3,
      content: "Recovery. Drills and shaping only.",
      lines: [[s(tuckJump, 10)], [s(pikeJump, 10)], [s(straddleJump, 8)], [s(somDrill.tuck, 6)]] },
    { date: "2026-04-06", start: "17:00", end: "18:45", rating: 4, sleep: 79,
      content: "Comp prep — set then vol.",
      lines: [[rt(setRoutine, "Set", setIds)], [rt(volRoutine, "Vol", volIds)]] },
    { date: "2026-04-13", start: "17:00", end: "18:30", rating: 4,
      content: "Twisting volume. Double full attempts.",
      lines: [[s(full, 6)], [s(dblFull, 5)], [s(randy, 3)]] },
    { date: "2026-04-20", start: "16:30", end: "18:00", rating: 3, sleep: 74,
      content: "Connections into double back.",
      lines: [[s(barani, 2), s(dbl.tuck, 2)], [s(full, 2), s(dbl.pike, 2)]] },
    { date: "2026-04-27", start: "17:00", end: "19:00", rating: 5, sleep: 90,
      content: "Strong. Full out and half out straight both clean.",
      lines: [[s(fullOut, 5)], [s(halfOut.straight, 5)], [s(miller, 4)]] },
    { date: "2026-05-04", start: "17:00", end: "18:30", rating: 4, sleep: 81,
      content: "Vol run plus extra millers.",
      lines: [[rt(volRoutine, "Vol", volIds)], [s(miller, 4)], [s(dbl.pike, 3)]] },
    { date: "2026-05-11", start: "16:30", end: "18:00", rating: 3,
      content: "Shapes refinement across all three positions.",
      lines: [[s(back.tuck, 5)], [s(back.pike, 5)], [s(back.straight, 5)], [s(halfOut.straight, 4)]] },
    { date: "2026-05-18", start: "17:00", end: "18:45", rating: 4, sleep: 77,
      content: "Last 5 of vol on repeat for endurance.",
      lines: [[fc(partLast5Vol, "Last 5 of Vol", volIds.slice(5), 3)]] },
    { date: "2026-05-25", start: "17:00", end: "19:00", rating: 5, sleep: 86,
      content: "Peak day before trial. Two clean vols.",
      lines: [[rt(volRoutine, "Vol", volIds)], [rt(volRoutine, "Vol", volIds)], [s(randy, 2)]] },
    { date: "2026-06-01", start: "17:00", end: "18:30", rating: 4,
      content: "Easy spin after trial. Barani / back combos.",
      lines: [[fc(connBaraniBack, "Barani → Back Tuck", [barani, back.tuck], 4)], [s(back.straight, 5)]] },
    { date: "2026-06-08", start: "16:30", end: "18:00", rating: 3, sleep: 70,
      content: "Shaping drills and basic twists.",
      lines: [[s(somDrill.tuck, 8)], [s(somDrill.pike, 8)], [s(barani, 6)], [s(full, 5)]] },
  ];

  for (const n of noteSpecs) {
    await db.insert(notes).values({
      userId: UID,
      date: n.date,
      startTime: n.start ?? null,
      endTime: n.end ?? null,
      content: n.content,
      skills: buildSkills(n.lines),
      rating: n.rating ?? null,
      sleepScore: n.sleep ?? null,
    });
  }

  console.log("Inserting scores…");
  // helper: total = E + D + H + T
  const tot = (e: number, d: number, h: number, t: number) => Math.round((e + d + h + t) * 10) / 10;

  const compId = "spring-open-2026";
  const trialId = "squad-trial-2026";

  const scoreRows = [
    // practice — set
    { date: "2026-02-21", routineId: setRoutine, type: "practice", category: "set",
      execution: 16.5, difficulty: 7.6, horizontal: 9.2, timeOfFlight: 14.4, total: tot(16.5, 7.6, 9.2, 14.4) },
    // practice — vol
    { date: "2026-03-07", routineId: volRoutine, type: "practice", category: "vol",
      execution: 15.8, difficulty: 12.2, horizontal: 8.8, timeOfFlight: 14.1, total: tot(15.8, 12.2, 8.8, 14.1) },
    // practice — both (set + vol)
    { date: "2026-03-21", routineId: setRoutine, routineIdVol: volRoutine, type: "practice", category: "both",
      execution: 16.6, difficulty: 7.6, horizontal: 9.3, timeOfFlight: 14.5, total: tot(16.6, 7.6, 9.3, 14.5),
      executionVol: 16.0, difficultyVol: 12.2, horizontalVol: 9.0, timeOfFlightVol: 14.3, totalVol: tot(16.0, 12.2, 9.0, 14.3) },
    // competition — Spring Open, prelims (rank 3)
    { date: "2026-04-11", routineId: volRoutine, type: "competition", category: "vol",
      competitionName: "Spring Open", competitionId: compId, round: "prelims", rank: 3,
      execution: 16.2, difficulty: 12.2, horizontal: 9.1, timeOfFlight: 14.3, total: tot(16.2, 12.2, 9.1, 14.3) },
    // competition — Spring Open, final (rank 2)
    { date: "2026-04-11", routineId: volRoutine, type: "competition", category: "vol",
      competitionName: "Spring Open", competitionId: compId, round: "final", rank: 2,
      execution: 16.7, difficulty: 12.2, horizontal: 9.4, timeOfFlight: 14.6, total: tot(16.7, 12.2, 9.4, 14.6) },
    // practice — vol
    { date: "2026-05-05", routineId: volRoutine, type: "practice", category: "vol",
      execution: 16.4, difficulty: 12.2, horizontal: 9.2, timeOfFlight: 14.4, total: tot(16.4, 12.2, 9.2, 14.4) },
    // trial — Squad Trial, prelims
    { date: "2026-05-22", routineId: volRoutine, type: "trial", category: "vol",
      competitionName: "Squad Trial", competitionId: trialId, round: "prelims", rank: 4,
      execution: 16.0, difficulty: 12.2, horizontal: 8.9, timeOfFlight: 14.2, total: tot(16.0, 12.2, 8.9, 14.2) },
    // practice — vol_vol (two voluntary routines)
    { date: "2026-06-03", routineId: volRoutine, routineIdVol: volRoutine, type: "practice", category: "vol_vol",
      execution: 16.5, difficulty: 12.2, horizontal: 9.2, timeOfFlight: 14.5, total: tot(16.5, 12.2, 9.2, 14.5),
      executionVol: 16.3, difficultyVol: 12.2, horizontalVol: 9.1, timeOfFlightVol: 14.4, totalVol: tot(16.3, 12.2, 9.1, 14.4) },
  ];

  for (const r of scoreRows) {
    await db.insert(scores).values({ userId: UID, ...r } as any);
  }

  console.log("Done. Summary:");
  const counts = await Promise.all([
    db.select().from(skills).where(eq(skills.userId, UID)),
    db.select().from(routines).where(eq(routines.userId, UID)),
    db.select().from(notes).where(eq(notes.userId, UID)),
    db.select().from(scores).where(eq(scores.userId, UID)),
  ]);
  console.log(`  skills=${counts[0].length} routines=${counts[1].length} notes=${counts[2].length} scores=${counts[3].length}`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
