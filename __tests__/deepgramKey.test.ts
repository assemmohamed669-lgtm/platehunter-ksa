import { describe, it, expect } from "vitest";
import { parseEnabledFlag, resolveActiveDeepgramKey, PLATE_LETTER_KEYTERMS } from "@/lib/deepgramKey";

describe("PLATE_LETTER_KEYTERMS — تحيّز Deepgram (رفع دقة اللوحة 21%→41% بالقياس)", () => {
  it("فيه كل أسماء الحروف الـ17 الفصحى", () => {
    for (const t of ["ألف","باء","حاء","دال","راء","سين","صاد","طاء","عين","قاف","كاف","لام","ميم","نون","هاء","واو","ياء"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
  it("فيه كلمات الأرقام (اللي رفعت دقة الأرقام لـ76%)", () => {
    for (const t of ["صفر","واحد","اتنين","تلاتة","اربعة","خمسة","ستة","سبعة","تمانية","تسعة"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
  it("فيه النطق المصري للحروف (حه/به/ره/طه)", () => {
    for (const t of ["حه","به","ره","طه","هه"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
});

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
