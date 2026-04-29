import { useEffect, useRef, useState } from "react";
import { useTimeFormat, formatTime, parseTimeInput } from "@/hooks/use-time-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TimeFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

const ITEM_HEIGHT = 36;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;
const HEIGHT = VISIBLE * ITEM_HEIGHT;

function pad2(n: number) { return String(n).padStart(2, "0"); }

function nowHHMM(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

interface WheelProps<T extends string | number> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  testId?: string;
  render?: (v: T) => string;
  width?: number;
}

function Wheel<T extends string | number>({ items, value, onChange, testId, render, width = 56 }: WheelProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const idx = Math.max(0, items.indexOf(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTop = target;
    }
  }, [idx]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const i = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, i));
      const target = clamped * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) > 0.5) {
        el.scrollTo({ top: target, behavior: "smooth" });
      }
      if (items[clamped] !== value) onChange(items[clamped]);
    }, 120);
  };

  return (
    <div className="relative" style={{ height: HEIGHT, width }}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-9 rounded-lg bg-secondary/60 border-y border-border/60" />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-y" }}
        data-testid={testId}
      >
        <div style={{ height: PAD }} />
        {items.map((item, i) => (
          <div
            key={String(item)}
            onClick={() => onChange(item)}
            className={cn(
              "flex items-center justify-center text-base font-semibold cursor-pointer select-none transition-all",
              i === idx ? "text-foreground scale-100" : "text-muted-foreground/50 scale-95"
            )}
            style={{ height: ITEM_HEIGHT }}
          >
            {render ? render(item) : String(item)}
          </div>
        ))}
        <div style={{ height: PAD }} />
      </div>
    </div>
  );
}

export function TimeField({ value, onChange, ariaLabel, className, testId }: TimeFieldProps) {
  const [tf] = useTimeFormat();
  const [open, setOpen] = useState(false);

  const display = value ? formatTime(value, tf, "") : "";
  const placeholder = tf === "24h" ? "HH:MM" : "h:mm";

  const handleOpen = (next: boolean) => {
    if (next && !value) {
      onChange(nowHHMM());
    }
    setOpen(next);
  };

  const current = value || nowHHMM();
  const m = /^(\d{1,2}):(\d{2})/.exec(current);
  const h24 = m ? parseInt(m[1], 10) : 0;
  const mm = m ? parseInt(m[2], 10) : 0;

  const period: "am" | "pm" = h24 >= 12 ? "pm" : "am";
  let displayHour = h24;
  if (tf === "12h") {
    displayHour = h24 % 12;
    if (displayHour === 0) displayHour = 12;
  }

  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const hours = tf === "12h"
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);

  const setParts = (h: number, mins: number, p: "am" | "pm") => {
    let h24Out = h;
    if (tf === "12h") {
      h24Out = h % 12;
      if (p === "pm") h24Out += 12;
    }
    onChange(`${pad2(h24Out)}:${pad2(mins)}`);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "rounded-xl h-9 px-3 text-sm flex-1 min-w-0 border border-input bg-transparent text-left truncate",
            !display && "text-muted-foreground",
            className
          )}
          data-testid={testId}
        >
          {display || placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-2xl p-3 space-y-3" align="start">
        <TypedTimeInput value={value || ""} onChange={onChange} tf={tf} testId={testId ? `${testId}-typed` : undefined} />
        <div className="flex items-center gap-1">
          <Wheel
            items={hours}
            value={displayHour}
            onChange={(h) => setParts(h, mm, period)}
            testId={testId ? `${testId}-hour` : undefined}
            render={(v) => tf === "24h" ? pad2(v) : String(v)}
            width={56}
          />
          <span className="text-xl font-bold text-muted-foreground">:</span>
          <Wheel
            items={minutes}
            value={mm}
            onChange={(mins) => setParts(displayHour, mins, period)}
            testId={testId ? `${testId}-minute` : undefined}
            render={pad2}
            width={56}
          />
          {tf === "12h" && (
            <Wheel
              items={["am", "pm"]}
              value={period}
              onChange={(p) => setParts(displayHour, mm, p as "am" | "pm")}
              testId={testId ? `${testId}-period` : undefined}
              render={(v) => String(v).toUpperCase()}
              width={56}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TypedTimeInputProps {
  value: string;
  onChange: (v: string) => void;
  tf: "12h" | "24h";
  testId?: string;
}

function TypedTimeInput({ value, onChange, tf, testId }: TypedTimeInputProps) {
  const [text, setText] = useState(() => formatTime(value, tf, ""));

  useEffect(() => {
    setText(formatTime(value, tf, ""));
  }, [value, tf]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const parsed = parseTimeInput(trimmed);
    if (parsed) {
      onChange(parsed);
      setText(formatTime(parsed, tf, ""));
    } else {
      setText(formatTime(value, tf, ""));
    }
  };

  return (
    <Input
      type="text"
      inputMode="text"
      placeholder={tf === "24h" ? "HH:MM" : "h:mm am/pm"}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="rounded-xl h-9 px-3 text-sm text-center font-medium"
      data-testid={testId}
    />
  );
}
