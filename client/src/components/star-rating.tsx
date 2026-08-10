import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface StarRatingProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}

export function StarRating({ value, onChange, readonly = false, size = "md" }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  
  const displayValue = hoverValue ?? value ?? 0;
  const isSm = size === "sm";

  return (
    <div className={cn("flex items-center", isSm ? "gap-0.5" : "gap-1")} onMouseLeave={() => setHoverValue(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={cn(
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full transition-all duration-200",
            isSm ? "p-0" : "p-1",
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"
          )}
          onClick={() => {
            if (readonly) return;
            // Clicking the same star clears it
            onChange(value === star ? null : star);
          }}
          onMouseEnter={() => {
            if (readonly) return;
            setHoverValue(star);
          }}
        >
          <Star
            className={cn(
              "transition-all duration-300",
              isSm ? "w-2.5 h-2.5" : "w-5 h-5",
              displayValue >= star 
                ? "fill-yellow-400 text-yellow-400" 
                : "fill-transparent text-muted-foreground/55 hover:text-yellow-300"
            )}
          />
        </button>
      ))}
    </div>
  );
}
