import { describe, it, expect, beforeEach } from "vitest";
import { clampFontScale, isDarkColor, loadAppearance, saveAppearance, DEFAULT_APPEARANCE } from "@/lib/appSettings";

describe("clampFontScale", () => {
  it("keeps values within 1.0–1.3", () => {
    expect(clampFontScale(1)).toBe(1);
    expect(clampFontScale(1.2)).toBe(1.2);
    expect(clampFontScale(1.3)).toBe(1.3);
  });
  it("clamps out-of-range values", () => {
    expect(clampFontScale(0.5)).toBe(1);
    expect(clampFontScale(3)).toBe(1.3);
  });
  it("falls back to 1 for non-finite input", () => {
    expect(clampFontScale(NaN)).toBe(1);
    expect(clampFontScale(Infinity)).toBe(1.3);
  });
});

describe("isDarkColor", () => {
  it("detects dark backgrounds (need light text)", () => {
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#1A1F24")).toBe(true);
    expect(isDarkColor("#0000ff")).toBe(true);
  });
  it("detects light backgrounds (need dark text)", () => {
    expect(isDarkColor("#ffffff")).toBe(false);
    expect(isDarkColor("#F3F5F7")).toBe(false);
    expect(isDarkColor("#ffff00")).toBe(false);
  });
  it("supports 3-digit hex and is safe on junk", () => {
    expect(isDarkColor("#000")).toBe(true);
    expect(isDarkColor("#fff")).toBe(false);
    expect(isDarkColor("nope")).toBe(false);
  });
});

describe("loadAppearance / saveAppearance", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips saved settings", () => {
    saveAppearance({ fontScale: 1.2, bgColor: "#000000" });
    expect(loadAppearance()).toEqual({ fontScale: 1.2, bgColor: "#000000" });
  });

  it("clamps a stored font scale on load", () => {
    saveAppearance({ fontScale: 9 as number, bgColor: null });
    expect(loadAppearance().fontScale).toBe(1.3);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("ph:appearance", "{not json");
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
});
