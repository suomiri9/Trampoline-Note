import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useTimeFormat, formatTime, parseTimeInput } from "@/hooks/use-time-format";
import { cn } from "@/lib/utils";

interface TimeFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

export function TimeField({ value, onChange, ariaLabel, className, testId }: TimeFieldProps) {
  const [tf] = useTimeFormat();
  const [text, setText] = useState(() => formatTime(value, tf, ""));

  useEffect(() => {
    setText(formatTime(value, tf, ""));
  }, [value, tf]);

  const placeholder = tf === "24h" ? "HH:MM" : "h:mm am/pm";

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
      setText(formatTime(parsed, tf, ""));
    } else {
      setText(formatTime(value, tf, ""));
    }
  };

  return (
    <Input
      type="text"
      inputMode={tf === "24h" ? "numeric" : "text"}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      className={cn("rounded-xl h-9 px-2 text-sm flex-1 min-w-0", className)}
      data-testid={testId}
    />
  );
}
