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
