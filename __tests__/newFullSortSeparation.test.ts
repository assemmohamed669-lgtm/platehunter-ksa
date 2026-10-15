import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🆕 الجديد والكلي مايتلخبطوش (المالك ١٥ أكتوبر ٢٠٢٦: «الجديد والكلي زي بعض … لازم يفرز مرتين او تلاته … عايز حل نهائي»).
 * ① التبديل وهو بيفرز كان بيخلّي نتيجة الكلي تنزل في تاب الجديد (أو العكس).
 * ② نتيجة «الجديد» المحفوظة كانت بتفضل تتعرض بعد ما ملف التشييك اتغيّر.
 */
const S = readFileSync(path.resolve(__dirname, "..", "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("🔴 التبديل بين «جديد» و«كلي» وهو بيفرز", () => {
  it("الزرارين مقفولين لحد ما الفرز يخلص", () => {
    expect(S).toMatch(/onClick=\{\(\) => switchMode\("new"\)\} disabled=\{sorting\}/);
    expect(S).toMatch(/onClick=\{\(\) => switchMode\("full"\)\} disabled=\{sorting\}/);
    expect(S).toMatch(/if \(target === sortMode \|\| sorting\) return;/);
  });
  it("نتيجة كل فرز بتنزل على الشاشة بس لو التاب بتاعها هو المفتوح", () => {
    expect(S).toMatch(/const onScreen = resultBelongsOnScreen\("full", sortModeRef\.current\);\n\s+if \(onScreen\) \{/);
    expect(S).toMatch(/const onScreen = resultBelongsOnScreen\("new", sortModeRef\.current\);\n\s+if \(onScreen\) \{/);
  });
});

describe("🔴 «الجديد» = المحفظة ناقص التشييك الحالي", () => {
  it("بيقسم المحفظة بالتشييك وبيحفظ بصمة ملفات التشييك مع النتيجة", () => {
    expect(S).toMatch(/splitReferralByCheck\(collectReferralEntries\(collectRefSources\(\)\), checkSet\)/);
    expect(S).toMatch(/checkSig: checkSourcesSignature\(checkSources\)/);
  });
  it("النتيجة المحفوظة بتتشال لو ملف التشييك اتغيّر (فتح الصفحة · تغيير الملف · الرجوع للتاب)", () => {
    expect((S.match(/void dropStaleNewCache\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("المندوب بيشوف كام لوحة من المحفظة موجودة في التشييك", () => {
    expect(S).toMatch(/موجودة في التشييك/);
  });
});
