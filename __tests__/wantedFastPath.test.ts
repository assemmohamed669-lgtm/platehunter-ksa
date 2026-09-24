import { describe, it, expect } from "vitest";
import { wantedHits, shouldAlertNow, keepProvisional, sweepKeeps, confirmWanted, wantedReadCount, WANTED_CONFIRM_SPAN_MS, WANTED_REALERT_MS } from "../lib/wantedFastPath";

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

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 اللوحة المبدئية من جلسة فاتت عمرها ما تتكنس
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «اللوحات اللي اتقالت متتمسحش أبداً وتفضل
 *  محفوظة حتى لو المكالمة فصلت المايك».
 *
 *  المكالمة بتقطع التسجيل ⇒ لوحة مبدئية ماجالهاش تأكيد بتفضل مبدئية. أول ما
 *  المندوب يبدأ تسجيل تاني، الكنس (١٢ث) كان بيشوفها «قديمة» ويمسحها في أول
 *  ثانيتين. الكنس بقى على **الجلسة الحالية بس**.
 */
describe("sweepKeeps — الكنس على الجلسة الحالية بس", () => {
  const base = { provisional: true, match: null as Record<string, string> | null };

  it("مبدئية من جلسة فاتت ⇒ بتفضل مهما كانت قديمة", () => {
    expect(sweepKeeps({ ...base, shownAt: 1_000 }, 999_999, 500_000)).toBe(true);
  });

  it("مبدئية من الجلسة الحالية وعدّت المهلة ⇒ بتتشال (زي الأول)", () => {
    expect(sweepKeeps({ ...base, shownAt: 600_000 }, 700_000, 500_000)).toBe(false);
  });

  it("مبدئية من الجلسة الحالية ولسه في المهلة ⇒ بتفضل", () => {
    expect(sweepKeeps({ ...base, shownAt: 750_000 }, 700_000, 500_000)).toBe(true);
  });

  it("المؤكّدة والمطلوبة ⇒ بيفضلوا دايماً", () => {
    expect(sweepKeeps({ ...base, provisional: false, shownAt: 600_000 }, 700_000, 500_000)).toBe(true);
    expect(sweepKeeps({ ...base, match: { a: "b" }, shownAt: 600_000 }, 700_000, 500_000)).toBe(true);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔔 «المطلوبة» والصفّارة **بعد التأكد** — مش من أول قراية
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٥ سبتمبر ٢٠٢٦): «أنا عايزه يظهر بعد التأكد من اللوحة، مش يطلع
 *  بعد القراية المباشرة اللي قبل التعديل». الحالة: «رلم6146» (مش في الشيت)
 *  اتسمعت **مرة** «رلم6113» (في الشيت) ⇒ صفّارة غلط.
 *
 *  التأكيد = نفس اللوحة المطلوبة **بالظبط** في **نافذتين مختلفتين** — نفس معيار
 *  🟢 «مؤكّدة» في الإجماع (`greenMinMult: 2`)، بس من غير ما نستنى الإجماع يخلص
 *  (كان ~٦ث، والمالك اشتكى منه قبل كده). النافذة بتتكرر كل ١.٥ث فاللوحة
 *  المقولة بتتسمع ~٣ مرات ⇒ التأكيد بييجي ~١.٥ث بعد أول قراية.
 */
describe("confirmWanted — نافذتين بنفس اللوحة", () => {
  it("🔴 قراية واحدة ⇒ لأ (دي حالة رلم6113 بالظبط)", () => {
    const seen = new Map<string, number[]>();
    expect(confirmWanted(seen, "رلم6113", 10_000)).toBe(false);
  });

  it("نافذة تانية بنفس اللوحة ⇒ أيوه", () => {
    const seen = new Map<string, number[]>();
    confirmWanted(seen, "ابح1234", 10_000);
    expect(confirmWanted(seen, "ابح1234", 11_500)).toBe(true);
  });

  it("نفس النافذة اتبعتت تاني (استرجاع بعد وقعة الشبكة) ⇒ مش تأكيد — نفس الصوت", () => {
    const seen = new Map<string, number[]>();
    confirmWanted(seen, "ابح1234", 10_000);
    expect(confirmWanted(seen, "ابح1234", 10_000)).toBe(false);
  });

  it("القراية التانية بعيدة زمنياً (عربية تانية بنفس الرقم بعد شوية) ⇒ مش تأكيد للأولى", () => {
    const seen = new Map<string, number[]>();
    confirmWanted(seen, "ابح1234", 10_000);
    expect(confirmWanted(seen, "ابح1234", 10_000 + WANTED_CONFIRM_SPAN_MS + 1)).toBe(false);
    expect(confirmWanted(seen, "ابح1234", 10_000 + WANTED_CONFIRM_SPAN_MS + 1500)).toBe(true);
  });

  it("لوحتين مختلفتين مابيأكّدوش بعض", () => {
    const seen = new Map<string, number[]>();
    confirmWanted(seen, "رلم6113", 10_000);
    expect(confirmWanted(seen, "رلم6146", 11_500)).toBe(false);
  });

  it("wantedReadCount — عدد النوافذ اللي سمعتها جوّه المدى (للإجماع)", () => {
    const seen = new Map<string, number[]>();
    expect(wantedReadCount(seen, "ابح1234", 10_000)).toBe(0);
    confirmWanted(seen, "ابح1234", 10_000);
    confirmWanted(seen, "ابح1234", 11_500);
    expect(wantedReadCount(seen, "ابح1234", 12_000)).toBe(2);
    expect(wantedReadCount(seen, "ابح1234", 12_000 + WANTED_CONFIRM_SPAN_MS * 2)).toBe(0);
  });
});
