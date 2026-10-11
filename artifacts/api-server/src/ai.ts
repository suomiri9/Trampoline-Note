// One place where the app talks to Claude (Anthropic). The coach builds its
// prompts in a simple chat shape (system / user / assistant turns, with photos
// as data: URLs); this file turns that into a Claude request and returns the
// reply text.
//
// A placeholder key keeps the server starting without ANTHROPIC_API_KEY; AI
// calls then fail and the coach shows "unavailable".

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "missing",
});

// CLAUDE_MODEL (not the old COACH_MODEL) so a leftover OpenAI model name in
// Render's Environment tab can't be sent to Claude by mistake.
export const AI_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// Room for the model's private thinking plus the visible reply. The prompts
// themselves keep replies short.
const MAX_TOKENS = 16000;

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | AiContentPart[] }
  | { role: "assistant"; content: string };

export interface AiRequest {
  messages: AiMessage[];
  // The prompt asks for JSON only; pull the JSON object out of the reply.
  json?: boolean;
  signal?: AbortSignal;
  // When given, the reply is streamed and each text chunk is passed here.
  onDelta?: (chunk: string) => void;
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;

function toClaudePart(part: AiContentPart): Anthropic.Beta.BetaContentBlockParam {
  if (part.type === "text") return { type: "text", text: part.text || "(photo)" };
  const m = part.image_url.url.match(DATA_URL_RE);
  if (m) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: m[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: m[2],
      },
    };
  }
  return { type: "image", source: { type: "url", url: part.image_url.url } };
}

// Claude takes the system prompt separately, needs the conversation to start
// with the athlete, and rejects empty turns.
export function toClaudeRequest(messages: AiMessage[]): {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  const out: Anthropic.Beta.BetaMessageParam[] = turns.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role as "user" | "assistant", content: m.content.trim() || "(photo)" };
    }
    return { role: "user", content: m.content.map(toClaudePart) };
  });
  return { system, messages: out };
}

// Returns the first {...} object in the reply (models sometimes wrap JSON in a
// code fence), or the reply unchanged.
export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
}

function replyText(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

export async function aiComplete({ messages, json, signal, onDelta }: AiRequest): Promise<string> {
  const { system, messages: claudeMessages } = toClaudeRequest(messages);
  const params = {
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: claudeMessages,
    // Short, data-grounded answers: low effort keeps replies quick.
    output_config: { effort: "low" as const },
    // If Claude declines a request for safety reasons, retry on the
    // recommended backup model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };

  let text: string;
  let stopReason: string | null;
  if (onDelta) {
    const stream = client.beta.messages.stream(params, { signal });
    stream.on("text", (delta) => {
      if (delta) onDelta(delta);
    });
    const final = await stream.finalMessage();
    text = replyText(final.content);
    stopReason = final.stop_reason;
  } else {
    const response = await client.beta.messages.create(params, { signal });
    text = replyText(response.content);
    stopReason = response.stop_reason;
  }
  if (stopReason === "refusal") return "";
  return json ? extractJsonObject(text) : text;
}
