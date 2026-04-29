import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useTimeFormat, parseTimeInput } from "@/hooks/use-time-format";
import { cn } from "@/lib/utils";

interface TimeFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

type Period = "am" | "pm";

function splitFor12h(value: string | null | undefined): { text: string; period: Period } {
  if (!value) return { text: "", period: "am" };
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return { text: "", period: "am" };
  const h = parseInt(m[1], 10);
  const mm = m[2];
  const period: Period = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { text: `${h12}:${mm}`, period };
}

function splitFor24h(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return "";
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
}

function combine12h(text: string, period: Period): string | null {
  const t = text.trim();
  if (!t) return null;
  const parsed = parseTimeInput(t);
  if (!parsed) return null;
  if (/[ap]m?$/i.test(t)) {
    return parsed;
  }
  const m = /^(\d{2}):(\d{2})$/.exec(parsed)!;
  const h = parseInt(m[1], 10);
  const mm = m[2];
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  let h24 = h12 % 12;
  if (period === "pm") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${mm}`;
}

function TimeField12({ value, onChange, ariaLabel, className, testId }: TimeFieldProps) {
  const initial = splitFor12h(value);
  const [text, setText] = useState(initial.text);
  const [period, setPeriod] = useState<Period>(initial.period);

  useEffect(() => {
    const next = splitFor12h(value);
    setText(next.text);
    setPeriod(next.period);
  }, [value]);

  const commit = (newText: string, newPeriod: Period) => {
    const trimmed = newText.trim();
    if (!trimmed) {
      if (value) onChange("");
      setText("");
      return;
    }
    const combined = combine12h(trimmed, newPeriod);
    if (combined) {
      onChange(combined);
      const split = splitFor12h(combined);
      setText(split.text);
      setPeriod(split.period);
    } else {
      const fallback = splitFor12h(value);
      setText(fallback.text);
      setPeriod(fallback.period);
    }
  };

  const togglePeriod = (next: Period) => {
    setPeriod(next);
    if (text.trim()) {
      commit(text, next);
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5 flex-1 min-w-0", className)}>
      <Input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder="h:mm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text, period)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="rounded-xl h-9 px-2 text-sm flex-1 min-w-0"
        data-testid={testId}
      />
      <div className="inline-flex p-0.5 rounded-lg bg-secondary/50 border border-border/50 shrink-0">
        {(["am", "pm"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => togglePeriod(p)}
            className={cn(
              "px-2 h-7 rounded-md text-[11px] font-bold uppercase transition-all",
              period === p
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid={testId ? `${testId}-${p}` : undefined}
            aria-pressed={period === p}
            aria-label={p === "am" ? "AM" : "PM"}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeField24({ value, onChange, ariaLabel, className, testId }: TimeFieldProps) {
  const [text, setText] = useState(() => splitFor24h(value));

  useEffect(() => {
    setText(splitFor24h(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (value) onChange("");
      setText("");
      return;
    }
    const parsed = parseTimeInput(trimmed);
    if (parsed) {
      onChange(parsed);
      setText(splitFor24h(parsed));
    } else {
      setText(splitFor24h(value));
    }
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder="HH:MM"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn("rounded-xl h-9 px-2 text-sm flex-1 min-w-0", className)}
      data-testid={testId}
    />
  );
}

export function TimeField(props: TimeFieldProps) {
  const [tf] = useTimeFormat();
  return tf === "12h" ? <TimeField12 {...props} /> : <TimeField24 {...props} />;
}
