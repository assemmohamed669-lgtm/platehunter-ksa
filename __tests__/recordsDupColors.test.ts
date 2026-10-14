import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { combinedDupColorMap, recordRowKey } from "@/lib/dupColors";

/**
 * 🎨 المكرر بين نتيجة الداتا ونتيجة السجلات — المالك (١٤ أكتوبر ٢٠٢٦): «في صفحه الفرز لما بيطلع سيارات مطلوبه من
 * السجلات وفيها مكرر مش بيتلون الاول كانت بتتلون زي ما بيحصل في نتيجه الفرز ل الداتا» (صورة الشاشة + الإكسيل).
 *
 * السبب: صف السجلات كان مفتاحه من **عمود لوحة ملف الإحالة الأساسي** (`effectiveReferralPlateCol`)، فالعربية اللي
 * جاية من ملف إحالة تاني (عمود لوحته اسمه مختلف) مفتاحها بيطلع فاضي ⇒ مابتتلوّنش. صف الداتا مالوش المشكلة دي
 * لأنه شايل `refPlateNorm` من وقت الفرز. ⇒ صف السجلات بقى شايل نفس المفتاح اللي اتطابق بيه.
 */
describe("🔴 مفتاح صف السجلات", () => {
  it("المفتاح اللي اتطابق بيه وقت الفرز", () => {
    expect(recordRowKey({ refPlateNorm: "رقه9312", tashyeekRow: { "رقم اللوحة": "x" } })).toBe("رقه9312");
  });
  it("نتايج محفوظة قبل التصليح (من غير المفتاح) ⇒ من لوحة السجل نفسه، مش من ملف الإحالة", () => {
    expect(recordRowKey({ tashyeekRow: { "رقم اللوحة": "ر ق ه 9312" } })).toBe("رقه9312");
    expect(recordRowKey({ tashyeekRow: { "رقم اللوحة": "9312 HGR" } })).toBe(recordRowKey({ tashyeekRow: { "رقم اللوحة": "ر ق ه 9312" } }));
  });
  it("🔴 عربية في الداتا (من ملف إحالة تاني) وفي السجلات ⇒ نفس اللون", () => {
    const dataKeys = ["سحه6216", "ريك6830"];                            // refPlateNorm بتاع صفوف الداتا
    const tashKeys = [recordRowKey({ refPlateNorm: "سحه6216", tashyeekRow: {} })];
    const map = combinedDupColorMap([dataKeys, tashKeys], 20);
    expect(map.has("سحه6216")).toBe(true);
    expect(map.has("ريك6830")).toBe(false);
  });
});

describe("🔴 التوصيل في صفحة الفرز", () => {
  const p = readFileSync(path.resolve(__dirname, "..", "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("صف السجلات شايل المفتاح اللي اتطابق بيه — في الفرز الكلي والجديد وسجلات المجموعة", () => {
    expect(p).toMatch(/type TashyeekResultRow = \{ tashyeekRow: Record<string, string>; referralRow: Record<string, string>; refPlateNorm\?: string \};/);
    expect(p).toMatch(/tashyeekMatches\.push\(\{ tashyeekRow: row, referralRow: hit\.row, refPlateNorm: n \}\)/);
    expect(p).toMatch(/tashyeekMatches\.push\(\{ tashyeekRow: row, referralRow: refRow, refPlateNorm: n \}\)/);
    expect(p).toMatch(/out\.push\(\{\n\s+referralRow: hit\.row,\n\s+refPlateNorm: hit\.norm,/);
  });
  it("المشاركة (صورة/إكسيل) بتاخد المفتاح ده", () => {
    expect(p).toMatch(/function tashRowKey\(r: TashyeekResultRow\): string \{\n\s+return recordRowKey\(r\);/);
  });
  it("🔴 الشاشة زي الإكسيل: الداتا والسجلات بخريطة ألوان واحدة", () => {
    expect(p).toMatch(/const plateColorMap = useMemo\(\(\) => combinedDupColorMap\(\[\(results \?\? \[\]\)\.map\(dataRowKey\), \(tashyeekResults \?\? \[\]\)\.map\(tashRowKey\)\], DUPE_COLORS\.length\)/);
    expect(p).toMatch(/const dupIdx = plateColorMap\.get\(tashRowKey\(r\)\);/);
  });
});

describe("🔴 «كل المرات» زي ما هو", () => {
  it("نفس العربية مرتين جوّه السجلات بس ⇒ متلوّنة برضه", () => {
    const tashKeys = [recordRowKey({ refPlateNorm: "رمر6579", tashyeekRow: {} }), recordRowKey({ tashyeekRow: { "رقم اللوحة": "ر م ر 6579" } })];
    expect(combinedDupColorMap([["سحه6216"], tashKeys], 20).has("رمر6579")).toBe(true);
  });
});
