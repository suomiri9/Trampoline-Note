import { useEffect, useState } from "react";

// An unfinished NEW training session, kept on this device only so it
// survives the app being closed mid-log. Cleared once the session is saved
// or discarded, and on logout so it never reaches another account.
const STORAGE_KEY = "unfinished-session-draft";

export interface SessionDraft {
  date: string; // yyyy-MM-dd
  startTime: string;
  endTime: string;
  content: string;
  rating: number | null;
  skills: unknown[];
  step: "skills" | "details";
  savedAt: number;
}

const listeners = new Set<() => void>();

export function readSessionDraft(): SessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || typeof d.date !== "string" || !Array.isArray(d.skills)) return null;
    return {
      date: d.date,
      startTime: typeof d.startTime === "string" ? d.startTime : "",
      endTime: typeof d.endTime === "string" ? d.endTime : "",
      content: typeof d.content === "string" ? d.content : "",
      rating: typeof d.rating === "number" ? d.rating : null,
      skills: d.skills,
      step: d.step === "details" ? "details" : "skills",
      savedAt: typeof d.savedAt === "number" ? d.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function writeSessionDraft(draft: SessionDraft) {
  if (typeof window === "undefined") return;
  const had = window.localStorage.getItem(STORAGE_KEY) !== null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {}
  if (!had) notify();
}

export function clearSessionDraft() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === null) return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notify();
}

/** True while an unfinished session is waiting on this device. */
export function useHasSessionDraft(): boolean {
  const [has, setHas] = useState(() => readSessionDraft() !== null);
  useEffect(() => {
    const fn = () => setHas(readSessionDraft() !== null);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return has;
}
