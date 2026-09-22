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
  it("🔴 من غير الإصلاح: تلات قراءات = تلات صفوف كلها mult=1", () => {
    const out = replay(SAME, false);
    expect(out).toHaveLength(3);
    expect(out.every((o) => o.mult === 1)).toBe(true);
  });

  it("✅ بالإصلاح: تلات قراءات = صف واحد mult=3", () => {
    const out = replay(SAME, true);
    expect(out).toHaveLength(1);
    expect(out[0].plate).toBe("بطد8766");
    expect(out[0].mult).toBe(3);
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
