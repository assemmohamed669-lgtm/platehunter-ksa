import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { savedExtraDataSlot } from "@/lib/extraDataSlot";

/**
 * ✏️ «تعديل» لكل مربع داتا لوحده — المالك (١٨ أكتوبر ٢٠٢٦): «لما بيفتح داتا اضافيه وحابب يعدل فيها لازم يفتح الداتا الاول
 * علشان يعدل فيها ف عايز كل واحده تبقي خاصه ب مربعها والتعديل فيها ل وحدها».
 * السبب: الملفات الإضافية بتتحفظ مرصوصة (المربع الفاضي بيتخطّى) والزرار كان بيحسب رقمه من مكان المربع في الشاشة ⇒
 * مابيلاقيش الملف ⇒ صفحة التعديل كانت بتفتح الداتا الأساسية.
 */
const F = { table: {}, file: {} };
const E = { table: null, file: null };

describe("🔴 رقم الملف المحفوظ لكل مربع إضافي", () => {
  it("مربع فاضي قبله ⇒ نفس الرقم اللي اتحفظ بيه (data-2 مش data-3)", () => {
    expect(savedExtraDataSlot([E, F], 1)).toBe("data-2");
  });
  it("مربعات مليانة ورا بعض ⇒ data-2 ، data-3", () => {
    expect(savedExtraDataSlot([F, F], 0)).toBe("data-2");
    expect(savedExtraDataSlot([F, F], 1)).toBe("data-3");
    expect(savedExtraDataSlot([F, E, F], 2)).toBe("data-3");
  });
  it("المربع نفسه فاضي ⇒ مفيش ملف يتعدّل", () => {
    expect(savedExtraDataSlot([F, E], 1)).toBeNull();
    expect(savedExtraDataSlot([{ table: {}, file: null }], 0)).toBeNull();
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("زرار «تعديل» تحت المربع الإضافي بيفتح ملف المربع ده بالظبط", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(s).toMatch(/<DataEditLink slot=\{savedExtraDataSlot\(extraData, i\) \?\? ""\} show=\{!!savedExtraDataSlot\(extraData, i\)\} label=\{`داتا إضافية \$\{i \+ 2\}`\} \/>/);
    expect(s).toMatch(/<DataEditLink slot="data" show=\{!!dataTable\} label="الداتا الأساسية" \/>/);
  });
  it("صفحة التعديل بتفضل على ملف المربع ده لوحده — ولو مش موجود بتقول بدل ما تفتح ملف تاني", () => {
    const p = read("app/(app)/data-edit/page.tsx");
    expect(p).toMatch(/files && files\.length > 1 && !boxSlot && \(/);
    expect(p).toMatch(/الملف بتاع المربع ده مش موجود/);
    expect(p).not.toMatch(/setFileIdx\(i >= 0 \? i : 0\)/);
  });
});
