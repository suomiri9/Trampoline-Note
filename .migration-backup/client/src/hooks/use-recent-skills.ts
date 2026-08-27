import { useEffect, useState } from "react";

const STORAGE_KEY = "recent-conn-skills";
const MAX = 8;

const listeners = new Set<() => void>();

function read(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.filter((x): x is number => typeof x === "number").slice(0, MAX);
    }
  } catch {}
  return [];
}

function write(ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {}
  listeners.forEach((fn) => fn());
}

export function addRecentSkill(id: number) {
  const cur = read();
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, MAX);
  write(next);
}

export function useRecentSkills(): number[] {
  const [ids, setIds] = useState<number[]>(read);
  useEffect(() => {
    const fn = () => setIds(read());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return ids;
}

export type RecentEntry =
  | { kind: "skill"; id: number }
  | { kind: "routine"; id: number }
  | { kind: "fc"; id: number };

const ENTRY_STORAGE_KEY = "recent-note-entries";
const ENTRY_MAX = 8;
const entryListeners = new Set<() => void>();

function readEntries(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ENTRY_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .filter(
          (x): x is RecentEntry =>
            x &&
            typeof x.id === "number" &&
            (x.kind === "skill" || x.kind === "routine" || x.kind === "fc"),
        )
        .slice(0, ENTRY_MAX);
    }
  } catch {}
  return [];
}

function writeEntries(entries: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify(entries.slice(0, ENTRY_MAX)));
  } catch {}
  entryListeners.forEach((fn) => fn());
}

export function addRecentEntry(entry: RecentEntry) {
  const cur = readEntries();
  const next = [entry, ...cur.filter((x) => !(x.kind === entry.kind && x.id === entry.id))].slice(0, ENTRY_MAX);
  writeEntries(next);
}

export function useRecentEntries(): RecentEntry[] {
  const [entries, setEntries] = useState<RecentEntry[]>(readEntries);
  useEffect(() => {
    const fn = () => setEntries(readEntries());
    entryListeners.add(fn);
    return () => {
      entryListeners.delete(fn);
    };
  }, []);
  return entries;
}
