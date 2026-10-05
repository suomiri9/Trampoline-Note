// Coach chat photo storage: images are saved in the stored_files table
// and messages keep only lightweight references. Legacy rows
// still hold base64 data URLs; both formats are readable.

import { randomUUID } from "crypto";
import type { Response } from "express";
import { deleteFile, saveFile, sendFile } from "./file-store";

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// A stored image entry is either a legacy base64 data URL string or an
// object-storage reference. `key` is scoped under coach-images/<userId>/ so
// a message can never reference another user's object.
export interface CoachImageRef {
  key: string;
  contentType: string;
}

export function isCoachImageRef(v: unknown): v is CoachImageRef {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CoachImageRef).key === "string" &&
    typeof (v as CoachImageRef).contentType === "string"
  );
}

// Uploads validated image data URLs to object storage and returns refs for
// the DB. Throws on failure — the caller decides whether to fall back.
export async function storeCoachImages(
  userId: string,
  dataUrls: string[],
): Promise<CoachImageRef[]> {
  const refs: CoachImageRef[] = [];
  for (const dataUrl of dataUrls) {
    const match = dataUrl.match(DATA_URL_RE);
    if (!match) throw new Error("Unsupported image format");
    const contentType = match[1];
    const buf = Buffer.from(match[2], "base64");
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `coach-images/${userId}/${randomUUID()}.${ext}`;
    await saveFile(key, buf, contentType);
    refs.push({ key, contentType });
  }
  return refs;
}

// Best-effort removal of uploaded coach images — used to compensate when a
// stopped reply already uploaded photos that will never be referenced by a
// DB row. Failures are logged, never thrown (the blobs are private and
// unreferenced either way).
export async function deleteCoachImages(refs: CoachImageRef[]): Promise<void> {
  for (const ref of refs) {
    try {
      await deleteFile(ref.key);
    } catch (err) {
      console.error(`[coach-images] cleanup failed for ${ref.key}:`, err);
    }
  }
}

// Streams one stored image entry to the response. Handles both legacy
// base64 data URLs and stored-file refs. Returns false when the entry
// is missing/invalid (caller sends 404).
export async function serveCoachImage(
  userId: string,
  entry: unknown,
  res: Response,
): Promise<boolean> {
  if (typeof entry === "string") {
    const match = entry.match(DATA_URL_RE);
    if (!match) return false;
    const buf = Buffer.from(match[2], "base64");
    res.setHeader("Content-Type", match[1]);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(buf);
    return true;
  }
  if (isCoachImageRef(entry)) {
    // Message lookup is already user-scoped, but enforce the key prefix too
    // so a corrupted row can never serve another user's object.
    if (!entry.key.startsWith(`coach-images/${userId}/`)) return false;
    return sendFile(entry.key, entry.contentType, "private, max-age=31536000, immutable", res);
  }
  return false;
}
