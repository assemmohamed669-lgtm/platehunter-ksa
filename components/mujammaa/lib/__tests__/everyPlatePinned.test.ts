/**
 * 📍 «كل لوحه يبقي قدامها موقعها» — السلسلة كلها بأرقام تجربة المالك (١٧ أكتوبر ٢٠٢٦).
 *
 * المالك: «انا عايز كل سيارة تاخد موقع وقت ما المندوب قالها بالظبط وكل لوحه يبقي
 * قدامها موقعها».
 *
 * تجربته: ٣٣ لوحة (لوحة كل ~٣ث وهو ماشي)، **٤ بس** خدوا موقع — مراقبة الموقع على
 * أندرويد كانت بتجيب قراءة كل ٢٠ث، والمجمّع بيحط الموقع من قراءة في حدود ثانيتين من
 * لحظة النطق. هنا نفس السلسلة الحقيقية: `FixCollector` (اللي بيجمع وهو بيسجّل) ⇒
 * `trackFromRaw` ⇒ `stampEntriesWithTrack` (بعد التفريغ).
 *
 * وحد الدقة بقى **١٠٠م** زي باقي التطبيق (قرار المالك ١٥ أكتوبر: «خليه ياخد الدقة
 * لـ١٠٠ متر، أفضل من إنه مياخدش خالص») — والدقة بتتسجّل مع كل لوحة في التصدير.
 */
import { describe, expect, it } from "vitest";
import { FixCollector } from "../clipStore";
import { PIN_MAX_ACCURACY_M, stampEntriesWithTrack, trackFromRaw } from "../platePin";
import { FIX_LATE_MS, recordGpsWarning } from "../gps";
import type { PlateEntry } from "../plateEntry";
import { GPS_STAMP_MAX_ACCURACY_M } from "@/lib/gpsWarning";

const START = 1_790_000_000_000;
/** ماشي بالعربية ~١٠ م/ث ناحية الشمال */
const latAt = (tMs: number) => 24.7 + (tMs / 1000) * 0.00009;

function entry(i: number, timeStartSec: number): PlateEntry {
  const plate = `ابح${String(1000 + i)}`;
  return {
    id: `e-${i}`,
    review: {
      plate,
      heardPlate: plate,
      letters: [...plate.slice(0, 3)],
      digits: plate.slice(3),
      confidence: 90,
      status: "solid",
      corrections: [],
      notes: [],
      raw: plate,
      order: i,
      needsAudioReview: false,
      timeStart: timeStartSec,
    } as unknown as PlateEntry["review"],
    pin: null,
    match: { kind: "none" } as unknown as PlateEntry["match"],
    capturedAt: START,
    source: "batch",
  };
}

/** ٣٣ لوحة، واحدة كل ٣ث من الثانية ١.٢ (زي تسجيل المالك: دقيقة و٤٤ث) */
const PLATE_TIMES = Array.from({ length: 33 }, (_, i) => 1.2 + i * 3);

/** القراءات اللي الموبايل بيبعتها وهو بيسجّل — كل `everyMs` بدقة `acc` */
function record(everyMs: number, acc: (tMs: number) => number, firstMs = everyMs) {
  const col = new FixCollector();
  for (let t = firstMs; t <= 104_000; t += everyMs) {
    col.add({ lat: latAt(t), lng: 46.7, accuracy: acc(t), at: START + t }, START + t + 250);
  }
  return trackFromRaw(col.list(), START);
}

const stamp = (track: ReturnType<typeof record>) =>
  stampEntriesWithTrack(PLATE_TIMES.map((t, i) => entry(i, t)), track, START);

