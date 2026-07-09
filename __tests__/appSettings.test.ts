import { describe, it, expect, beforeEach } from "vitest";
import { clampFontScale, loadAppearance, saveAppearance, DEFAULT_APPEARANCE } from "@/lib/appSettings";

describe("clampFontScale", () => {
  it("keeps values within 1.0–1.6", () => {
    expect(clampFontScale(1)).toBe(1);
    expect(clampFontScale(1.3)).toBe(1.3);
    expect(clampFontScale(1.6)).toBe(1.6);
  });
  it("clamps out-of-range values", () => {
    expect(clampFontScale(0.5)).toBe(1);
    expect(clampFontScale(3)).toBe(1.6);
  });
  it("falls back to 1 for non-finite input", () => {
    expect(clampFontScale(NaN)).toBe(1);
    expect(clampFontScale(Infinity)).toBe(1.6);
  });
});

describe("loadAppearance / saveAppearance", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips saved settings", () => {
    saveAppearance({ fontScale: 1.4, textColor: "#112233", bgColor: "#ffeecc" });
    expect(loadAppearance()).toEqual({ fontScale: 1.4, textColor: "#112233", bgColor: "#ffeecc" });
  });

  it("clamps a stored font scale on load", () => {
    saveAppearance({ fontScale: 9 as number, textColor: null, bgColor: null });
    expect(loadAppearance().fontScale).toBe(1.6);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("ph:appearance", "{not json");
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
});
