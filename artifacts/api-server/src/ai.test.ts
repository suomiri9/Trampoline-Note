import { describe, it, expect } from "vitest";
import { toClaudeRequest, extractJsonObject } from "./ai";

describe("toClaudeRequest", () => {
  it("moves the system prompt out and turns data: URLs into image blocks", () => {
    const out = toClaudeRequest([
      { role: "system", content: "rules" },
      {
        role: "user",
        content: [
          { type: "text", text: "read this" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } },
        ],
      },
    ]);
    expect(out.system).toBe("rules");
    expect(out.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "read this" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } },
        ],
      },
    ]);
  });

  it("drops leading assistant turns and fills empty ones", () => {
    const out = toClaudeRequest([
      { role: "system", content: "rules" },
      { role: "assistant", content: "earlier reply" },
      { role: "user", content: "" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "hi" },
    ]);
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.messages[0].content).toBe("(photo)");
  });
});

describe("extractJsonObject", () => {
  it("strips a code fence around the JSON", () => {
    expect(JSON.parse(extractJsonObject('```json\n{"level":"easy"}\n```'))).toEqual({ level: "easy" });
  });
});
