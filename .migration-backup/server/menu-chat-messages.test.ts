import { describe, expect, it } from "vitest";
import {
  buildMenuChatMessages,
  MENU_CHAT_OPENING_TEXT,
  type MenuChatMessage,
} from "./coach";

const CROP = "data:image/jpeg;base64,QUJD";
const SYSTEM = "system prompt";

function imageParts(msg: { role: string; content: unknown }) {
  if (!Array.isArray(msg.content)) return [];
  return msg.content.filter((p: any) => p.type === "image_url");
}

describe("buildMenuChatMessages", () => {
  it("attaches the crop to the opening user message on the first turn", () => {
    const messages: MenuChatMessage[] = [{ role: "user", content: "Read my menu" }];
    const out = buildMenuChatMessages(SYSTEM, CROP, messages);

    expect(out[0]).toEqual({ role: "system", content: SYSTEM });
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe("user");
    expect(imageParts(out[1])).toEqual([{ type: "image_url", image_url: { url: CROP } }]);
    expect(out[1].content).toContainEqual({ type: "text", text: "Read my menu" });
  });

  it("re-inserts the image turn when history starts with the assistant (client drops the synthetic opener)", () => {
    // Regression: the client's menuMessages state never contains the synthetic
    // opening user turn, so follow-up histories begin with the assistant's
    // first question. The model must STILL receive the photo.
    const messages: MenuChatMessage[] = [
      { role: "assistant", content: "What does TPS mean?" },
      { role: "user", content: "It applies to the whole row" },
      { role: "assistant", content: "Saved. What skills are on the first row?" },
      { role: "user", content: "why did u lose it" },
    ];
    const out = buildMenuChatMessages(SYSTEM, CROP, messages);

    expect(out[0]).toEqual({ role: "system", content: SYSTEM });
    // Opening image turn re-inserted before the history
    expect(out[1].role).toBe("user");
    expect(imageParts(out[1])).toEqual([{ type: "image_url", image_url: { url: CROP } }]);
    expect(out[1].content).toContainEqual({ type: "text", text: MENU_CHAT_OPENING_TEXT });
    // Full history preserved, in order, text-only
    expect(out.slice(2)).toEqual(messages.map((m) => ({ role: m.role, content: m.content })));
    // Exactly one image across the whole payload
    const totalImages = out.flatMap((m) => imageParts(m)).length;
    expect(totalImages).toBe(1);
  });

  it("falls back to the default opening text when the first user message is empty", () => {
    const out = buildMenuChatMessages(SYSTEM, CROP, [{ role: "user", content: "" }]);
    expect(out[1].content).toContainEqual({ type: "text", text: MENU_CHAT_OPENING_TEXT });
  });

  it("always yields exactly one image regardless of history shape", () => {
    const histories: MenuChatMessage[][] = [
      [{ role: "user", content: "hi" }],
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "next" },
      ],
      [
        { role: "assistant", content: "hello" },
        { role: "user", content: "next" },
      ],
    ];
    for (const h of histories) {
      const out = buildMenuChatMessages(SYSTEM, CROP, h);
      expect(out.flatMap((m) => imageParts(m)).length).toBe(1);
      expect(out.filter((m) => m.role === "system")).toHaveLength(1);
    }
  });
});
