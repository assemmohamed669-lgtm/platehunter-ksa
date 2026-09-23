import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس مصدر — **صف اللوحة المطلوبة عمره ما يتمسح.**
 *
 * الخلفية: `wantedExact` بيحمي اللوحة **الواردة** بس. التوأم **الموجود**
 * مكانش بيتشيّك على `checkIndex` خالص، فصف لوحة مطلوبة بتطابق تام — صفّارته
 * ضربت و`group_finds` اتكتب والإشعار راح لكل الفريق — كان ممكن يتمسح بقراءة
 * ترفرف غير مطلوبة ثقتها أعلى. الفريق بيتبلّغ والمندوب مايلاقيش صف يصدّره،
 * **بلا أي مسار تراجع**. ونفس الشيء لصف **اتصدّر** خلاص: بيتمسح من الصفحة
 * بينما `fc-ptt-<id>` بيفضل في شيت السجلات بلا صف يقابله.
 *
 * الاختبار ده بيقرا المصدر مباشرةً لأن المنطق جوّه مكوّن React كبير ومربوط
 * بحالة، فمافيش دالة نقية نستدعيها. لو اتنقل لملف نقي بعدين، الاختبار ده
 * يتشال ويتعوّض باختبار وحدة حقيقي.
 */
describe("حارس التوأم — المطلوبة والمصدَّرة ماينفعش يتمسحوا", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  // نقصّ اللوب بتاع حارس التوأم بالظبط — من بداية اللوب لحد `break` الأخير.
  const start = src.indexOf("for (const [k, v] of seen) {");
  const end = src.indexOf("const isComplete =", start);

  it("اللوب بتاع الحارس لسه موجود في المصدر", () => {
    // لو ده فشل، الاختبار كله بيبقى بيقيس حتة غلط — لازم يتصلّح مش يتشال.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  const loop = src.slice(start, end);

  it("🔴 بيتخطّى أي توأم لوحته في ملف التشييك (مطلوبة بتطابق تام)", () => {
    expect(loop).toContain("checkIndex.has(k)");
  });

  it("🔴 بيتخطّى أي توأم صفّه اتصدّر خلاص", () => {
    expect(loop).toContain("pttExportedIdsRef.current.has(v.id)");
  });

  it("الاتنين بيعملوا `continue` قبل ما `areTwins` يتحسب أصلاً", () => {
    const iCheck = loop.indexOf("checkIndex.has(k)");
    const iExported = loop.indexOf("pttExportedIdsRef.current.has(v.id)");
    const iTwins = loop.indexOf("areTwins(");
    expect(iCheck).toBeGreaterThan(-1);
    expect(iExported).toBeGreaterThan(-1);
    expect(iTwins).toBeGreaterThan(-1);
    expect(iCheck).toBeLessThan(iTwins);
    expect(iExported).toBeLessThan(iTwins);
  });

  it("مسار المسح لسه موجود (مش اتشال بالغلط) — الحارس بيقيّده مش بيلغيه", () => {
    expect(loop).toContain("drop-twin");
    expect(loop).toContain("prev.filter");
  });
});

describe("قراءة النطق الطويل ماتترميش في صمت", () => {
  const src = readFileSync(join(process.cwd(), "lib", "voicexEngine.ts"), "utf8")
    .replace(/\r\n/g, "\n");

  it("🔴 النطق الأطول من الحد بيتبلّغ بـonSkip بدل `return` أخرس", () => {
    expect(src).toContain('opts.onSkip?.("utterance_too_long")');
  });

  it("🔴 والنطق الأقصر من الحد كمان", () => {
    expect(src).toContain('opts.onSkip?.("utterance_too_short")');
  });

  it("⚠️ الحدود نفسها ماتغيّرتش — تغييرها بيغيّر اللي الموديل بيسمعه", () => {
    expect(src).toContain("dur < 0.6");
    expect(src).toContain("dur > 6");
  });
});
