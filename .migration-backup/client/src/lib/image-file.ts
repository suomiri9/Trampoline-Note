const MAX_DATA_URL_CHARS = 4 * 1024 * 1024;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("not a readable image"));
    el.src = src;
  });
}

// Compress an image file to a JPEG data URL small enough for the photo-parse
// APIs (4MB request cap). Shared by the ToF, Execution, and Score photo flows.
export async function fileToDataUrl(file: File): Promise<string> {
  const rawUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
  if (rawUrl.length <= MAX_DATA_URL_CHARS && /^data:image\/(jpeg|png|webp);base64,/.test(rawUrl)) {
    return rawUrl;
  }
  return compressDataUrl(rawUrl);
}

export interface CompressOptions {
  /** Max data-url length in characters (base64 string, not binary). */
  maxChars?: number;
  /** Max long-side in pixels. */
  maxSide?: number;
  /** JPEG qualities to try, in order. */
  qualities?: number[];
}

// Re-encode any image data URL as a JPEG that fits the photo-parse APIs.
// Tries the requested size first, then progressively smaller ones — a very
// detailed photo (or a tall stitched crop) may need extra downscaling to fit.
export async function compressDataUrl(dataUrl: string, opts: CompressOptions = {}): Promise<string> {
  const { maxChars = MAX_DATA_URL_CHARS, maxSide = 1600, qualities = [0.85, 0.7, 0.5] } = opts;
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const sides = [maxSide, 1280, 1024, 800, 640].filter((s, i, all) => s <= maxSide && all.indexOf(s) === i);
  for (const side of sides) {
    const scale = Math.min(1, side / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const quality of qualities) {
      const out = canvas.toDataURL("image/jpeg", quality);
      if (out.length <= maxChars) return out;
    }
  }
  throw new Error("image too large even after compression — try a smaller photo");
}
