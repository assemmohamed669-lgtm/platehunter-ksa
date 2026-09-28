import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withoutLocation } from "@/lib/exportColumns";

/**
 * 📍 **مشاركة السجلات من غير مواقع.**
 *
 * طلب المالك (٢٨ سبتمبر ٢٠٢٦): «عايز خيار في السجلات بالنسبه للمشاركه اني اقدر
 * ابعت السجلات بدون مواقع».
 */
describe("withoutLocation", () => {
  const rows = [
    {
      "رقم اللوحة": "أبج1234", "النوع": "ونيت", "الحي-الشارع": "الملز",
      "GPS": "https://www.google.com/maps?q=24.7,46.7", "التاريخ": "27-09-2026 14:30",
    },
    {
      "رقم اللوحة": "دهو5678", "النوع": "فان", "الحي-الشارع": "العليا",
      "GPS": "", "التاريخ": "26-09-2026 09:15",
    },
  ];

  it("🔴 بيشيل عمود GPS", () => {
    const out = withoutLocation(rows);
    for (const r of out) expect(Object.keys(r)).not.toContain("GPS");
  });

  it("بيسيب باقي الأعمدة زي ما هي وبنفس الترتيب", () => {
    const out = withoutLocation(rows);
    expect(Object.keys(out[0])).toEqual(["رقم اللوحة", "النوع", "الحي-الشارع", "التاريخ"]);
    expect(out[0]["الحي-الشارع"]).toBe("الملز");
    expect(out[1]["التاريخ"]).toBe("26-09-2026 09:15");
  });

  it("🔴 بيشيل أي عمود موقع مهما كان اسمه", () => {
    const out = withoutLocation([
      { "رقم اللوحة": "أبج1234", "الموقع": "x", "رابط الخريطة": "y", "Location": "z", "النوع": "ونيت" },
    ]);
    expect(Object.keys(out[0])).toEqual(["رقم اللوحة", "النوع"]);
  });

  it("🔴 وعمود اسمه عادي بس قيمه لينكات خرائط (زي «رابط» من شيت التشييك)", () => {
    const out = withoutLocation([
      { "رقم اللوحة": "أبج1234", "رابط": "https://maps.google.com/?q=1,2", "النوع": "ونيت" },
      { "رقم اللوحة": "دهو5678", "رابط": "24.71,46.67", "النوع": "فان" },
    ]);
    expect(Object.keys(out[0])).toEqual(["رقم اللوحة", "النوع"]);
  });

  it("مابيشيلش «الحي-الشارع» — ده عنوان مكتوب مش لينك موقع", () => {
    expect(Object.keys(withoutLocation(rows)[0])).toContain("الحي-الشارع");
  });

  it("مابيغيّرش الصفوف الأصلية", () => {
    withoutLocation(rows);
    expect(rows[0]["GPS"]).toContain("maps");
  });
});

/** حارس التوصيل — الخيار لازم يوصل لمشاركة شيت التسجيلات فعلاً. */
describe("توصيل «بدون مواقع» في مشاركة السجلات", () => {
  const code = readFileSync(join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

  it("🔴 إكسيل المشاركة بيعدّي على withoutLocation لما الخيار متعلّم", () => {
    expect(code).toMatch(/shareNoLocation \? withoutLocation\(buildFieldRows\(\)\) : buildFieldRows\(\)/);
  });

  it("🔴 الخيار ظاهر في نافذة «مشاركة شيت التسجيلات» — للكل", () => {
    // المالك جرّبه وقال «انشر للكل» (٢٨ سبتمبر ٢٠٢٦) ⇒ مافيش شرط isSuper.
    const i = code.indexOf("مشاركة شيت التسجيلات");
    expect(i).toBeGreaterThan(0);
    const dialog = code.slice(i, code.indexOf("بدون مواقع", i) + 20);
    expect(dialog).toContain("بدون مواقع");
    expect(dialog).not.toMatch(/isSuper/);
  });
});
