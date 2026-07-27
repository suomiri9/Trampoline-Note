const MAX_DATA_URL_CHARS = 4 * 1024 * 1024;

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
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("not a readable image"));
    el.src = rawUrl;
  });
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  for (const quality of [0.85, 0.7, 0.5]) {
    const out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= MAX_DATA_URL_CHARS) return out;
  }
  throw new Error("image too large even after compression");
}
