import type { Note, Routine, Score, Skill } from "@shared/schema";

/**
 * Everything the app stores, as one JSON document. This is both the iOS
 * app's on-device data file and the format of "Export my data" on the web,
 * so a web export can be imported into the app unchanged.
 */
export interface BackupData {
  format: "trampoline-note";
  version: 1;
  exportedAt: string;
  user: { displayName: string | null; focusMemo: string | null };
  notes: Note[];
  skills: Skill[];
  routines: Routine[];
  scores: Score[];
}

export function emptyBackup(): BackupData {
  return {
    format: "trampoline-note",
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { displayName: null, focusMemo: null },
    notes: [],
    skills: [],
    routines: [],
    scores: [],
  };
}

export function parseBackup(text: string): BackupData {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Trampoline Note export.");
  }
  if (
    !data ||
    data.format !== "trampoline-note" ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.skills) ||
    !Array.isArray(data.routines) ||
    !Array.isArray(data.scores)
  ) {
    throw new Error("That file isn't a Trampoline Note export.");
  }
  return {
    ...emptyBackup(),
    ...data,
    user: {
      displayName: data.user?.displayName ?? null,
      focusMemo: data.user?.focusMemo ?? null,
    },
  };
}

/** Builds an export from the signed-in account on the web app. */
export async function exportFromServer(): Promise<BackupData> {
  const get = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Couldn't load your data. Check your connection and try again.");
    return res.json();
  };
  const [user, notes, skills, routines, scores] = await Promise.all([
    get("/api/auth/user"),
    get("/api/notes"),
    get("/api/skills"),
    get("/api/routines"),
    get("/api/scores"),
  ]);
  return {
    ...emptyBackup(),
    user: {
      displayName: user.displayName ?? user.firstName ?? null,
      focusMemo: user.focusMemo ?? null,
    },
    notes,
    skills,
    routines,
    scores,
  };
}

export function downloadBackup(data: BackupData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trampoline-note-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
