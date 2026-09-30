import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pasteColumnsOf } from "@/lib/pasteColumns";

/**
 * 📋 **أعمدة نتيجة «لصق نصي» من الصفوف اللي اتطابقت فعلاً.**
 *
 * بلاغ المالك (٣٠ سبتمبر ٢٠٢٦): مندوب بيفرز بلصق نصي، واللوحات بتطلع بس من غير
 * بياناتها (النوع · اسم الشارع · الحي · تاريخ التسجيل · المسجل). الإكسيل اللي
 * بعته: أعمدة محفظة (ASTUNIQUE · Company · CHASISNUM…) كلها فاضية.
 *
 * السبب: أعمدة النتيجة كانت **هيدرز ملف الداتا الأساسي بس** — والمندوب عنده في
 * المربع الأساسي ملف بأعمدة تانية، واللوحات اتطابقت من مصدر تاني (داتا المجموعة)
 * بأعمدته هو. فالبرنامج بيدوّر على أعمدة المحفظة جوّه صفوف الداتا ⇒ فاضي.
 */
const WALLET_LIKE = { "رقم اللوحة": "ابج1234", "ASTUNIQUE": "A1", "Company": "X", "CHASISNUM": "JT1" };
const GROUP = {
  "رقم اللوحه ": "ردح5349", "نوع السياره": "كامري", "اسم الشارع": "خضرا276",
  "تاريخ التسجيل": "27/07/2026", "الحي": "الخضراء", "المسجل": "سامح",
};

describe("pasteColumnsOf", () => {
  it("🔴 الصفوف من داتا المجموعة ⇒ أعمدتها هي (مش أعمدة الملف الأساسي)", () => {
    expect(pasteColumnsOf([GROUP, { ...GROUP, "رقم اللوحه ": "سحه2941" }]))
      .toEqual(["نوع السياره", "اسم الشارع", "تاريخ التسجيل", "الحي", "المسجل"]);
  });

  it("🔴 مصدرين مختلفين ⇒ أعمدة الاتنين بترتيب ظهورهم، ومن غير عمود اللوحة", () => {
    expect(pasteColumnsOf([WALLET_LIKE, GROUP]))
      .toEqual(["ASTUNIQUE", "Company", "CHASISNUM", "نوع السياره", "اسم الشارع", "تاريخ التسجيل", "الحي", "المسجل"]);
  });

  it("عمود اسمه متكرر في المصدرين بيظهر مرة واحدة", () => {
    const a = { "رقم اللوحة": "ابج1234", "الحي": "الملز" };
    const b = { "Plate Number": "ABC 1234", "الحي": "العليا" };
    expect(pasteColumnsOf([a, b])).toEqual(["الحي"]);
  });

  it("مفيش نتيجة ⇒ مفيش أعمدة", () => {
    expect(pasteColumnsOf([])).toEqual([]);
  });
});

describe("توصيل أعمدة اللصق", () => {
  const code = readFileSync(join(process.cwd(), "app", "(app)", "sorting", "page.tsx"), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

  it("🔴 صفحة الفرز بتاخد أعمدة اللصق من الصفوف المطابقة", () => {
    expect(code).toMatch(/pasteColumnsOf\(/);
    // الشكل القديم: هيدرز الملف الأساسي بس
    expect(code).not.toMatch(/const pasteAllCols = dataTable \? dataTable\.headers/);
  });
});
