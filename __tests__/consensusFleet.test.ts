import { describe, it, expect } from "vitest";
import { LiveConsensus, type PlateRead } from "@/lib/liveConsensus";
import { FleetMemory } from "@/lib/fleetPairs";
import { addWindowReads } from "@/lib/liveConsensus";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🚚 الإجماع والأسطول المتسلسل — «حبل1234 حبل1235 حبل1236»
 * ══════════════════════════════════════════════════════════════════════
 *  الإجماع بيحط الإملاءات اللي فرقها خانة واحدة في **مجموعة واحدة** (ضجيج
 *  نافذة لنفس النطق) ويطلّع واحدة بس — فالأسطول المتسلسل بيطلع لوحة واحدة.
 *  مع دليل النافذة الواحدة (`FleetMemory`) كل عربية مؤكّدة بتطلع لوحدها.
 */
const OPTS = { windowMs: 2000, stableMs: 2500, greenMinMult: 2 };

/** نافذة واحدة سمعت اللوحات دي — **نفس دالة المحرّك** (`addWindowReads`). */
function feed(lc: LiveConsensus, fleet: FleetMemory | null, tMs: number, plates: string[], conf = 0.97, minLp?: number) {
  addWindowReads(lc, fleet, plates.join(" "), tMs, conf, minLp);
}

describe("addWindowReads — خطوة المحرّك لكل نافذة", () => {
  it("🔴 بتسجّل الدليل للأسطول وبتضيف كل لوحة سليمة للإجماع", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus(OPTS);
    addWindowReads(lc, fleet, " حبل1234  حبل1235 x12 ", 1500, 0.97, undefined);
    expect(fleet.count("حبل1234")).toBe(1);
    expect(fleet.count("حبل1235")).toBe(1);
    const out = lc.flush();
    expect(out.length).toBeGreaterThan(0);
    // «x12» مش لوحة ⇒ مايوصلش الإجماع أصلاً
    expect(out.every((c) => /^[ء-ي]{3}\d{4}$/.test(c.plate))).toBe(true);
  });
  it("من غير ذاكرة أسطول («صوتي») ⇒ الإجماع بس زي ما كان", () => {
    const lc = new LiveConsensus(OPTS);
    addWindowReads(lc, null, "سار8888", 1500, 0.99, undefined);
    addWindowReads(lc, null, "سار8888", 3000, 0.99, undefined);
    expect(lc.flush().map((c) => c.plate)).toEqual(["سار8888"]);
  });
});

function fleetRun(withFleet: boolean) {
  const fleet = withFleet ? new FleetMemory() : null;
  const lc = new LiveConsensus({ ...OPTS, distinct: fleet ? (a, b) => fleet.distinct(a, b) : undefined });
  // المندوب قال ٣ عربيات ورا بعض بسرعة — النوافذ (٥ث · خطوة ١.٥ث) بتسمع ٢ مع بعض
  feed(lc, fleet, 0, ["حبل1234"]);
  feed(lc, fleet, 1500, ["حبل1234", "حبل1235"]);
  feed(lc, fleet, 3000, ["حبل1235", "حبل1236"]);
  feed(lc, fleet, 4500, ["حبل1236"]);
  return lc.flush().map((c) => c.plate).sort();
}

