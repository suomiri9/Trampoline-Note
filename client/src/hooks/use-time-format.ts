import { useEffect, useState } from "react";

export type TimeFormat = "12h" | "24h";

const STORAGE_KEY = "timeFormat";
const DEFAULT: TimeFormat = "12h";

const listeners = new Set<(v: TimeFormat) => void>();

function readStored(): TimeFormat {
  if (typeof window === "undefined") return DEFAULT;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "24h" || v === "12h" ? v : DEFAULT;
}

export function useTimeFormat(): [TimeFormat, (v: TimeFormat) => void] {
  const [value, setValue] = useState<TimeFormat>(readStored);

  useEffect(() => {
    const sync = (v: TimeFormat) => setValue(v);
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  const update = (v: TimeFormat) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v);
    }
    listeners.forEach(fn => fn(v));
  };

  return [value, update];
}

export function formatTime(time: string | null | undefined, fmt: TimeFormat, fallback = "??:??"): string {
  if (!time) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  if (Number.isNaN(h)) return time;
  if (fmt === "24h") {
    return `${String(h).padStart(2, "0")}:${mm}`;
  }
  const period = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${period}`;
}

export function parseTimeInput(input: string): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const m = /^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3]?.[0];
  if (Number.isNaN(h) || Number.isNaN(mm) || mm < 0 || mm > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (period === "p" && h !== 12) h += 12;
    if (period === "a" && h === 12) h = 0;
  } else {
    if (h < 0 || h > 23) return null;
  }
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
