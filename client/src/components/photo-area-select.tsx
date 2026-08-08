import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type CropRect = { x: number; y: number; w: number; h: number };

export interface PhotoAreaSelectHandle {
  /**
   * Stitches all selected regions vertically into a single JPEG data-url.
   * Falls back to the full photo when nothing is selected.
   */
  buildCropDataUrl: () => string;
}

interface PhotoAreaSelectProps {
  photoDataUrl: string;
  /** data-testids: `${testIdPrefix}-canvas`, `btn-${testIdPrefix}-clear` */
  testIdPrefix?: string;
  /** Shown above the canvas. */
  topHint?: string;
  /** Shown below the canvas while nothing is selected yet. */
  bottomHint?: string;
  /** Suffix after "N area(s) selected — ". */
  selectedHint?: string;
  /** Notified whenever the number of selected areas changes (incl. 0 on mount). */
  onSelectionChange?: (count: number) => void;
  /**
   * Set false while the component is kept mounted but visually hidden.
   * Drawing is skipped (a hidden canvas has zero width and would render at a
   * bogus size) and re-done when it becomes active again.
   */
  active?: boolean;
}

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];

/**
 * Drag-to-select areas of a photo (mouse + touch). Used by the "menu from
 * photo" and "score from photo" flows so the AI only reads the relevant part.
 * Coordinates are stored normalized (0..1) against the displayed canvas.
 */
export const PhotoAreaSelect = forwardRef<PhotoAreaSelectHandle, PhotoAreaSelectProps>(function PhotoAreaSelect(
  { photoDataUrl, testIdPrefix = "photo-area", topHint, bottomHint, selectedHint = "draw more or proceed", onSelectionChange, active = true },
  ref,
) {
  const [rects, setRects] = useState<CropRect[]>([]);
  const [currentRect, setCurrentRect] = useState<CropRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // New photo → start with a clean selection.
  useEffect(() => {
    setRects([]);
    setCurrentRect(null);
    setIsDragging(false);
    setDragStart(null);
  }, [photoDataUrl]);

  useEffect(() => {
    onSelectionChange?.(rects.length);
  }, [rects.length, onSelectionChange]);

  const getEventPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return {
      x: Math.max(0, Math.min(1, (src.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (src.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const pos = getEventPos(e, canvas);
    setDragStart(pos);
    setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const onPointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const pos = getEventPos(e, canvas);
    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const w = Math.abs(pos.x - dragStart.x);
    const h = Math.abs(pos.y - dragStart.y);
    setCurrentRect({ x, y, w, h });
  };

  const onPointerUp = () => {
    setIsDragging(false);
    setDragStart(null);
    // Commit the current rect if it's big enough
    setCurrentRect(prev => {
      if (prev && prev.w > 0.01 && prev.h > 0.01) {
        setRects(rs => [...rs, prev]);
      }
      return null;
    });
  };

  // Stitches all selected regions vertically into a single canvas data-url.
  // Falls back to the full photo if no regions are selected.
  const buildCropDataUrl = (): string => {
    const img = imgRef.current;
    if (!img) return photoDataUrl;
    const valid = rects.filter(r => r.w > 0.01 && r.h > 0.01);
    if (valid.length === 0) return photoDataUrl;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const GAP = 4;
    const outW = Math.max(...valid.map(r => Math.round(r.w * nw)));
    const outH = valid.reduce((sum, r) => sum + Math.round(r.h * nh), 0) + GAP * (valid.length - 1);
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");
    if (!ctx) return photoDataUrl;
    let y = 0;
    for (const r of valid) {
      const sx = Math.round(r.x * nw);
      const sy = Math.round(r.y * nh);
      const sw = Math.round(r.w * nw);
      const sh = Math.round(r.h * nh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, y, sw, sh);
      y += sh + GAP;
    }
    return c.toDataURL("image/jpeg", 0.9);
  };

  useImperativeHandle(ref, () => ({ buildCropDataUrl }));

  // Draw the photo + selection overlays onto the canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !photoDataUrl || !active) return;
    const drawFrame = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const displayW = canvas.offsetWidth;
      if (!displayW) return; // hidden or not laid out yet — redrawn on next activation
      const scale = displayW / img.naturalWidth;
      const displayH = Math.round(img.naturalHeight * scale);
      canvas.width = displayW;
      canvas.height = displayH;
      // Draw base image
      ctx.drawImage(img, 0, 0, displayW, displayH);
      // Collect all rects to display (committed + current in-progress)
      const allRects = [
        ...rects,
        ...(currentRect && currentRect.w > 0.005 && currentRect.h > 0.005 ? [currentRect] : []),
      ];
      if (allRects.length > 0) {
        // Dim the whole image
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, displayW, displayH);
        // For each rect: restore the image underneath, then draw border + number
        allRects.forEach((r, i) => {
          const rx = r.x * displayW;
          const ry = r.y * displayH;
          const rw = r.w * displayW;
          const rh = r.h * displayH;
          // Re-draw just the selected region from the source image
          ctx.drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight,
            r.w * img.naturalWidth, r.h * img.naturalHeight,
            rx, ry, rw, rh);
          const color = COLORS[i % COLORS.length];
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(rx, ry, rw, rh);
          // Number badge
          if (allRects.length > 1) {
            const label = String(i + 1);
            const pad = 4;
            const fontSize = 11;
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(label).width;
            const bw = tw + pad * 2;
            const bh = fontSize + pad * 2;
            ctx.fillStyle = color;
            ctx.fillRect(rx + 1, ry + 1, bw, bh);
            ctx.fillStyle = "#fff";
            ctx.fillText(label, rx + 1 + pad, ry + 1 + pad + fontSize - 2);
          }
        });
      }
    };
    if (img.complete && img.naturalWidth > 0) {
      drawFrame();
    } else {
      img.onload = drawFrame;
    }
  }, [photoDataUrl, rects, currentRect, active]);

  return (
    <div className="flex flex-col gap-3">
      {topHint && <p className="text-xs text-muted-foreground">{topHint}</p>}
      <div className="relative select-none touch-none">
        {/* Hidden natural-size img for dimension reference */}
        <img ref={imgRef} src={photoDataUrl} alt="" className="hidden" />
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border cursor-crosshair"
          style={{ touchAction: "none" }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
          data-testid={`${testIdPrefix}-canvas`}
        />
      </div>
      {rects.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-primary font-medium">
            {rects.length} area{rects.length !== 1 ? "s" : ""} selected — {selectedHint}
          </p>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive underline"
            onClick={() => setRects([])}
            data-testid={`btn-${testIdPrefix}-clear`}
          >
            Clear all
          </button>
        </div>
      ) : (
        bottomHint ? <p className="text-xs text-muted-foreground">{bottomHint}</p> : null
      )}
    </div>
  );
});
