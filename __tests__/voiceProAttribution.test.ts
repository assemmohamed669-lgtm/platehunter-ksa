import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🔴 المالك (٢٤ سبتمبر): «اللوحات بتاع كل مندوب تروح لاسمه… مش عايز أي غلط حتى لو صغير».
 * حارس على نص صفحة Voice PRO — كل حلقة في السلسلة من اللوحة لحد السيرفر:
 *   ختم الحساب على كل لوحة · إخفاء لوحات الحسابات التانية (من غير مسح) · مفيش تصدير
 *   من غير حساب · معرّف فريد (حساب + وقت الظهور) · التصدير يرفض لوحة حساب تاني.
 * للكل — المالك جرّبه كسوبر أدمن وقال «يلا ارفع» (٢٤ سبتمبر).
 */
const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8");
const exportFn = src.slice(src.indexOf("async function exportRowsInner()"), src.indexOf("function buildReportText()"));

describe("🔴 Voice PRO — كل لوحة لاسم صاحبها", () => {
  it("كل لوحة جديدة (المؤكّدة والمبدئية) بتتختم بحساب المندوب", () => {
    expect(src.match(/agentId: agentRef\.current,/g)?.length).toBe(2);
    expect(src).toMatch(/agentRef\.current = userId;/);
  });
  it("لوحات الحسابات التانية بتتخبّى وقت فتح الصفحة وقت تحميل المسودّة", () => {
    expect(src.match(/splitByAgent\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("🔴 المستخبية بتتحفظ مع الظاهرة — مابتضيعش لما المندوب التاني يمسح أو يصدّر", () => {
    expect(src).toMatch(/saveDraft\("trial", "rv2-rows", stripForDraft\(\[\.\.\.rows, \.\.\.othersRef\.current\]\)\)/);
  });
  it("🔴 مفيش تصدير من غير حساب", () => {
    const guard = exportFn.indexOf("if (!uid)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(exportFn.indexOf("saveFieldCheckEntry"));
  });
  it("☁️ اللي مستني بيترفع أول ما الصفحة تفتح وأول ما النت يرجع (مش بس وقت التصدير)", () => {
    expect(src).toMatch(/pushPendingFieldChecks\(userId as string\)/);
    expect(src).toMatch(/addEventListener\("online", onOnline\)/);
  });
  it("🔴 المعرّف فريد (حساب + وقت الظهور) والتصدير بيرفض لوحة حساب تاني", () => {
    expect(exportFn).toMatch(/trialEntryId\(r, uid\)/);
    expect(exportFn).toMatch(/const mineReady = ready\.filter\(\(r\) => isMine\(r, uid\)\);/);
    expect(exportFn).not.toMatch(/legacyTrialEntryId/);
    expect(exportFn).toMatch(/mineReady\.map\(/);
    expect(exportFn).toMatch(/mineReady\.filter\(\(r\) => okIds\.includes\(entryId\(r\)\)\)/);
  });
});