describe("🚚 الإجماع — أسطول متسلسل", () => {
  it("🔴 تجربة المالك: كل عربية في نوافذها لوحدها ورا بعض (مفيش نافذة مشتركة) ⇒ ٣", () => {
    const run = (withFleet: boolean) => {
      const fleet = withFleet ? new FleetMemory() : null;
      const lc = new LiveConsensus({ ...OPTS, distinct: fleet ? (a, b) => fleet.distinct(a, b) : undefined });
      // سكتة بين كل عربية؛ النوافذ اللي في السكتة قرت اللوحة مقطوعة غلط
      // (٢١٠٨ · ٢١٠٩) فالعنقود فضل متّصل — وده اللي كان بيلمّهم في واحدة
      const seq: Array<[number, string, number]> = [
        [1500, "دبر2102", 0.99], [3000, "دبر2102", 0.99], [4500, "دبر2108", 0.6],
        [6000, "دبر2103", 0.99], [7500, "دبر2103", 0.99], [9000, "دبر2109", 0.6],
        [10500, "دبر2104", 0.99], [12000, "دبر2104", 0.99],
      ];
      for (const [t, p, c] of seq) feed(lc, fleet, t, [p], c);
      return lc.flush().map((c) => c.plate).sort();
    };
    expect(run(false).length).toBe(1);
    expect(run(true)).toEqual(["دبر2102", "دبر2103", "دبر2104"]);
  });

  it("🔴 من غير الدليل: ٣ عربيات بتطلع واحدة (الباج)", () => {
    expect(fleetRun(false).length).toBe(1);
  });

  it("🔴 مع الدليل: كل عربية لوحدها", () => {
    expect(fleetRun(true)).toEqual(["حبل1234", "حبل1235", "حبل1236"]);
  });

  it("كل عربية عدد نوافذها بتاعها هي (مش مجموع العنقود)", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    feed(lc, fleet, 0, ["حبل1234"]);
    feed(lc, fleet, 1500, ["حبل1234", "حبل1235"]);
    feed(lc, fleet, 3000, ["حبل1235"]);
    feed(lc, fleet, 4500, ["حبل1235"]);
    const out = lc.flush();
    const m = Object.fromEntries(out.map((c) => [c.plate, c.mult]));
    expect(m).toEqual({ "حبل1234": 2, "حبل1235": 3 });
    expect(out.every((c) => c.tier === "green")).toBe(true);
  });

  it("زمن كل عربية = متوسط نوافذها هي (للنوع والموقع)", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    feed(lc, fleet, 0, ["حبل1234"]);
    feed(lc, fleet, 1500, ["حبل1234", "حبل1235"]);
    feed(lc, fleet, 3000, ["حبل1235"]);
    const t = Object.fromEntries(lc.flush().map((c) => [c.plate, c.tMs]));
    expect(t["حبل1234"]).toBe(750);
    expect(t["حبل1235"]).toBe(2250);
  });

  it("🔴 غلط سمع لعربية في الأسطول بيتلمّ فيها — مايطلعش عربية زيادة", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    // غلط سمع لـحبل1234 في نافذتين (النافذة قطعت اللوحة) — كان ممكن يطلع عربية لوحده
    feed(lc, fleet, 0, ["حبل1284"], 0.7);
    feed(lc, fleet, 1000, ["حبل1284"], 0.7);
    feed(lc, fleet, 1500, ["حبل1234", "حبل1235"]);
    feed(lc, fleet, 3000, ["حبل1234", "حبل1235"]);
    feed(lc, fleet, 4500, ["حبل1235"]);
    const out = lc.flush();
    expect(out.map((c) => c.plate).sort()).toEqual(["حبل1234", "حبل1235"]);
    // نوافذ الغلط اتحسبت لصاحبها
    expect(out.find((c) => c.plate === "حبل1234")?.mult).toBe(4);
  });

  it("🔴 غلط السمع بيتحسب للعربية **الأقرب في الوقت** مش الأعلى ثقة", () => {
    // آخر رقم غلط (٢١٠٩) قريب خانة من كل عربيات الأسطول — صاحبه هو اللي جنبه
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    feed(lc, fleet, 1500, ["دبر2101"], 0.99);
    feed(lc, fleet, 3000, ["دبر2101", "دبر2102"], 0.97);
    feed(lc, fleet, 4500, ["دبر2102", "دبر2103"], 0.97);
    feed(lc, fleet, 6000, ["دبر2103", "دبر2104"], 0.97);
    feed(lc, fleet, 7500, ["دبر2104", "دبر2105"], 0.97);
    feed(lc, fleet, 9000, ["دبر2105"], 0.97);
    feed(lc, fleet, 10500, ["دبر2109"], 0.6);
    const out = Object.fromEntries(lc.flush().map((c) => [c.plate, c.mult]));
    expect(out["دبر2101"]).toBe(2);
    expect(out["دبر2105"]).toBe(3);
  });

  it("🔴 غلط سمع بعيد في نفس النافذة (مش أسطول) ⇒ زي ما كان: لوحة واحدة", () => {
    const run = (distinct?: (a: string, b: string) => boolean, fleet?: FleetMemory) => {
      const lc = new LiveConsensus({ ...OPTS, distinct });
      feed(lc, fleet ?? null, 0, ["بمم8788"]);
      feed(lc, fleet ?? null, 1500, ["بمم8788", "بمم6789"], 0.6);
      feed(lc, fleet ?? null, 3000, ["بمم8788"]);
      return lc.flush().map((c) => c.plate);
    };
    const fleet = new FleetMemory();
    expect(run((a, b) => fleet.distinct(a, b), fleet)).toEqual(run());
    expect(run().length).toBe(1);
  });

  it("من غير أسطول خالص ⇒ نفس النتيجة بالحرف (القراية المفردة الضعيفة بتتحجب زي ما هي)", () => {
    const run = (withFleet: boolean) => {
      const fleet = new FleetMemory();
      const lc = new LiveConsensus({ ...OPTS, distinct: withFleet ? (a, b) => fleet.distinct(a, b) : undefined });
      feed(lc, fleet, 0, ["دطس2112"], 0.8);
      feed(lc, fleet, 1500, ["دطس2177"], 0.99);
      feed(lc, fleet, 3000, ["دطس2177"], 0.99);
      feed(lc, fleet, 9000, ["ردس8211"], 0.35);
      return JSON.stringify(lc.flush());
    };
    expect(run(true)).toBe(run(false));
  });

  it("🔴 أسطول كل قراياته محجوبة وثقته واطية (اختراع من ضجيج) ⇒ مايطلعش", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    feed(lc, fleet, 0, ["حير2121", "حير2122"], 0.6, -1.2);
    feed(lc, fleet, 1500, ["حير2121", "حير2122"], 0.6, -1.2);
    expect(lc.flush()).toEqual([]);
  });

  it("عربية في الأسطول قرايتها المفردة ضعيفة جداً ⇒ تتحجب هي بس", () => {
    const fleet = new FleetMemory();
    const lc = new LiveConsensus({ ...OPTS, distinct: (a, b) => fleet.distinct(a, b) });
    feed(lc, fleet, 0, ["حبل1234"], 0.99);
    fleet.note(["حبل1234", "حبل1235"], 1500);
    fleet.note(["حبل1235"], 30000);        // اتقرت تاني بعيد (عنقود تاني)
    lc.add({ plate: "حبل1234", tMs: 1500, conf: 0.99 });
    lc.add({ plate: "حبل1235", tMs: 1500, conf: 0.2 });
    expect(lc.flush().map((c) => c.plate)).toEqual(["حبل1234"]);
  });
});
