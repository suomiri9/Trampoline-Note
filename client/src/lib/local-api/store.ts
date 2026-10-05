import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { emptyBackup, type BackupData } from "./backup";

/**
 * The iOS app's data, kept in one JSON file in the app's Documents folder.
 * Documents is included in iCloud/device backups and, because the app
 * enables file sharing, the file also shows up in the Files app.
 */
export const DATA_FILE = "trampoline-note-data.json";
// Second copy written before the main file, so a crash mid-write always
// leaves one intact file. The leading dot hides it in the Files app.
const SPARE_FILE = ".trampoline-note-data.spare.json";

let data: BackupData | null = null;
let loading: Promise<BackupData> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readFile(path: string): Promise<BackupData | null> {
  try {
    const res = await Filesystem.readFile({
      path,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(res.data as string) as BackupData;
  } catch {
    // Missing (first launch) or unreadable.
    return null;
  }
}

function writeFile(path: string, contents: string) {
  return Filesystem.writeFile({
    path,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    data: contents,
  });
}

export function loadData(): Promise<BackupData> {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = (async () => {
      data = (await readFile(DATA_FILE)) ?? (await readFile(SPARE_FILE)) ?? emptyBackup();
      return data;
    })();
  }
  return loading;
}

/** Persists the current data. Writes are queued so they never interleave. */
export function saveData(): Promise<void> {
  const snapshot = JSON.stringify(data);
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await writeFile(SPARE_FILE, snapshot);
      await writeFile(DATA_FILE, snapshot);
    });
  return writeChain;
}

export async function replaceData(next: BackupData): Promise<void> {
  await loadData();
  data = next;
  await saveData();
}
