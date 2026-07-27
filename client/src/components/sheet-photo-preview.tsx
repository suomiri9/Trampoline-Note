import { useState } from "react";
import { cn } from "@/lib/utils";

// The uploaded sheet photo, shown inside the photo-confirmation dialogs so the
// extracted numbers can be checked against the original. Tap toggles full size.
export function SheetPhotoPreview({ src, testId }: { src: string; testId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(e => !e)}
      className="block w-full rounded-xl border border-border/60 overflow-hidden bg-secondary/20"
      aria-label={expanded ? "Shrink photo" : "Enlarge photo"}
      data-testid={testId}
    >
      <img
        src={src}
        alt="Uploaded sheet photo"
        className={cn("w-full object-contain", expanded ? "cursor-zoom-out" : "max-h-44 cursor-zoom-in")}
      />
      <span className="block py-1 text-center text-[10px] text-muted-foreground font-mono">
        {expanded ? "tap to shrink" : "tap to enlarge"}
      </span>
    </button>
  );
}
