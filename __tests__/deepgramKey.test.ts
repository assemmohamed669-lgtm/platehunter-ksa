import { describe, it, expect } from "vitest";
import { parseEnabledFlag, resolveActiveDeepgramKey } from "@/lib/deepgramKey";

describe("Deepgram enable flag — إيقاف/تشغيل مؤقت", () => {
  it("الافتراضي شغّال لما القيمة مش محدّدة (null)", () => {
    expect(parseEnabledFlag(null)).toBe(true);
  });

  it("متوقّف بس لو القيمة '0'", () => {
    expect(parseEnabledFlag("0")).toBe(false);
    expect(parseEnabledFlag("1")).toBe(true);
    expect(parseEnabledFlag("")).toBe(true);
  });

  it("resolveActiveDeepgramKey بيرجّع المفتاح لما شغّال", () => {
    expect(resolveActiveDeepgramKey("abc123", true)).toBe("abc123");
  });

  it("بيرجّع فاضي لما متوقّف (المفتاح محفوظ بس مش مستخدم)", () => {
    expect(resolveActiveDeepgramKey("abc123", false)).toBe("");
  });

  it("بيشيل الفراغات وبيتعامل مع الفاضي", () => {
    expect(resolveActiveDeepgramKey("  abc ", true)).toBe("abc");
    expect(resolveActiveDeepgramKey("", true)).toBe("");
  });
});
