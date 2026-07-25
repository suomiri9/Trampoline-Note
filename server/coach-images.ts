// Coach chat photo storage: images are uploaded to Replit Object Storage
// (private dir) and the DB keeps only lightweight references. Legacy rows
// still hold base64 data URLs; both formats are readable.

import { randomUUID } from "crypto";
import type { Response } from "express";
import { objectStorageClient } from "./replit_integrations/object_storage";

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

// Parses PRIVATE_OBJECT_DIR ("/<bucket>/<prefix>") into bucket + prefix.
function privateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const parts = dir.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (parts.length < 1 || !parts[0]) {
    throw new Error(`Invalid PRIVATE_OBJECT_DIR: ${dir}`);
  }
  return { bucket: parts[0], prefix: parts.slice(1).join("/") };
}

function objectFileFor(key: string) {
  const { bucket, prefix } = privateDir();
  const name = prefix ? `${prefix}/${key}` : key;
  return objectStorageClient.bucket(bucket).file(name);
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
    await objectFileFor(key).save(buf, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=31536000, immutable" },
    });
    refs.push({ key, contentType });
  }
  return refs;
}

// Streams one stored image entry to the response. Handles both legacy
// base64 data URLs and object-storage refs. Returns false when the entry
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
    const file = objectFileFor(entry.key);
    const [exists] = await file.exists();
    if (!exists) return false;
    res.setHeader("Content-Type", entry.contentType);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    await new Promise<void>((resolve, reject) => {
      const stream = file.createReadStream();
      stream.on("error", reject);
      res.on("close", resolve);
      stream.pipe(res);
    });
    return true;
  }
  return false;
}