describe("السلسلة كلها — من القراءات وهو بيسجّل لحد الموقع قدام كل لوحة", () => {
  it("🔴 قبل: قراءة كل ٢٠ث (أندرويد من غير interval) ⇒ أغلب اللوحات من غير موقع — زي تجربة المالك", () => {
    const out = stamp(record(20_000, () => 8, 18_000));
    const pinned = out.filter((e) => e.pin).length;
    expect(pinned).toBeLessThanOrEqual(6);
    expect(pinned).toBeGreaterThan(0);
  });

  it("✅ بعد: قراءة كل ثانية ⇒ ٣٣ من ٣٣ بموقع، كل لوحة بمكانها هي (مختلف عن اللي جنبها)", () => {
    const out = stamp(record(1_000, () => 8));
    expect(out.filter((e) => e.pin).length).toBe(33);
    const lats = out.map((e) => e.pin!.lat.toFixed(6));
    expect(new Set(lats).size).toBe(33);
    for (const [i, e] of out.entries()) {
      // المكان عند لحظة النطق نفسها — مش مكان قريب منها
      expect(Math.abs(e.pin!.lat - latAt(PLATE_TIMES[i] * 1000))).toBeLessThan(0.00001); // < ~١م
      expect(e.pin!.ageMs).toBeLessThanOrEqual(500);
      expect(e.review.notes.join(" ")).not.toContain("من غير موقع");
    }
  });

  it("✅ أندرويد مش مضمون ثانية بالظبط (أحياناً ١.٥–٢ث) ⇒ برضه ٣٣ من ٣٣", () => {
    const col = new FixCollector();
    let t = 700;
    let k = 0;
    while (t <= 104_000) {
      col.add({ lat: latAt(t), lng: 46.7, accuracy: 10, at: START + t }, START + t + 300);
      t += [1000, 1500, 2000, 1200][k++ % 4];
    }
    const out = stamp(trackFromRaw(col.list(), START));
    expect(out.filter((e) => e.pin).length).toBe(33);
  });

  it(`✅ بين العماير (دقة ٣٠–٨٠م) ⇒ موقع برضه — الحد ${GPS_STAMP_MAX_ACCURACY_M}م زي باقي التطبيق، والدقة متسجّلة`, () => {
    expect(PIN_MAX_ACCURACY_M).toBe(GPS_STAMP_MAX_ACCURACY_M);
    const out = stamp(record(1_000, (tMs) => 30 + ((tMs / 1000) % 6) * 10));
    expect(out.filter((e) => e.pin).length).toBe(33);
    expect(out.every((e) => e.pin!.accuracy >= 30 && e.pin!.accuracy <= 80)).toBe(true);
  });

  it("⚖️ قراءة أوسع من ١٠٠م مش موقع — اللوحة بتتعلّم ومابناخدش نقطة غلط", () => {
    const out = stamp(record(1_000, () => 250));
    expect(out.every((e) => e.pin === null)).toBe(true);
    expect(out.every((e) => e.review.notes.some((n) => n.startsWith("من غير موقع دقيق")))).toBe(true);
  });

  it("⚖️ الموبايل وقف يبعت (نفق ١٠ث) ⇒ اللوحات اللي جوّه من غير موقع — مابنخترعش مكان", () => {
    const col = new FixCollector();
    for (let t = 1000; t <= 104_000; t += 1000) {
      if (t > 40_000 && t < 52_000) continue;
      col.add({ lat: latAt(t), lng: 46.7, accuracy: 8, at: START + t }, START + t + 250);
    }
    const out = stamp(trackFromRaw(col.list(), START));
    const missing = PLATE_TIMES.filter((_, i) => !out[i].pin);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((s) => s > 42 && s < 50)).toBe(true);
  });
});

describe("recordGpsWarning — المندوب يعرف وهو بيسجّل، مش بعد التفريغ", () => {
  const NOW = START + 60_000;
  const fix = (ageMs: number, accuracy = 8) => ({ lat: 24.7, lng: 46.7, accuracy, at: NOW - ageMs });

  it("مش بيسجّل ⇒ مافيش تحذير", () => {
    expect(recordGpsWarning(null, false, NOW)).toBeNull();
  });

  it("قراءة حديثة ودقيقة ⇒ مافيش تحذير", () => {
    expect(recordGpsWarning(fix(800), true, NOW)).toBeNull();
    expect(recordGpsWarning(fix(FIX_LATE_MS), true, NOW)).toBeNull();
  });

  it("مافيش قراءة خالص ⇒ تحذير", () => {
    expect(recordGpsWarning(null, true, NOW)).toMatch(/الموقع لسه مش جاهز/);
  });

  it("دقة أوحش من ١٠٠م ⇒ تحذير بالأمتار", () => {
    expect(recordGpsWarning(fix(500, 240), true, NOW)).toMatch(/240 متر/);
  });

  it("آخر قراءة أقدم من ٣ث ⇒ «الموقع مش بيتحدّث» بالثواني", () => {
    expect(recordGpsWarning(fix(FIX_LATE_MS + 1), true, NOW)).toMatch(/مش بيتحدّث/);
    expect(recordGpsWarning(fix(12_400), true, NOW)).toMatch(/12 ثانية/);
  });
});
