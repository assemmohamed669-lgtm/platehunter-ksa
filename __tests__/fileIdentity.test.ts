import { describe, it, expect } from "vitest";
import { fileIdentity } from "@/lib/fileIdentity";

/**
 * ملف الإحالة كان بيتفكّ ويتحلّل **من الأول في كل مرة** الصفحة تفتح — عشان
 * نعرف ورقاته وكام لوحة في كل ورقة. ده شغل تقيل بيوقف الواجهة، وبيتعاد على
 * ملف ماتغيّرش.
 *
 * البصمة دي بتقول «ده نفس الملف؟» عشان نتخطّى التحليل.
 *
 * ⚠️ **من غير التاريخ**: الملف بيتعاد بناؤه من التخزين كل مرة
 * (`new File([blob], name)`) فتاريخه بيبقى «دلوقتي» — يعني بصمة بالتاريخ
 * هتتغيّر كل مرة والكاش مايشتغلش أبداً.
 */
const f = (name: string, size: number, lastModified: number): File =>
  ({ name, size, lastModified } as File);

describe("fileIdentity", () => {
  it("نفس الاسم والحجم = نفس الملف", () => {
    expect(fileIdentity(f("bank.xlsx", 1024, 1))).toBe(fileIdentity(f("bank.xlsx", 1024, 1)));
  });

  it("🔴 التاريخ مش داخل البصمة — وإلا الكاش عمره ما يشتغل", () => {
    expect(fileIdentity(f("bank.xlsx", 1024, 111))).toBe(fileIdentity(f("bank.xlsx", 1024, 999)));
  });

  it("اسم مختلف = ملف مختلف", () => {
    expect(fileIdentity(f("a.xlsx", 1024, 1))).not.toBe(fileIdentity(f("b.xlsx", 1024, 1)));
  });

  it("حجم مختلف = ملف مختلف (نفس الاسم بمحتوى جديد)", () => {
    expect(fileIdentity(f("bank.xlsx", 1024, 1))).not.toBe(fileIdentity(f("bank.xlsx", 2048, 1)));
  });

  it("مافيش ملف = بصمة فاضية (مايتساويش مع أي ملف)", () => {
    expect(fileIdentity(null)).toBe("");
    expect(fileIdentity(null)).not.toBe(fileIdentity(f("a.xlsx", 1, 1)));
  });
});
