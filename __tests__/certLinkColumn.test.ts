import { describe, it, expect } from "vitest";
import { certExportRow, certCombinedExportRows, CERT_LINK_COL } from "@/lib/certColumns";
import type { WantedRow } from "@/lib/wantedTypes";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔗 عمود «لينك الشهادة» في إكسيل فرز الشهايد
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٤ أكتوبر ٢٠٢٦): «لما المندوب يفرز على الشهايد اليومية ويشارك شيت
 *  الإكسيل بتاع السيارات المطلوبة، يبقى فيه عمود اسمه لينك الشهادة، قدام كل
 *  سيارة لينك لما يدوس عليه يفتحله الشهادة PDF بتاعة اللوحة دي».
 *
 *  اللينك موجود أصلاً في البرنامج (بيتبعت على واتساب من زمان) — ناقص بس إنه
 *  يتحط في الشيت.
 */
const row = (over: Partial<WantedRow> = {}): WantedRow => ({
  id: "1", plate: "ا ب ح 1234", plateKey: "ابح1234",
  certLink: "https://platehunter-ksa.vercel.app/c/abc123",
  certNo: "CRN-119-001",
  ...over,
} as WantedRow);

describe("🔗 عمود لينك الشهادة", () => {
  it("🔴 اللينك بيطلع في صف الإكسيل قدام اللوحة", () => {
    const r = certExportRow(row(), ["الحالة"]);
    expect(r[CERT_LINK_COL]).toBe("https://platehunter-ksa.vercel.app/c/abc123");
    expect(r["رقم اللوحة"]).toBe("ا ب ح 1234");
  });

  it("اسم العمود زي ما المالك سمّاه", () => {
    expect(CERT_LINK_COL).toBe("لينك الشهادة");
  });

  it("مفيش لينك ⇒ الخانة فاضية مش «undefined»", () => {
    const r = certExportRow(row({ certLink: undefined }), ["الحالة"]);
    expect(r[CERT_LINK_COL]).toBe("");
  });

  it("🔴 اللينك آخر عمود — عشان مايزقّش الأعمدة المهمة", () => {
    const keys = Object.keys(certExportRow(row(), ["الحالة", "النوع"]));
    expect(keys[keys.length - 1]).toBe(CERT_LINK_COL);
  });

  it("🔴 المشاركة المجمّعة (داتا + سجلات) فيها اللينك كمان", () => {
    const rows = certCombinedExportRows([row()], [row({ id: "2" })], ["الحالة"]);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r[CERT_LINK_COL]).toBe("https://platehunter-ksa.vercel.app/c/abc123");
    // «المصدر» بيفضل جنب اللوحة زي ما هو
    expect(Object.keys(rows[0])[1]).toBe("المصدر");
  });
});
