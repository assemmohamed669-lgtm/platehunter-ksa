import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ⚡ «الجديد» — التصدير أسرع زي «صوتي» (المالك، ٢٤ سبتمبر): الهوية من الموبايل
 * (`getSession`) مش من السيرفر (`getUser`)، والرفع للسيرفر في الخلفية بعد الحفظ
 * بدل ما المندوب يستناه. 🔒 السوبر أدمن بس لحد ما المالك يجرّب.
 * حارس على نص الصفحة — الدالة جوّه مكوّن كبير مالهاش مدخل تاني.
 */
const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8");
const fn = src.slice(src.indexOf("async function exportRowsInner()"), src.indexOf("function buildReportText()"));

describe("⚡ تصدير «الجديد» السريع (السوبر أدمن)", () => {
  it("الدالة اتلقت (الحارس بيقيس المكان الصح)", () => {
    expect(fn.length).toBeGreaterThan(500);
    expect(fn).toContain("saveFieldCheckEntry");
  });
  it("🔴 الهوية للسوبر أدمن من الموبايل (getSession) — مش نداء للسيرفر", () => {
    expect(fn).toMatch(/isSuper\s*\?\s*await supabase\.auth\.getSession\(\)/);
  });
  it("🔴 الرفع للسيرفر للسوبر أدمن في الخلفية (void) — مش مستنّي قبل رسالة «تم»", () => {
    const branch = fn.slice(fn.indexOf("if (isSuper) {", fn.indexOf("☁️")), fn.indexOf("} else {", fn.indexOf("☁️")));
    expect(branch).toContain("void import(\"@/lib/syncFieldCheck\")");
    expect(branch).not.toMatch(/await pushPendingFieldChecks/);
  });
  it("باقي المناديب: زي ما كان بالحرف (getUser + مستنّي الرفع)", () => {
    expect(fn).toMatch(/: await supabase\.auth\.getUser\(\)/);
    expect(fn.slice(fn.indexOf("} else {", fn.indexOf("☁️")))).toMatch(/await pushPendingFieldChecks\(uid\)/);
  });
});
