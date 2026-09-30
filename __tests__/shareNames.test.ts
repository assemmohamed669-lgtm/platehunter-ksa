import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shareFileName, shareDate } from "@/lib/shareNames";
import { toSafeCacheFilename } from "@/lib/excel";

/** 📁 اسم الملف المشارك = نوع الفرز + تاريخ اليوم اللي فرز فيه (طلب المالك ٣٠ سبتمبر ٢٠٢٦). */
const ON = "2026-09-30T10:00:00";
describe("shareFileName", () => {
  it("🔴 كل نوع باسمه العربي وتاريخ يوم الفرز", () => {
    expect(shareFileName("new", ON)).toBe("نتيجة فرز جديد new-sort 30-09-2026");
    expect(shareFileName("full", ON)).toBe("فرز كلي full-sort 30-09-2026");
    expect(shareFileName("paste", ON)).toBe("لصق نصي paste 30-09-2026");
    expect(shareFileName("pasteRecords", ON)).toBe("نصي سجلات paste-records 30-09-2026");
    expect(shareFileName("fullRecords", ON)).toBe("كلي السجلات full-sort-records 30-09-2026");
    expect(shareFileName("newRecords", ON)).toBe("جديد السجلات new-sort-records 30-09-2026");
    expect(shareFileName("wanted", ON)).toBe("فرز الداتا على التشييك data-vs-check 30-09-2026");
  });

  it("🔴 على الموبايل (بعد ما العربي يتشال عشان مشاركة الأندرويد) الاسم لسه مفهوم — مش «file»", () => {
    expect(toSafeCacheFilename(`${shareFileName("full", ON)}.xlsx`)).toBe("full-sort-30-09-2026.xlsx");
    expect(toSafeCacheFilename(`${shareFileName("new", ON)}.xlsx`)).toBe("new-sort-30-09-2026.xlsx");
    expect(toSafeCacheFilename(`${shareFileName("paste", ON)}.png`)).toBe("paste-30-09-2026.png");
    expect(toSafeCacheFilename(`${shareFileName("wanted", ON)}.xlsx`)).toBe("data-vs-check-30-09-2026.xlsx");
  });

  it("التاريخ = يوم الفرز مش يوم المشاركة، وتاريخ باظ ⇒ النهارده", () => {
    expect(shareDate("2026-09-28T23:00:00")).toBe("28-09-2026");
    expect(() => shareDate("bad")).not.toThrow();
  });
});

describe("توصيل أسماء الملفات", () => {
  const code = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const btn = code("components", "ShareSortButton.tsx");
  const sort = code("app", "(app)", "sorting", "page.tsx");
  const wanted = code("app", "(app)", "wanted", "page.tsx");

  it("🔴 زرار المشاركة بيسمّي الملف (إكسيل وصورة) بـfileName", () => {
    expect(btn).toMatch(/fileName\?: string/);
    expect(btn).toMatch(/const fileBase = /);
  });
  it("🔴 كل أزرار المشاركة في الفرز بتاخد اسم بنوع الفرز وتاريخه", () => {
    const btns = sort.match(/<ShareSortButton[\s\S]*?\/>/g) ?? [];
    expect(btns.length).toBeGreaterThanOrEqual(5);
    for (const b of btns) expect(b).toMatch(/fileName=\{shareFileName\(/);
    expect(sort).toMatch(/sortedAt/);
  });
  it("🔴 صفحة المطلوب: «فرز الداتا على التشييك»", () => {
    expect(wanted).toMatch(/fileName=\{shareFileName\("wanted"/);
  });
});
