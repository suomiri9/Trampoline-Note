import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trackEvent", () => {
  it("is a no-op when the optional tracker is unavailable", () => {
    vi.stubGlobal("window", {});

    expect(() => trackEvent("account_login_succeeded")).not.toThrow();
  });

  it("forwards typed event data to Umami", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { umami: { track } });

    trackEvent("training_session_saved", {
      session_type: "execution",
      operation: "create",
    });

    expect(track).toHaveBeenCalledWith("training_session_saved", {
      session_type: "execution",
      operation: "create",
    });
  });

  it("swallows synchronous tracker failures", () => {
    const track = vi.fn(() => {
      throw new Error("tracker unavailable");
    });
    vi.stubGlobal("window", { umami: { track } });

    expect(() => trackEvent("routine_created")).not.toThrow();
  });

  it("handles rejected async tracker calls without an unhandled rejection", async () => {
    const track = vi.fn(() => Promise.reject(new Error("tracker unavailable")));
    vi.stubGlobal("window", { umami: { track } });
    const rejection = vi.fn();
    process.on("unhandledRejection", rejection);

    trackEvent("whoop_connect_clicked", { entrypoint: "dashboard" });
    await Promise.resolve();
    await Promise.resolve();

    process.off("unhandledRejection", rejection);
    expect(rejection).not.toHaveBeenCalled();
  });
});