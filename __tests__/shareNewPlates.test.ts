/**
 * 📤 «مشاركة اللوحات الجديدة» في «فرز جديد» (٢٦ أكتوبر ٢٠٢٦) — `lib/newPlatesShare.ts`.
 *
 * المالك: «لما المندوب يختار فرز جديد يظهر تحت شيت الاحاله علامه مشاركه صغيرة ولما المندوب يدوس عليها يجيلو رساله
 * مفادها ان البرنامج هيشارك لوحات السيارات الجديدة في شيت اكسيل ولما يختارها يشارك الملف اكسيل وفيه لوحات السيارات
 * الجديدة في الشيت بكل بياناتها اللي نازله في المحفظه المهم الزر يكون صغير علشان ميعملش زحمه في البرنامج» ·
 * «خليه جوة المربع زر مشاركه علي اليمين ولما يتشارك يتشارك بنفس اسم الملف المرفوع».
 *  · «الجديد» = **نفس حساب «فرز جديد» بالحرف**: كل شيتات الإحالة مدموجة (أول ظهور يكسب) ناقص اللي في ملفات التشييك.
 *  · الصف بكل أعمدة المحفظة زي ما هو · الملف بنفس اسم ملف الإحالة المرفوع.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newPlatesFromReferral, newPlatesConfirmText, newPlatesFileBase, newPlatesShareName } from "@/lib/newPlatesShare";
import { normalizePlate } from "@/lib/plateParser";

const AR = {
  isArabic: true, plateCol: "رقم اللوحة",
  rows: [
    { "رقم اللوحة": "أ ب ح 1234", "الطراز": "كامري", "البنك": "الراجحي" },   // في التشييك
    { "رقم اللوحة": "د ه ل 5231", "الطراز": "اكورد", "البنك": "الراجحي" },   // جديدة
    { "رقم اللوحة": "د ه ل 5231", "الطراز": "مكرر", "البنك": "الراجحي" },     // مكررة ⇒ أول ظهور
  ],
};
const EN = {
  isArabic: false, plateCol: "Plate Number",
  rows: [
    { "Plate Number": "NKD 5678", "Vehicle Name": "Yukon", "Chassis Number": "VIN1" },   // جديدة
    { "Plate Number": "7709 ABS", "Vehicle Name": "Tahoe", "Chassis Number": "VIN2" },   // = سبا7709 في التشييك
  ],
};
const CHECK = new Set([normalizePlate("ابح1234"), normalizePlate("سبا7709")]);

describe("📤 اللوحات الجديدة", () => {
  it("كل الشيتات مدموجة ناقص التشييك — والصف بكل أعمدة المحفظة زي ما هو", () => {
    const rows = newPlatesFromReferral([AR, EN], CHECK);
    expect(rows).toEqual([
      { "رقم اللوحة": "د ه ل 5231", "الطراز": "اكورد", "البنك": "الراجحي" },
      { "Plate Number": "NKD 5678", "Vehicle Name": "Yukon", "Chassis Number": "VIN1" },
    ]);
  });
  it("الصفوف نسخة (الإكسيل مابيلمسش بيانات الصفحة)", () => {
    const rows = newPlatesFromReferral([AR], CHECK);
    rows[0]["الطراز"] = "اتغيّر";
    expect(AR.rows[1]["الطراز"]).toBe("اكورد");
  });
  it("مفيش تشييك ⇒ كل لوحات الإحالة جديدة · كله في التشييك ⇒ ولا لوحة", () => {
    expect(newPlatesFromReferral([AR], new Set()).length).toBe(2);
    expect(newPlatesFromReferral([EN], new Set([normalizePlate("نكد5678"), normalizePlate("سبا7709")]))).toEqual([]);
  });
  it("الرسالة بتقول هيشارك كام لوحة جديدة في إكسيل بكل بياناتها", () => {
    const t = newPlatesConfirmText(1234);
    expect(t).toContain("لوحات السيارات الجديدة");
    expect(t).toContain("إكسيل");
    expect(t).toContain((1234).toLocaleString("ar-EG"));
    expect(newPlatesFileBase(new Date(2026, 9, 26, 15, 0))).toBe("لوحات-جديدة-2026-10-26");
  });
  it("📁 بيتشارك **بنفس اسم ملف الإحالة المرفوع** (المالك: «يتشارك بنفس اسم الملف المرفوع») — والامتداد بتاع الملف الجديد", () => {
    const d = new Date(2026, 9, 26);
    expect(newPlatesShareName("Copy of Vehicles Details For Repo-83.xlsx", "xlsx", d)).toBe("Copy of Vehicles Details For Repo-83.xlsx");
    expect(newPlatesShareName("محفظة الراجحي.xlsb", "xlsx", d)).toBe("محفظة الراجحي.xlsx");
    expect(newPlatesShareName("كلي.v2.xlsx", "csv", d)).toBe("كلي.v2.csv");
    expect(newPlatesShareName(null, "xlsx", d)).toBe("لوحات-جديدة-2026-10-26.xlsx");
    expect(newPlatesShareName("   ", "xlsx", d)).toBe("لوحات-جديدة-2026-10-26.xlsx");
  });
});

describe("🔌 الزرار في صفحة الفرز", () => {
  const P = readFileSync(join(__dirname, "..", "app", "(app)", "sorting", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("جوّه مربع الإحالة على اليمين (المالك: «خليه جوة المربع زر مشاركه علي اليمين») — في «فرز جديد» بس", () => {
    expect(P).toContain('onShare={sortMode === "new" ? () => void shareNewPlates() : undefined}');
    expect(P).toContain('shareLabel="مشاركة اللوحات الجديدة"');
    expect(P).toContain("sharing={sharingNew}");
    expect(P).not.toContain("<Share2 size={12} /> {sharingNew");   // الزرار اللي كان برّه المربع اتشال
  });
  it("نفس حساب «فرز جديد»: كل ملفات التشييك + كل شيتات الإحالة ⇒ رسالة ⇒ إكسيل ⇒ مشاركة بنفس اسم الملف", () => {
    const i = P.indexOf("async function shareNewPlates()");
    const fn = P.slice(i, i + 2600);
    expect(fn).toContain("const checkSet = combinedCheckPlates(await loadAllCheckSources());");
    expect(fn).toContain("newPlatesFromReferral(collectRefSources(), checkSet)");
    expect(fn).toContain("if (!confirm(newPlatesConfirmText(rows.length))) return;");
    expect(fn).toContain('buildSpreadsheetBlob(rows, "لوحات جديدة")');
    expect(fn).toContain('await shareExcelBlob(blob, newPlatesShareName(referralFile?.name, ext, new Date()), "لوحات السيارات الجديدة", { keepName: true });');
    expect(fn).toContain('onSortShared("excel", rows.length, "لوحات جديدة");');
  });
});
