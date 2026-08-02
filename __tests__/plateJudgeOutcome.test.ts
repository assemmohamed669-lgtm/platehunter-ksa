/**
 * `describeJudgeOutcome` — تسمية آخر نبضة بالعربي جوّه مربّع المالك.
 *
 * ليه دي موجودة؟ في الحادثة الميدانية كان المربّع بيقول «متوصّل» والخدمة مستلمة
 * صفر طلبات، ومافيش أي طريقة **على الجهاز** تقول أي بوابة سكتت: السبب كان
 * بيتكتب في IndexedDB بس، ويتقرا بزر «السجل» بعدين (وبتلخيص مجمّع مش آخر نبضة).
 * «متوصّل» بتوصف التخزين، **مش** آخر نبضة — فلازم يبقى جنبها سطر بيقول نتيجة
 * آخر نبضة فعلاً.
 */
import { describe, it, expect } from "vitest";
import { describeJudgeOutcome } from "@/lib/plateJudgeLog";

describe("describeJudgeOutcome", () => {
  it("مافيش نبضة لسه → شرطة", () => {
    expect(describeJudgeOutcome(null)).toBe("—");
    expect(describeJudgeOutcome("")).toBe("—");
  });

  it("كل سبب سكوت من الصفحة له نص واضح ومختلف", () => {
    const codes = ["not_configured", "no_timing", "busy", "no_audio", "prefix_too_large",
      "timeout", "network", "bad_json", "bad_shape", "no_answer", "error"];
    const seen = new Set<string>();
    for (const c of codes) {
      const s = describeJudgeOutcome(c);
      expect(s.length, c).toBeGreaterThan(2);
      expect(s, c).not.toBe("—");
      seen.add(s);
    }
    expect(seen.size, "مافيش نصّين متشابهين — وإلا التشخيص بيبوظ").toBe(codes.length);
  });

  it("أخطاء HTTP بتسمّي الكود، والتلاتة المشهورين بيتفسّروا", () => {
    expect(describeJudgeOutcome("http_401")).toContain("٤٠١");
    expect(describeJudgeOutcome("http_404")).toContain("٤٠٤");
    expect(describeJudgeOutcome("http_503")).toContain("٥٠٣");
    expect(describeJudgeOutcome("http_500")).toContain("500");
  });

  it("العنوان الغلط (٤٠٤) بيقول إن العنوان هو المشكلة — أهم حالة في الحادثة", () => {
    expect(describeJudgeOutcome("http_404")).toMatch(/العنوان/);
  });

  it("التوكن الغلط (٤٠١) بيقول توكن", () => {
    expect(describeJudgeOutcome("http_401")).toMatch(/توكن/);
  });

  it("«وصل رأي» للنبضة المجاوبة", () => {
    expect(describeJudgeOutcome("answered")).toMatch(/وصل/);
  });

  it("كود مش معروف بيرجع زي ما هو (مايختفيش)", () => {
    expect(describeJudgeOutcome("something_new")).toContain("something_new");
  });

  it("مايرميش على أي إدخال غريب", () => {
    for (const v of [undefined, 123, {}, [], true] as unknown[]) {
      expect(() => describeJudgeOutcome(v as string | null)).not.toThrow();
      expect(typeof describeJudgeOutcome(v as string | null)).toBe("string");
    }
  });
});
