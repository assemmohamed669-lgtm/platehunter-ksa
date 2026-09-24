import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ⚡ «الجديد» — التصدير أسرع زي «صوتي» (المالك، ٢٤ سبتمبر): الهوية من الموبايل
 * (`getSession`) مش من السيرفر (`getUser`)، والرفع للسيرفر في الخلفية بعد الحفظ
 * بدل ما المندوب يستناه. للكل بعد تجربة المالك.
 * حارس على نص الصفحة — الدالة جوّه مكوّن كبير مالهاش مدخل تاني.
 */
const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8");
const fn = src.slice(src.indexOf("async function exportRowsInner()"), src.indexOf("function buildReportText()"));

describe("⚡ تصدير «الجديد» السريع (للكل)", () => {
  it("الدالة اتلقت (الحارس بيقيس المكان الصح)", () => {
    expect(fn.length).toBeGreaterThan(500);
    expect(fn).toContain("saveFieldCheckEntry");
  });
  it("🔴 الهوية من الموبايل (getSession) — مش نداء للسيرفر (getUser)", () => {
    expect(fn).toMatch(/await supabase\.auth\.getSession\(\)/);
    expect(fn).not.toMatch(/auth\.getUser\(\)/);
  });
  it("🔴 الرفع للسيرفر في الخلفية (void) — مش مستنّي قبل رسالة «تم»", () => {
    expect(fn).toContain('void import("@/lib/syncFieldCheck")');
    expect(fn).not.toMatch(/await pushPendingFieldChecks/);
  });
});
