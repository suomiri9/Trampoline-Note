import { randomUUID } from "crypto";
import OpenAI from "openai";
import type { Response } from "express";
import type { DictionaryEntry } from "@workspace/db";
import { objectStorageClient } from "./replit_integrations/object_storage";

const MAX_BYTES = 20 * 1024 * 1024;
const MODEL = process.env.AI_INTEGRATIONS_OPENAI_IMAGE_MODEL || "gpt-image-1";
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export class DictionaryImageUnavailableError extends Error {
  constructor() { super("Image generation is unavailable right now."); }
}

function privateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  const parts = dir.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (!parts[0]) throw new DictionaryImageUnavailableError();
  return { bucket: parts[0], prefix: parts.slice(1).join("/") };
}
function fileFor(key: string) {
  const { bucket, prefix } = privateDir();
  return objectStorageClient.bucket(bucket).file(prefix ? `${prefix}/${key}` : key);
}
function validKey(entryId: number, key: string | null): key is string {
  return !!key && key.startsWith(`dictionary-images/${entryId}/`) && !key.includes("..");
}
function imageType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buf.length >= 3 && buf.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
export function dictionaryImagePrompt(entry: DictionaryEntry): string {
  const detail = entry.description?.trim() ? ` Skill context: ${entry.description.trim()}.` : "";
  return `Create a clean educational trampoline skill sequence for "${entry.name}" (${entry.shortName}${entry.numeric ? `, notation ${entry.numeric}` : ""}).${detail} Show 5-7 chronological poses of one consistent athlete on one trampoline, side view, neutral background. No text, arrows, numbers, or logos. Make anatomy plausible. This is a visual explanation for learning, not judging-level biomechanics.`;
}

export async function generateDictionaryImage(entry: DictionaryEntry): Promise<{ key: string; contentType: string; prompt: string; model: string }> {
  const prompt = dictionaryImagePrompt(entry);
  let data: Buffer;
  try {
    const result = await openai.images.generate({ model: MODEL, prompt, n: 1, size: "1536x1024", quality: "medium" } as any);
    const image = result.data?.[0] as { b64_json?: string; url?: string } | undefined;
    if (image?.b64_json) data = Buffer.from(image.b64_json, "base64");
    else if (image?.url) {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error("download failed");
      data = Buffer.from(await response.arrayBuffer());
    } else throw new Error("missing image");
  } catch {
    throw new DictionaryImageUnavailableError();
  }
  const contentType = data.length <= MAX_BYTES ? imageType(data) : null;
  if (!contentType) throw new DictionaryImageUnavailableError();
  const extension = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
  const key = `dictionary-images/${entry.id}/${randomUUID()}.${extension}`;
  try {
    await fileFor(key).save(data, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=31536000, immutable" } });
  } catch {
    throw new DictionaryImageUnavailableError();
  }
  return { key, contentType, prompt, model: MODEL };
}

export async function deleteDictionaryImage(entryId: number, key: string): Promise<void> {
  if (!validKey(entryId, key)) return;
  try { await fileFor(key).delete({ ignoreNotFound: true }); } catch { /* cleanup is best effort */ }
}
export async function serveDictionaryImage(
  entryId: number,
  key: string | null,
  contentType: string | null,
  res: Response,
  cacheControl = "private, max-age=31536000, immutable",
): Promise<boolean> {
  if (!validKey(entryId, key) || !contentType) return false;
  const file = fileFor(key);
  const [exists] = await file.exists();
  if (!exists) return false;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream.on("error", reject);
    res.on("close", resolve);
    stream.pipe(res);
  });
  return true;
}