import { Flame } from "lucide-react";
import { type Note } from "@shared/schema";

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
  return formatLocalDate(monday);
}

function calculateStreaks(notes: Note[]) {
  if (notes.length === 0) {
    return { current: 0, longest: 0 };
  }

  const weeksWithSessions = new Set<string>();
  for (const note of notes) {
    const parts = note.date.split("-");
    const noteDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    weeksWithSessions.add(getWeekKey(noteDate));
  }

  const sortedWeeks = Array.from(weeksWithSessions).sort();
  if (sortedWeeks.length === 0) {
    return { current: 0, longest: 0 };
  }

  const currentWeek = getWeekKey(new Date());
  const previousWeek = new Date();
  previousWeek.setDate(previousWeek.getDate() - 7);
  const previousWeekKey = getWeekKey(previousWeek);

  let longest = 1;
  let runLength = 1;

  for (let i = 1; i < sortedWeeks.length; i++) {
    const prev = new Date(sortedWeeks[i - 1]);
    const curr = new Date(sortedWeeks[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 7) {
      runLength++;
    } else {
      runLength = 1;
    }
    longest = Math.max(longest, runLength);
  }

  const lastWeek = sortedWeeks[sortedWeeks.length - 1];
  let activeStreak = 0;

  if (lastWeek === currentWeek || lastWeek === previousWeekKey) {
    activeStreak = 1;
    for (let i = sortedWeeks.length - 1; i > 0; i--) {
      const prev = new Date(sortedWeeks[i - 1]);
      const curr = new Date(sortedWeeks[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 7) {
        activeStreak++;
      } else {
        break;
      }
    }
  }

  return { current: activeStreak, longest };
}

function getFlameIntensity(streak: number): { color: string; size: string; animate: boolean } {
  if (streak === 0) {
    return { color: "text-gray-300 dark:text-gray-600", size: "w-8 h-8", animate: false };
  }
  if (streak <= 2) {
    return { color: "text-orange-400", size: "w-8 h-8", animate: false };
  }
  if (streak <= 4) {
    return { color: "text-orange-500", size: "w-9 h-9", animate: true };
  }
  if (streak <= 8) {
    return { color: "text-red-500", size: "w-10 h-10", animate: true };
  }
  return { color: "text-red-600", size: "w-11 h-11", animate: true };
}

interface StreakCardProps {
  notes: Note[];
}

export function StreakCard({ notes }: StreakCardProps) {
  const { current, longest } = calculateStreaks(notes);
  const flame = getFlameIntensity(current);

  return (
    <div
      className="mb-6 p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-5"
      data-testid="streak-card"
    >
      <div
        className={`p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center ${flame.animate ? "animate-pulse" : ""}`}
        data-testid="streak-flame-icon"
      >
        <Flame className={`${flame.size} ${flame.color}`} />
      </div>
      <div className="flex-1 flex items-center gap-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Streak</p>
          <p className="text-2xl font-bold" data-testid="text-current-streak">
            {current} <span className="text-sm font-normal text-muted-foreground">{current === 1 ? "week" : "weeks"}</span>
          </p>
        </div>
        <div className="w-px h-10 bg-border" />
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Longest Streak</p>
          <p className="text-2xl font-bold" data-testid="text-longest-streak">
            {longest} <span className="text-sm font-normal text-muted-foreground">{longest === 1 ? "week" : "weeks"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}