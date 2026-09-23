import { describe, it, expect } from "vitest";
import { LiveConsensus, drainClockMs } from "../lib/liveConsensus";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ساعة التصريف — الإجماع مكانش بيتجمّع أصلاً
 * ══════════════════════════════════════════════════════════════════════
 *  من تقارير المالك الأربعة: **كل** صف مكتوب عليه «١ نافذة» رغم إن القراءات
 *  الخام بتوري نفس اللوحة في ٢-٣ نوافذ.
 *
 *  🔴 السبب: `stableMs` بيتقارن بـ**زمن النطق** (`tMs` = مركز النافذة)، بينما
 *  `drain()` كان بيتنده بـ**زمن الحائط** (`mic.elapsedSec`). والقراءة بتوصل
 *  بعد نطقها بـ~٣.٥ث (نص النافذة + الشبكة)، فالعنقود بيبان «مستقر» وهو لسه
 *  بيتولد ⇒ كل قراءة بتتصرّف لوحدها بـ`mult = 1`.
 *
 *  والأثر مش تجميلي: `greenMinMult: 2` بقى **ميت**، وحاجز الاختراع على
 *  القراءة المفردة بقى بيحكم كل حاجة — وده اللي خلّى حجب واحد يضيّع لوحات
 *  صح (`حطو6826` · `اسط4324`).
 *
 *  الحل: `drainClockMs` — بيرجّع الساعة نص نافذة لورا فتبقى في نفس التوقيت.
 */

const OPTS = { windowMs: 2000, stableMs: 2500, greenMinMult: 2 };
const WIN_S = 5;
/** الوصول الحقيقي: نهاية النافذة (tMs + نص نافذة) + ~١ث شبكة */
const arrivalOf = (tMs: number) => tMs + (WIN_S * 1000) / 2 + 1000;

function replay(reads: Array<[string, number]>, useFix: boolean) {
  const c = new LiveConsensus(OPTS);
  let i = 0;
  const out: Array<{ plate: string; mult: number }> = [];
  for (let now = 0; now <= 30000; now += 500) {
    while (i < reads.length && arrivalOf(reads[i][1]) <= now) {
      c.add({ plate: reads[i][0], tMs: reads[i][1], conf: 0.99, minLp: -0.02 });
      i++;
    }
    for (const cm of c.drain(useFix ? drainClockMs(now, WIN_S) : now)) out.push({ plate: cm.plate, mult: cm.mult });
  }
  for (const cm of c.flush()) out.push({ plate: cm.plate, mult: cm.mult });
  return out;
}

/** من سجل المالك: `بطد8766` في تلات نوافذ متتالية */
const SAME: Array<[string, number]> = [["بطد8766", 1500], ["بطد8766", 2300], ["بطد8766", 3500]];

describe("drainClockMs — الساعة لازم تبقى بتوقيت النطق", () => {
  /**
   * ⚠️ **العقد اتغيّر (٢٣ سبتمبر ٢٠٢٦) والسبب هنا:**
   *
   * كان الإجماع بيرجّع اللوحة **مرة واحدة بس** بعد ما تهدا تماماً. وده
   * كان بيأخّر الظهور، لأن كل قراءة متكرّرة بتجدّد الانتظار.
   *
   * دلوقتي بيأكّد بدري عند **الاستقرار**، وأي قراءة توصل بعدين بترجّع
   * **تحديث لنفس اللوحة** (الصفحة بتلمّه على نفس الصف). فبقى ممكن يرجّع
   * أكتر من مرة — بس **كلها نفس اللوحة** والأخيرة بأقوى تأكيد.
   *
   * اللي الاختبار ده بيحميه لسه كما هو: **مايبقاش فيه تلات لوحات
   * منفصلة كلها mult=1** (وده اللي كان بيحصل من غير ساعة التصريف).
   */
  it("🔴 من غير الإصلاح: **أول تأكيد سابق لأوانه** (نافذة واحدة)", () => {
    const out = replay(SAME, false);
    // الساعة الخام بتقفل العنقود قبل ما النافذة التانية توصل أصلاً
    expect(out[0].mult).toBe(1);
  });

  it("✅ بالإصلاح: لوحة واحدة، وآخر تأكيد mult=3", () => {
    const out = replay(SAME, true);
    expect(out.length).toBeGreaterThan(0);
    // كلها نفس اللوحة — مش تلات لوحات منفصلة
    expect(new Set(out.map((o) => o.plate))).toEqual(new Set(["بطد8766"]));
    // وآخر تأكيد شايف كل القراءات
    expect(out[out.length - 1].mult).toBe(3);
  });

  it("لوحتين مختلفتين تفضلوا منفصلين", () => {
    const out = replay([["بطد8766", 1500], ["بطد8766", 2300], ["دعن3477", 5000], ["دعن3477", 6500]], true);
    expect(out.map((o) => o.plate).sort()).toEqual(["بطد8766", "دعن3477"]);
    expect(out.every((o) => o.mult === 2)).toBe(true);
  });

  it("الدالة نفسها: بترجّع نص النافذة لورا", () => {
    expect(drainClockMs(10000, 5)).toBe(7500);
    expect(drainClockMs(0, 5)).toBe(-2500);
  });
});
