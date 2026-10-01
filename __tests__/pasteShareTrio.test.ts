import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shareFileName } from "@/lib/shareNames";
import { toSafeCacheFilename } from "@/lib/excel";

/**
 * 📤 **الأزرار التلاتة في «لصق نصي» كمان** (المالك ١ أكتوبر ٢٠٢٦ — صورة المندوب:
 * كان لسه شايف «مشاركة الفرز» + «مسح نتايج الفرز» مرتين لأن المندوب ده بيفرز باللصق).
 * وكمان «ويندو السجلات» بتاع اللصق: من غير «الحالة» والعمود الفاضي بيختفي.
 */
describe("اسم ملف مشاركة اللصق المجمّعة", () => {
  it("«كل نتايج لصق نصي» + التاريخ — ومفهوم على الموبايل", () => {
    const n = shareFileName("pasteAll", "2026-10-01T10:00:00");
    expect(n).toBe("كل نتايج لصق نصي all-paste 01-10-2026");
    expect(toSafeCacheFilename(`${n}.xlsx`)).toBe("all-paste-01-10-2026.xlsx");
  });
});

describe("توصيل أزرار اللصق", () => {
  const code = readFileSync(join(process.cwd(), "app", "(app)", "sorting", "page.tsx"), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const paste = code.slice(code.indexOf("ويندو الداتا —"), code.indexOf("<LocationNeighborsModal"));

  it("🔴 التلات أزرار وتحت كل واحد مسحه — بالترتيب", () => {
    const order = [
      "مشاركة الداتا والسجلات", "مسح كل الفرز",
      "مشاركة نتيجة الداتا", "مسح فرز الداتا",
      "مشاركة نتيجة فرز السجلات", "مسح فرز السجلات",
    ].map((s) => paste.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    for (let k = 1; k < order.length; k++) expect(order[k]).toBeGreaterThan(order[k - 1]);
  });

  it("🔴 الزرارين القديمين اتشالوا", () => {
    expect(paste).not.toContain("مسح نتايج الفرز");
    // زرار مشاركة سجلات اللصق واحد بس — الجديد اللي اسمه «مشاركة نتيجة فرز السجلات»
    const recBtns = paste.match(/<ShareSortButton title="لوحات سبق تشييكها"[^>]*?label="([^"]*)"/g) ?? [];
    expect(recBtns).toHaveLength(1);
    expect(recBtns[0]).toContain('label="مشاركة نتيجة فرز السجلات"');
    expect(paste.match(/<ShareSortButton title="لوحات سبق تشييكها"/g)).toHaveLength(1);
  });

  it("🔴 «مسح كل الفرز» بيمسح داتا اللصق وسجلاته مع بعض", () => {
    const fn = code.slice(code.indexOf("function clearAllPasteResults"), code.indexOf("function clearAllPasteResults") + 400);
    expect(fn).toContain("setPasteResults([])");
    expect(fn).toContain("setPasteRecordResults([])");
    expect(paste).toMatch(/onClick=\{clearAllPasteResults\}/);
  });

  it("🔴 المشاركة المجمّعة بأعمدة موحّدة بالمعنى (الداتا والسجلات تحت بعض)", () => {
    const fn = code.slice(code.indexOf("function pasteAllShareOf"), code.indexOf("function pasteAllShareOf") + 700);
    expect(fn).toContain("buildExportRows(");
    expect(fn).toContain("combinedDupColorMap([dataKeys, recKeys]");
  });

  it("🔴 ويندو السجلات: من غير «الحالة» والعمود الفاضي بيختفي", () => {
    expect(code).toMatch(/const pasteRecordShownCols = useMemo/);
    expect(paste).toMatch(/pasteRecordShownCols\.map/);
    expect(paste).not.toMatch(/pasteRecordCols\.map/);
    expect(code).toMatch(/for \(const col of pasteRecordShownCols\)/);
  });
});
