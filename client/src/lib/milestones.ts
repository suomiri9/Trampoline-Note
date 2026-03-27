import type { Note, Skill } from "@shared/schema";

export interface Milestone {
  type: "session" | "skill-reps" | "new-skill";
  title: string;
  description: string;
}

const SESSION_MILESTONES = [10, 25, 50, 100];
const REP_MILESTONES = [50, 100, 250, 500, 1000];

interface ParsedSkillEntry {
  id: number;
  reps?: number;
}

function parseSkillsFromNote(note: Note): ParsedSkillEntry[] {
  if (!note.skills) return [];
  try {
    const parsed = JSON.parse(note.skills) as ParsedSkillEntry[];
    return parsed.filter((s) => s.id > 0);
  } catch {
    return [];
  }
}

function computeRepsBySkill(notes: Note[]): Map<number, number> {
  const repMap = new Map<number, number>();
  for (const note of notes) {
    const entries = parseSkillsFromNote(note);
    for (const entry of entries) {
      if (entry.reps && entry.reps > 0) {
        repMap.set(entry.id, (repMap.get(entry.id) || 0) + entry.reps);
      }
    }
  }
  return repMap;
}

function getSkillIdsInNotes(notes: Note[]): Set<number> {
  const ids = new Set<number>();
  for (const note of notes) {
    const entries = parseSkillsFromNote(note);
    for (const entry of entries) {
      ids.add(entry.id);
    }
  }
  return ids;
}

export function checkMilestones(
  notesBefore: Note[],
  notesAfter: Note[],
  savedNote: Note,
  skills: Skill[],
  isUpdate: boolean
): Milestone[] {
  const milestones: Milestone[] = [];

  if (!isUpdate) {
    const totalSessions = notesAfter.length;
    if (SESSION_MILESTONES.includes(totalSessions)) {
      milestones.push({
        type: "session",
        title: `${totalSessions} Sessions!`,
        description: `You've logged ${totalSessions} training sessions. Keep it up!`,
      });
    }
  }

  const savedSkillEntries = parseSkillsFromNote(savedNote);
  if (savedSkillEntries.length === 0) return milestones;

  const uniqueSkillIds = [...new Set(savedSkillEntries.map((e) => e.id))];
  const skillMap = new Map(skills.map((s) => [s.id, s]));

  const repsBefore = computeRepsBySkill(notesBefore);
  const repsAfter = computeRepsBySkill(notesAfter);
  const skillIdsBefore = getSkillIdsInNotes(notesBefore);

  for (const skillId of uniqueSkillIds) {
    const skill = skillMap.get(skillId);
    if (!skill) continue;
    const skillName = skill.name;

    if (!skillIdsBefore.has(skillId)) {
      milestones.push({
        type: "new-skill",
        title: `New Skill Logged!`,
        description: `First time logging "${skillName}" in a session.`,
      });
    }

    const prevTotal = repsBefore.get(skillId) || 0;
    const currTotal = repsAfter.get(skillId) || 0;

    for (const threshold of REP_MILESTONES) {
      if (prevTotal < threshold && currTotal >= threshold) {
        milestones.push({
          type: "skill-reps",
          title: `${threshold} Reps of ${skillName}!`,
          description: `You've hit ${threshold} total reps of "${skillName}". Amazing!`,
        });
      }
    }
  }

  return milestones;
}
