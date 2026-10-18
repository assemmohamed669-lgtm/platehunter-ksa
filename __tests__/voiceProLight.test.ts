/**
 * 🪶 Voice PRO «خفيف» مع الجداول الكبيرة (١٨ أكتوبر ٢٠٢٦).
 *
 * الصندوق الأسود (مندوب آيفون): Voice PRO بجدول ~١٬٨٠٠ لوحة + ملف تشييك ٤٩ ألف ⇒ الشاشة بتعلّق ٦–٧ث
 * كل ~٩ث (مرة ٤٤ث) وiOS بيقفل البرنامج ٣ مرات في ربع ساعة ⇒ بيفتح من الأول ويرجع «يدوي». ولما الجدول
 * اتفضّى: ٣٠ دقيقة و٢٠٧ لوحة من غير ولا تعليقة. المالك: «يلا ابدأ».
 * التقيل:
 *  · كل صف فيه منسدلتين (~٤٠ اختيار) ⇒ ١٤٤ ألف عنصر بيتعاد رسمهم مع كل تحديث (الموقع كل ثانية).
 *  · «اتسمعت وماظهرتش» = كل قراية × كل لوحة (~٧٢٠ ألف مقارنة) مع كل نافذة — والنتيجة للسوبر أدمن بس.
 *  · حفظ الجدول كله مع كل تغيير.
 * التصليح للسوبر أدمن + المندوب اللي في قايمة الصندوق الأسود الأول (`VOICEPRO_LIGHT_FOR_ALL`)؛ غيرهم زي ما هم بالحرف.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCoalescedSaver } from "@/lib/coalescedSave";

const SRC = readFileSync(join(__dirname, "..", "app", "(app)", "registration-v2", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("createCoalescedSaver — الحفظ بيتجمّع ومابيضيّعش آخر نسخة", () => {
  it("كذا تغيير والحفظ لسه شغّال ⇒ حفظة واحدة كمان بآخر نسخة بس", async () => {
    const saved: number[] = [];
    let release: () => void = () => {};
    const save = vi.fn((v: number) => {
      saved.push(v);
      return new Promise<void>((r) => { release = r; });
    });
    const s = createCoalescedSaver(save);
    s(1); s(2); s(3); s(4);
    expect(saved).toEqual([1]);           // واحدة شغّالة
    release(); for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(saved).toEqual([1, 4]);        // آخر نسخة بس — ٢ و٣ اتجمّعوا فيها
    release(); for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("الحفظ فشل ⇒ اللي بعده بيتحفظ عادي (مابيقفش)", async () => {
    const saved: number[] = [];
    const s = createCoalescedSaver((v: number) => { saved.push(v); return v === 1 ? Promise.reject(new Error("x")) : Promise.resolve(); });
    s(1); s(2);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(saved).toEqual([1, 2]);
  });
});

describe("Voice PRO — التوصيل", () => {
  it("شغّال للسوبر أدمن + المندوب اللي في قايمة الصندوق بس (والكل لما المفتاح يتفتح)", () => {
    expect(readFileSync(join(__dirname, "..", "lib", "voiceProLight.ts"), "utf8")).toMatch(/export const VOICEPRO_LIGHT_FOR_ALL = true;/);
    expect(SRC).toMatch(/const lightOn = VOICEPRO_LIGHT_FOR_ALL \|\| isSuper \|\| diagEnabledFor\(meId\);/);
  });

  it("الجدول بيرسم آخر ٢٠٠ لوحة بس (وزرار «اعرض الكل») — غير كده كله زي الأول", () => {
    expect(SRC).toMatch(/const tableRows = lightOn && !showAllRows && rows\.length > LIGHT_TABLE_ROWS \? rows\.slice\(0, LIGHT_TABLE_ROWS\) : rows;/);
    expect(SRC).toMatch(/\{tableRows\.flatMap\(\(r, i\) => \{/);
    expect(SRC).toMatch(/اعرض كل اللوحات/);
  });

  it("«اتسمعت وماظهرتش» بيتحسب لو حد هيشوفه بس — والتقرير بيحسبه وقتها", () => {
    expect(SRC).toMatch(/const lostNeeded = !lightOn \|\| \(isSuper && showReport\);/);
    expect(SRC).toMatch(/lostNeeded \? \{ missed: heardNotShown\(reads, rows\), lost: blockedNotShown\(reads, rows\) \} : NO_LOST/);
    const rep = SRC.slice(SRC.indexOf("function buildReportText"), SRC.indexOf("function buildReportText") + 4000);
    expect(rep).toMatch(/const lostNow = lostNeeded \? superLost : \{ missed: heardNotShown\(reads, rows\), lost: blockedNotShown\(reads, rows\) \};/);
  });

  it("الحفظ بيتجمّع في الخفيف — والقديم زي ما هو بالحرف للباقيين", () => {
    expect(SRC).toMatch(/if \(lightOnRef\.current\) saveRowsDraftCoalesced\(full\);\s*else void saveDraft\("trial", "rv2-rows", full\);/);
  });

  it("تنبيه لما الجدول يعدّي ٣٠٠ لوحة", () => {
    expect(SRC).toMatch(/lightOn && rows\.length > LIGHT_WARN_ROWS && \(/);
  });
});
