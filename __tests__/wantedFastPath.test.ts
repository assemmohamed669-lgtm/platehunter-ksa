import { describe, it, expect } from "vitest";
import { wantedHits, shouldAlertNow, keepProvisional, WANTED_REALERT_MS } from "../lib/wantedFastPath";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 «السيارة المطلوبة بتأخر ٦ ثواني» — الصفّارة من **أول قراية**
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «السيارة المطلوبة بتأخر في ظهورها جداً، بتقعد
 *  ٦ ثواني على ما تظهر. عايزك تخلّي عملية التشييك على السيارة في الشيت، ولما
 *  تكون متطابقة تطابق تام تظهر بسرعة، الصفّارة متأخرش أبداً».
 *
 *  🔴 **السبب**: أول سطر في معالجة القراية كان `if (!showProvisional(r))
 *  return;` — يعني القراية لازم ثقتها ≥٩٠٪ ومش محجوبة عشان الصفّارة تضرب.
 *  لو أول قراية للعربية المطلوبة أقل من كده، الصفّارة بتستنى **الإجماع**
 *  (٢.٥ث استقرار + نوافذ) ⇒ الـ٦ ثواني.
 *
 *  ⇒ الشيت بيتفحص على **كل قراية قبل أي بوابة**. تطابق تام ⇒ صفّارة فوراً.
 *
 *  ⚠️ **ليه ده مش هيطلّع صفّارات غلط**: العربية الغلط لازم تطابق **بالحرف**
 *     لوحة من الـ٤٩ ألف اللي في الشيت — من ~٢٢٠ مليون لوحة ممكنة = **٠.٠٢٪**.
 *     وصفّارة زيادة أرخص بكتير من عربية مطلوبة تعدّي.
 */
const idx = new Map<string, Record<string, string>>([
  ["ابح1234", { "اللوحة": "ابح1234", "البنك": "الأهلي" }],
]);
const norm = (p: string) => p.replace(/[أإآ]/g, "ا");
const read = (plate: string, over: Record<string, unknown> = {}) =>
  ({ plate, accepted: true, blocked: false, conf: 0.99, ...over });

describe("wantedHits — التطابق التام من القراية الخام", () => {
  it("🔴 **ثقة ٧٠٪** (كانت بتستنى الإجماع) ⇒ تطابق فوراً", () => {
    const out = wantedHits(read("ابح1234", { conf: 0.7 }), idx, norm);
    expect(out).toHaveLength(1);
    expect(out[0].plate).toBe("ابح1234");
    expect(out[0].row["البنك"]).toBe("الأهلي");
  });

  it("التطبيع زي الفهرس بالظبط (أ ⇒ ا)", () => {
    expect(wantedHits(read("أبح1234"), idx, norm)).toHaveLength(1);
  });

  it("قراية فيها لوحتين ⇒ بتلاقي المطلوبة منهم", () => {
    const out = wantedHits(read("دطس2177 ابح1234"), idx, norm);
    expect(out.map((h) => h.plate)).toEqual(["ابح1234"]);
  });

  it("🔴 **تطابق تام بس** — رقم مختلف مايطابقش", () => {
    expect(wantedHits(read("ابح1235"), idx, norm)).toEqual([]);
  });

  it("🔴 المحجوبة بثقة عالية (≥٨٦٪) ⇒ بتصفّر — `اوه1552` ضاعت كده", () => {
    expect(wantedHits(read("ابح1234", { accepted: false, blocked: true, conf: 0.91 }), idx, norm))
      .toHaveLength(1);
  });

  it("المحجوبة بثقة واطية ⇒ لأ (اختراع من ضجيج)", () => {
    expect(wantedHits(read("ابح1234", { accepted: false, blocked: true, conf: 0.5 }), idx, norm))
      .toEqual([]);
  });

  it("السيرفر رفضها (مش محجوبة، مش مقبولة) ⇒ لأ", () => {
    expect(wantedHits(read("ابح1234", { accepted: false, blocked: false }), idx, norm)).toEqual([]);
  });

  it("الشكل مش لوحة ⇒ لأ", () => {
    expect(wantedHits(read("ابح12"), idx, norm)).toEqual([]);
  });
});

describe("shouldAlertNow — 🔴 الصفّارة مرة واحدة لكل عربية", () => {
  /**
   * الطابور بيمنع التكرار **طول ما اللوحة في الطابور بس**. لو المندوب داس
   * «تم» والإجماع أكّد العربية بعدها، **الصفّارة كانت بتضرب تاني** لنفس
   * العربية — ومع الفحص على كل قراية كانت هتضرب ٣-٤ مرات.
   */
  it("أول مرة ⇒ تصفّر", () => {
    expect(shouldAlertNow(new Map(), "ابح1234", 1000)).toBe(true);
  });

  it("🔴 نفس العربية في نفس الدقيقة ⇒ **لأ**", () => {
    const m = new Map([["ابح1234", 1000]]);
    expect(shouldAlertNow(m, "ابح1234", 1000 + WANTED_REALERT_MS - 1)).toBe(false);
  });

  it("بعد الدقيقة ⇒ تصفّر تاني (مرّ عليها تاني = شافها تاني)", () => {
    const m = new Map([["ابح1234", 1000]]);
    expect(shouldAlertNow(m, "ابح1234", 1000 + WANTED_REALERT_MS)).toBe(true);
  });

  it("عربية تانية ⇒ تصفّر", () => {
    const m = new Map([["ابح1234", 1000]]);
    expect(shouldAlertNow(m, "دطس2177", 1500)).toBe(true);
  });
});

describe("keepProvisional — 🔴 المطلوبة مابتتكنسش", () => {
  /**
   * المبدئي اللي ماحدش أكّده خلال ١٢ث بيتشال (كان اختراع). بس العربية
   * **المطلوبة** لو اتشالت والمندوب واقف قدامها = كارثة: الصفّارة ضربت
   * والصف اختفى، ومش هتتصدّر.
   */
  const cut = 10_000;
  it("مبدئي عادي قديم ⇒ يتكنس", () => {
    expect(keepProvisional({ provisional: true, shownAt: 5_000, match: null }, cut)).toBe(false);
  });
  it("🔴 مبدئي **مطلوب** قديم ⇒ يفضل", () => {
    expect(keepProvisional({ provisional: true, shownAt: 5_000, match: { a: "b" } }, cut)).toBe(true);
  });
  it("مبدئي جديد ⇒ يفضل", () => {
    expect(keepProvisional({ provisional: true, shownAt: 15_000, match: null }, cut)).toBe(true);
  });
  it("مؤكّد ⇒ يفضل دايماً", () => {
    expect(keepProvisional({ provisional: false, shownAt: 1, match: null }, cut)).toBe(true);
  });
});
