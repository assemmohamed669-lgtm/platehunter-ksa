import { describe, it, expect } from "vitest";
import { normalizeServiceKeys } from "@/lib/voiceKeys";

describe("normalizeServiceKeys — تطبيع مفاتيح البروفايل", () => {
  it("null/فاضي → كائن فاضي", () => {
    expect(normalizeServiceKeys(null)).toEqual({});
    expect(normalizeServiceKeys(undefined)).toEqual({});
  });
  it("بيطبّع المفاتيح ويشيل الفراغات والافتراضي deepgram", () => {
    expect(normalizeServiceKeys({ deepgram: "  ab ", speechmatics: "cd " }))
      .toEqual({ deepgram: "ab", speechmatics: "cd", engine: "deepgram" });
  });
  it("engine=speechmatics بيتحفظ", () => {
    expect(normalizeServiceKeys({ deepgram: "x", engine: "speechmatics" }).engine).toBe("speechmatics");
  });
  it("engine غير معروف → deepgram", () => {
    expect(normalizeServiceKeys({ engine: "whatever" }).engine).toBe("deepgram");
  });
});
