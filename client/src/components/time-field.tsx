import { useEffect, useRef, useState } from "react";
import { useTimeFormat, formatTime } from "@/hooks/use-time-format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const drag = useRef<{ startY: number; startTop: number; pointerId: number; moved: boolean } | null>(null);
  const idx = Math.max(0, items.indexOf(value));
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (drag.current || previewIdx !== null) return;
    const target = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTop = target;
    }
  }, [idx, previewIdx]);

  const updatePreview = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    setPreviewIdx((prev) => (prev === clamped ? prev : clamped));
  };

  const settle = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    const target = clamped * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTo({ top: target, behavior: "smooth" });
    }
    setPreviewIdx(null);
    if (items[clamped] !== value) onChange(items[clamped]);
  };

  const settleRef = useRef(settle);
  settleRef.current = settle;

  const cancelEditRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (drag.current) return;
      e.preventDefault();
      e.stopPropagation();
      cancelEditRef.current();
      el.scrollTop += e.deltaY;
      updatePreview();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => settleRef.current(), 100);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onScroll = () => {
    if (drag.current) return;
    updatePreview();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(settle, 120);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (e.pointerType === "touch") return;
    drag.current = { startY: e.clientY, startTop: el.scrollTop, pointerId: e.pointerId, moved: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > 2 && !drag.current.moved) {
      drag.current.moved = true;
      cancelEditRef.current();
    }
    el.scrollTop = drag.current.startTop - dy;
    updatePreview();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const wasMoved = drag.current.moved;
    try { el.releasePointerCapture(drag.current.pointerId); } catch {}
    drag.current = null;
    if (wasMoved) settle();
  };

  const [editText, setEditText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderItem = (item: T) => (render ? render(item) : String(item));
  const visibleIdx = previewIdx !== null ? previewIdx : idx;
  const visibleValue = items[visibleIdx] ?? value;
  const inputDisplay = editText !== null ? editText : renderItem(visibleValue);

  useEffect(() => {
    cancelEditRef.current = () => {
      setEditText(null);
      if (inputRef.current && document.activeElement === inputRef.current) {
        inputRef.current.blur();
      }
    };
  });

  useEffect(() => {
    const targets: HTMLElement[] = [];
    if (inputRef.current) targets.push(inputRef.current);
    if (containerRef.current) targets.push(containerRef.current);
    if (targets.length === 0) return;
    let touch: { y: number; top: number; moved: boolean } | null = null;
    const onStart = (e: TouchEvent) => {
      if (!ref.current || e.touches.length !== 1) return;
      touch = { y: e.touches[0].clientY, top: ref.current.scrollTop, moved: false };
    };
    const onMove = (e: TouchEvent) => {
      if (!ref.current || !touch) return;
      const dy = e.touches[0].clientY - touch.y;
      if (!touch.moved && Math.abs(dy) < 4) return;
      if (!touch.moved) cancelEditRef.current();
      touch.moved = true;
      e.preventDefault();
      ref.current.scrollTop = touch.top - dy;
      updatePreview();
    };
    const onEnd = () => {
      if (touch?.moved) {
        if (timer.current) window.clearTimeout(timer.current);
        settleRef.current();
      }
      touch = null;
    };
    targets.forEach((t) => {
      t.addEventListener("touchstart", onStart, { passive: true });
      t.addEventListener("touchmove", onMove, { passive: false });
      t.addEventListener("touchend", onEnd);
      t.addEventListener("touchcancel", onEnd);
    });
    return () => {
      targets.forEach((t) => {
        t.removeEventListener("touchstart", onStart);
        t.removeEventListener("touchmove", onMove);
        t.removeEventListener("touchend", onEnd);
        t.removeEventListener("touchcancel", onEnd);
      });
    };
  }, []);

  const commitEdit = () => {
    if (editText === null) return;
    const trimmed = editText.trim();
    if (trimmed) {
      let found: T | undefined;
      if (typeof items[0] === "number") {
        const n = parseInt(trimmed, 10);
        if (!Number.isNaN(n) && (items as unknown as number[]).includes(n)) found = n as T;
      } else {
        const lower = trimmed.toLowerCase();
        const list = items as unknown as string[];
        const exact = list.find((s) => s.toLowerCase() === lower);
        const prefix = exact ? undefined : list.find((s) => s.toLowerCase().startsWith(lower));
        if (exact) found = exact as unknown as T;
        else if (prefix) found = prefix as unknown as T;
      }
      if (found !== undefined && found !== value) onChange(found);
    }
    setEditText(null);
  };

  return (
    <div ref={containerRef} className="relative" style={{ height: HEIGHT, width, touchAction: "none" }}>
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="h-full overflow-y-auto overscroll-contain cursor-grab active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "none" }}
        data-testid={testId}
      >
        <div style={{ height: PAD }} />
        {items.map((item, i) => (
          <div
            key={String(item)}
            onClick={(e) => {
              if (drag.current?.moved) { e.preventDefault(); return; }
              if (i === visibleIdx) return;
              onChange(item);
            }}
            className={cn(
              "flex items-center justify-center text-base font-semibold cursor-pointer select-none transition-all",
              i === visibleIdx ? "invisible" : "text-muted-foreground/50 scale-95"
            )}
            style={{ height: ITEM_HEIGHT }}
          >
            {renderItem(item)}
          </div>
        ))}
        <div style={{ height: PAD }} />
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode={typeof items[0] === "number" ? "numeric" : "text"}
        value={inputDisplay}
        onFocus={(e) => { setEditText(renderItem(value)); e.currentTarget.select(); }}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setEditText(null); (e.target as HTMLInputElement).blur(); }
        }}
        onWheel={(e) => {
          if (!ref.current) return;
          ref.current.scrollTop += e.deltaY;
          updatePreview();
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => settleRef.current(), 100);
        }}
        style={{ touchAction: "none" }}
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-9 mx-0.5 text-center text-base font-semibold bg-secondary/60 rounded-lg border-y border-border/60 outline-none focus:ring-2 focus:ring-primary/40"
        data-testid={testId ? `${testId}-input` : undefined}
        aria-label="Edit value"
      />
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
      <PopoverContent className="w-auto rounded-2xl p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
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

