import { describe, expect, it } from "vitest";
import {
  NEIGHBOR_MAX_GAP_MS,
  NEIGHBOR_PIN,
  NO_PRECISE_PIN,
  PIN_MAX_ACCURACY_M,
  neighborPinOf,
  PIN_MAX_SNAP_MS,
  resolvePlatePin,
  resolvePlatePins,
  stampEntriesWithTrack,
  trackFromRaw,
  type RawFix,
  type TrackFix,
} from "./platePin";
import type { PlateEntry } from "./plateEntry";

/**
 * ==========================================================================
 *  موقع كل لوحة = مكان المندوب **لحظة ما قالها** — مميّز ودقيق
 * ==========================================================================
 *
 *  قاعدة المالك (٢٧ سبتمبر): «كل سيارة ليها موقع دقيق ليها … كل لوحة ليها
 *  موقعها الخاص بيها ويكون دقيق». والقديم (`GpsTrack.pinAt`) كان بيقبل دقة
 *  لحد ١٠٠م، وبيمدّ قراءة واحدة ٥ دقايق، وبيستنبط عبر فجوة دقيقتين —
 *  فكل اللوحات اللي بعد آخر قراءة (جراج/مبنى) بتاخد **نفس النقطة**.
 */

const START = 1_790_000_000_000; // بداية الصوت (epoch)

/** قراءة على مسار — `tMs` من بداية الصوت */
const fx = (tMs: number, lat: number, lng = 46.7, acc = 5): TrackFix => ({ tMs, lat, lng, acc });

describe("trackFromRaw — توقيت كل قراءة نسبةً لبداية الصوت", () => {
  it("بياخد وقت القراءة نفسها (مش وقت وصولها) لما الساعتين متفقين، ومرتّب", () => {
    const raw: RawFix[] = [
      { lat: 24.2, lng: 46.7, acc: 6, fixEpoch: START + 2000, recvEpoch: START + 2300 },
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000, recvEpoch: START + 1200 },
    ];
    const t = trackFromRaw(raw, START);
    expect(t.map((f) => f.tMs)).toEqual([1000, 2000]);
    expect(t[0].lat).toBe(24.1);
    expect(t[0].acc).toBe(5);
  });

  it("نفس القراءة اتسلّمت مرتين (إشعار حالة) ⇒ مرة واحدة", () => {
    const one = { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000, recvEpoch: START + 1100 };
    expect(trackFromRaw([one, { ...one, recvEpoch: START + 1500 }], START)).toHaveLength(1);
  });

  it("ساعة القراءات بأساس مختلف (فرق ساعة ثابت) ⇒ بتتصحّح بالفرق الوسيط", () => {
    const H = 3_600_000;
    const raw: RawFix[] = [0, 1000, 2000].map((t) => ({
      lat: 24 + t / 1e6,
      lng: 46.7,
      acc: 5,
      fixEpoch: START + t - H,
      recvEpoch: START + t + 200,
    }));
    // بعد التصحيح القراءات بتقع عند وقت وصولها، مش قبل ساعة
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([200, 1200, 2200]);
  });

  it("قراءة مخزّنة قديمة (اتسلّمت بعد ٣٠ث من أخذها) بتفضل في وقتها الحقيقي — مش «دلوقتي»", () => {
    const raw: RawFix[] = [
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000, recvEpoch: START + 1100 },
      { lat: 24.2, lng: 46.7, acc: 5, fixEpoch: START + 2000, recvEpoch: START + 2100 },
      { lat: 24.3, lng: 46.7, acc: 5, fixEpoch: START + 3000, recvEpoch: START + 3100 },
      // قراءة من ٣٠ث بدري وصلت متأخرة
      { lat: 25.0, lng: 46.7, acc: 5, fixEpoch: START + 10_000, recvEpoch: START + 40_000 },
    ];
    const t = trackFromRaw(raw, START);
    const old = t.find((f) => f.lat === 25.0)!;
    expect(old.tMs).toBe(10_000);
    // لوحة اتقالت لحظة وصولها (٤٠ث) ماتاخدهاش
    expect(resolvePlatePin(t, 40_000).pin).toBeNull();
  });

  /**
   * ==================================================================
   *  🔴 مراجعة ٣ أكتوبر (جولة ٢ — عيب ٤): ساعة الموبايل قدّام/ورا
   * ==================================================================
   *  الجولة التانية كانت بتسيب أي فرق ثابت بين ٥ث ودقيقة على إنه «تأخير
   *  توصيل» ⇒ موبايل ساعته قدّام ٨ث بياخد كل الدبابيس **٦٧م** غلط، و٣٠ث ⇒
   *  **٢٥٠م** — ومتعلّمة «دقيقة». والقراءة الطازة (`maximumAge: 0`) مابتتأخرش
   *  ٥ث على كل قراءة؛ الفرق الثابت ده ساعة. فرجعنا تصحيح الجولة الأولى:
   *  فرق ثابت أكبر من ٥ث (قدّام أو ورا) ⇒ يتصحّح — والقراءة الجاهزة وقت
   *  البداية (وصولها مش معروف) لسه برّه الحساب.
   */
  const V = 30 / 3.6; // ٣٠ كم/س بالمتر/ث
  const M_PER_DEG = 111_320;
  /** المندوب ماشي شرق ٣٠ كم/س، قراءة طازة كل ثانية — خطأ كل دبوس بالمتر */
  function pinErrorsM(fixClockBehindMs: number, lagMs: (s: number) => number): Array<number | null> {
    const raw: RawFix[] = [];
    for (let s = 0; s <= 60; s++) {
      const trueAt = START + s * 1000; // لحظة المندوب عند x(s) بساعة الجهاز
      raw.push({
        lat: 24.7,
        lng: 46.7 + (V * s) / M_PER_DEG,
        acc: 5,
        fixEpoch: trueAt - fixClockBehindMs,
        recvEpoch: trueAt + lagMs(s),
      });
    }
    const plates = [10_000, 20_500, 33_200];
    const pins = resolvePlatePins(trackFromRaw(raw, START), plates);
    return pins.map((p, i) =>
      p.pin ? Math.round(Math.abs((p.pin.lng - 46.7) * M_PER_DEG - (V * plates[i]) / 1000)) : null
    );
  }

  it("🔴 ساعة الموبايل قدّام ٨ث ⇒ بتتصحّح: كل دبوس في مكانه (مش ٦٧م بعيد)", () => {
    const err = pinErrorsM(8000, () => 300);
    expect(err.every((e) => e !== null && e <= 3)).toBe(true);
  });

  it("🔴 ساعة الموبايل قدّام ٣٠ث ⇒ بتتصحّح: كل دبوس في مكانه (مش ٢٥٠م بعيد)", () => {
    const err = pinErrorsM(30_000, () => 300);
    expect(err.every((e) => e !== null && e <= 3)).toBe(true);
  });

  it("ساعة القراءات قدّام ٣٠ث (ساعة الموبايل ورا) ⇒ بتتصحّح برضه", () => {
    const err = pinErrorsM(-30_000, () => 300);
    expect(err.every((e) => e !== null && e <= 3)).toBe(true);
  });

  it("تأخير توصيل طبيعي منتظم (٠.٢–٣ث متغيّر) ⇒ مابنحرّكش حاجة: كل قراءة في وقتها الحقيقي", () => {
    const lag = (s: number) => 200 + ((s * 7919) % 2800);
    const raw: RawFix[] = [0, 1000, 2000, 3000].map((t, i) => ({
      lat: 24 + t / 1e6,
      lng: 46.7,
      acc: 5,
      fixEpoch: START + t,
      recvEpoch: START + t + lag(i),
    }));
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([0, 1000, 2000, 3000]);
    expect(pinErrorsM(0, lag).every((e) => e !== null && e <= 1)).toBe(true);
  });

  /**
   * ⚖️ قرار مقصود: تأخير توصيل **منتظم** أكبر من ٥ث على **كل** قراءة
   * مايتفرقش بالأرقام عن ساعة متأخرة. القراءة الطازة بتوصل في أقل من ثانية،
   * فالفرق الثابت ده بيتعامل ساعة (القراءات بتتحط عند وصولها). لو موبايل
   * حقيقي طلّع غير كده، `rawFixes` محفوظ فيه الوقتين ويتراجع.
   */
  it("تأخير منتظم ٦ث أو ٣٠ث على كل القراءات ⇒ بيتعامل فرق ساعة (مايتفرقش عنه)", () => {
    for (const lag of [6000, 30_000]) {
      const raw: RawFix[] = [0, 1000, 2000].map((t) => ({
        lat: 24 + t / 1e6,
        lng: 46.7,
        acc: 5,
        fixEpoch: START + t,
        recvEpoch: START + t + lag,
      }));
      expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([lag, 1000 + lag, 2000 + lag]);
    }
  });

  it("ساعة قدّام ٨ث + القراءة الجاهزة وقت البداية (وصولها null) ⇒ مابتشدّش الحساب، وبتتصحّح زي الباقي", () => {
    const raw: RawFix[] = [
      { lat: 24.0, lng: 46.7, acc: 5, fixEpoch: START - 500 - 8000, recvEpoch: null },
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000 - 8000, recvEpoch: START + 1300 },
      { lat: 24.2, lng: 46.7, acc: 5, fixEpoch: START + 2000 - 8000, recvEpoch: START + 2300 },
    ];
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([-200, 1300, 2300]);
  });

  it("قراءة واحدة بوقت مجنون (ساعة GPS اتلخبطت) مابتسحبش التصحيح على كل المسار", () => {
    const raw: RawFix[] = [0, 1000, 2000, 3000].map((t) => ({
      lat: 24 + t / 1e6,
      lng: 46.7,
      acc: 5,
      fixEpoch: START + t - 8000,
      recvEpoch: START + t + 300,
    }));
    raw.push({ lat: 25, lng: 46.7, acc: 5, fixEpoch: START + 3_600_000, recvEpoch: START + 4300 });
    const t = trackFromRaw(raw, START).filter((f) => f.lat < 25);
    expect(t.map((f) => f.tMs)).toEqual([300, 1300, 2300, 3300]);
  });

  it("فرق ساعة حقيقي + قراءة اتأخرت زيادة ⇒ التصحيح بأقل تأخير، والمتأخرة تفضل متأخرة (مش وقت وصولها)", () => {
    const H = 3_600_000;
    const extra = [200, 5200, 5200];
    const raw: RawFix[] = [0, 1000, 2000].map((t, i) => ({
      lat: 24 + t / 1e6,
      lng: 46.7,
      acc: 5,
      fixEpoch: START + t - H,
      recvEpoch: START + t + extra[i],
    }));
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([200, 1200, 2200]);
  });

  it("ساعة القراءات قدّام ساعة الجهاز (قراءة «من المستقبل» مستحيلة كتأخير) ⇒ بتتصحّح", () => {
    const H = 3_600_000;
    const raw: RawFix[] = [0, 1000].map((t) => ({
      lat: 24 + t / 1e6,
      lng: 46.7,
      acc: 5,
      fixEpoch: START + t + H,
      recvEpoch: START + t + 300,
    }));
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([300, 1300]);
  });

  it("القراءة الجاهزة وقت البداية (وقت وصولها مش معروف = null) مابتدخلش في حساب فرق الساعة", () => {
    const H = 3_600_000;
    const raw: RawFix[] = [
      // اتاخدت قبل البداية بنص ثانية — وقت وصولها الحقيقي مش معروف
      { lat: 24.0, lng: 46.7, acc: 5, fixEpoch: START - 500 - H, recvEpoch: null },
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000 - H, recvEpoch: START + 1200 },
    ];
    // لو اتحسبت بتأخير صفر، الوسيط بقى نص الفرق والمسار كله اتزحلق نص ساعة
    expect(trackFromRaw(raw, START).map((f) => f.tMs)).toEqual([-300, 1200]);
  });

  it("بيرمي القراءات اللي إحداثياتها مش أرقام", () => {
    const raw = [
      { lat: Number.NaN, lng: 46.7, acc: 5, fixEpoch: START, recvEpoch: START },
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 500, recvEpoch: START + 600 },
    ];
    expect(trackFromRaw(raw, START)).toHaveLength(1);
  });
});

describe("resolvePlatePin — المكان لحظة النطق أو لا شيء", () => {
  it("بين قراءتين قريبتين ⇒ نقطة في النص بالنسبة (استنباط)", () => {
    const r = resolvePlatePin([fx(1000, 24.0), fx(3000, 24.002)], 2000);
    expect(r.kind).toBe("interp");
    expect(r.pin!.lat).toBeCloseTo(24.001, 9);
    expect(r.pin!.ageMs).toBe(1000);
  });

  it(`دقة أوسع من ${PIN_MAX_ACCURACY_M}م ⇒ مش قراءة — بلا موقع والسبب «coarse»`, () => {
    const r = resolvePlatePin([fx(1000, 24.0, 46.7, 140), fx(2500, 24.001, 46.7, 260)], 2000);
    expect(r.pin).toBeNull();
    expect(r.reason).toBe("coarse");
  });

  it("دقة ١٠٠م بالظبط مقبولة — زي باقي التطبيق (قرار المالك ١٥ أكتوبر)", () => {
    expect(PIN_MAX_ACCURACY_M).toBe(100);
    expect(resolvePlatePin([fx(1500, 24.0, 46.7, 100)], 2000).pin).not.toBeNull();
    expect(resolvePlatePin([fx(1500, 24.0, 46.7, 100.5)], 2000).pin).toBeNull();
  });

  it("🔴 الدقيق الأول: قراءة ٩٠م بين قراءتين ٥م قريبين مابتشدّش الدبوس — الـ١٠٠م احتياطي بس", () => {
    const track = [fx(9000, 24.0, 46.7, 5), fx(10_100, 24.5, 46.7, 90), fx(11_000, 24.002, 46.7, 5)];
    const r = resolvePlatePin(track, 10_000);
    expect(r.kind).toBe("interp");
    expect(r.pin!.acc).toBe(5);
    expect(r.pin!.lat).toBeCloseTo(24.001, 9);
  });

  it("🔴 قراءة دقيقة واحدة وبعدها أوسع كل ثانية ⇒ لوحتين جنبها الاتنين بموقع (اللي خسرت القراءة الدقيقة بتاخد من الأوسع)", () => {
    // مراجعة ١٧ أكتوبر (جولة ٢): الاتنين كانوا بيلقطوا القراءة الدقيقة ⇒ واحدة «same-fix» بلا موقع
    const track = [fx(0, 24.0, 46.7, 10), ...[1000, 2000, 3000, 4000].map((t) => fx(t, 24 + t / 1e6, 46.7, 40))];
    const out = resolvePlatePins(track, [500, 1500]);
    expect(out.every((r) => r.pin !== null)).toBe(true);
    expect(out[0].pin!.lat).not.toBe(out[1].pin!.lat);
  });

  it("🔴 دقة بتلف حوالين ٢٥م (٢٠/٣٠/٣٥/٣٠/٤٠/٣٠/٢٠) ⇒ ٣ من ٣ بموقع مختلف", () => {
    const accs = [20, 30, 35, 30, 40, 30, 20];
    const track = accs.map((a, i) => fx(i * 1000, 24 + i / 1e4, 46.7, a));
    const out = resolvePlatePins(track, [800, 1600, 4500]);
    expect(out.map((r) => r.pin !== null)).toEqual([true, true, true]);
    expect(new Set(out.map((r) => r.pin!.lat.toFixed(7))).size).toBe(3);
  });

  it("⚖️ ولو مافيش غير القراءة الدقيقة (مافيش أوسع حواليها) ⇒ لسه واحدة بس تاخدها — مابنخترعش", () => {
    const out = resolvePlatePins([fx(0, 24.0, 46.7, 10)], [500, 1500]);
    expect(out.filter((r) => r.pin).length).toBe(1);
    expect(out[1].reason).toBe("same-fix");
  });

  it("مافيش دقيق حواليها ⇒ بتاخد الأوسع (لحد ١٠٠م) ودقته متسجّلة", () => {
    const r = resolvePlatePin([fx(1500, 24.0, 46.7, 60), fx(2500, 24.0001, 46.7, 70)], 2000);
    expect(r.pin).not.toBeNull();
    expect(r.pin!.acc).toBe(70);
  });

  it(`قراءة واحدة في حدود ${PIN_MAX_SNAP_MS / 1000}ث ⇒ مكانها؛ أبعد ⇒ بلا موقع («gap»)`, () => {
    expect(resolvePlatePin([fx(1000, 24.0)], 3000).kind).toBe("snap");
    const far = resolvePlatePin([fx(1000, 24.0)], 3500);
    expect(far.pin).toBeNull();
    expect(far.reason).toBe("gap");
  });

  it("قراءتين بينهم فجوة كبيرة ⇒ مابنستنبطش؛ بناخد الأقرب لو في حدود ثانيتين بس", () => {
    const track = [fx(1000, 24.0), fx(11_000, 24.01)];
    const near = resolvePlatePin(track, 2500);
    expect(near.kind).toBe("snap");
    expect(near.pin!.lat).toBe(24.0);
    // في نص الفجوة (٥ث من كل واحدة) ⇒ لا شيء
    expect(resolvePlatePin(track, 6000).pin).toBeNull();
  });

  it("🔴 بعد آخر قراءة (دخل جراج) اللوحات اللي بعد ثانيتين مابتاخدش آخر نقطة", () => {
    const track = [fx(0, 24.0), fx(1000, 24.0001), fx(2000, 24.0002)];
    expect(resolvePlatePin(track, 3500).pin).not.toBeNull(); // ١.٥ث بعد آخر قراءة
    expect(resolvePlatePin(track, 9000).pin).toBeNull();
    expect(resolvePlatePin(track, 60_000).pin).toBeNull();
  });

  it("لوحة بلا توقيت ⇒ بلا موقع («no-time») — مافيش استعارة وقت اللوحة اللي قبلها", () => {
    expect(resolvePlatePin([fx(1000, 24)], undefined).reason).toBe("no-time");
    expect(resolvePlatePin([fx(1000, 24)], Number.NaN).reason).toBe("no-time");
  });

  it("مافيش ولا قراءة ⇒ «no-fix»", () => {
    expect(resolvePlatePin([], 1000).reason).toBe("no-fix");
  });

  it("القراءة الواسعة مابتكسرش الاستنباط بين قراءتين دقيقتين حواليها", () => {
    const r = resolvePlatePin([fx(1000, 24.0), fx(2000, 30, 46.7, 500), fx(3000, 24.002)], 2000);
    expect(r.kind).toBe("interp");
    expect(r.pin!.lat).toBeCloseTo(24.001, 9);
  });
});

describe("resolvePlatePins — مافيش لوحتين ورا بعض على نفس القراءة", () => {
  it("لوحتين ورا بعض لقطوا نفس القراءة الوحيدة ⇒ الأقرب ليها بس، والتانية بلا موقع", () => {
    // قراءة وحيدة عند ٥ث؛ لوحة عند ٣.٥ث (١.٥ث) ولوحة عند ٥.٥ث (٠.٥ث)
    const out = resolvePlatePins([fx(5000, 24.0)], [3500, 5500]);
    expect(out[0].pin).toBeNull();
    expect(out[0].reason).toBe("same-fix");
    expect(out[1].pin!.lat).toBe(24.0);
  });

  it("تلات لوحات على نفس القراءة ⇒ واحدة بس تاخدها", () => {
    const out = resolvePlatePins([fx(5000, 24.0)], [4000, 5200, 6500]);
    expect(out.filter((r) => r.pin).length).toBe(1);
    expect(out[1].pin).not.toBeNull();
  });

  it("المندوب ماشي وقراءات كل ثانية ⇒ كل لوحة نقطة مختلفة", () => {
    const track = Array.from({ length: 12 }, (_, i) => fx(i * 1000, 24 + i * 0.0001));
    const out = resolvePlatePins(track, [1500, 3200, 4100, 7900]);
    const lats = out.map((r) => r.pin!.lat);
    expect(new Set(lats).size).toBe(4);
  });

  it("لوحتين بنفس اللحظة بالظبط ⇒ التانية بلا موقع (نقطة مكرّرة)", () => {
    const out = resolvePlatePins([fx(1000, 24.0), fx(2000, 24.001)], [1500, 1500]);
    expect(out[0].pin).not.toBeNull();
    expect(out[1].pin).toBeNull();
    expect(out[1].reason).toBe("same-fix");
  });

  it("الترتيب بالوقت مش بترتيب المصفوفة — والمخرج محاذي للمدخل", () => {
    const out = resolvePlatePins([fx(5000, 24.0)], [5500, undefined, 3500]);
    expect(out[0].pin).not.toBeNull();
    expect(out[1].reason).toBe("no-time");
    expect(out[2].reason).toBe("same-fix");
  });

  /**
   * 🟢 قرار ٣ أكتوبر (نيّة المالك = مافيش قراءة **قديمة** بتتعاد): المندوب
   * واقف في برحة وأندرويد بيرجّع نفس الإحداثيات في كل قراءة جديدة. كل لوحة
   * ليها قراءة **طازة** وقت نطقها — فالنقطة الواحدة هنا حقيقة مش تكرار.
   * الممنوع بس: **نفس القراءة** (نفس وقت القراءة) تتحط على لوحتين جيران.
   */
  it("🟢 مندوب واقف (نفس الإحداثيات من قراءات طازة كل ثانية) ⇒ كل لوحة تاخد موقعها", () => {
    const track = Array.from({ length: 6 }, (_, i) => fx(i * 1000, 24.5));
    const out = resolvePlatePins(track, [500, 2500, 4500]);
    expect(out.map((r) => r.pin?.lat)).toEqual([24.5, 24.5, 24.5]);
    expect(out.every((r) => r.reason === undefined)).toBe(true);
  });

  it("🟢 قراءات طازة متباعدة بنفس الإحداثيات ⇒ كل لوحة على قراءتها؛ والممنوع بس اتنين على نفس القراءة", () => {
    // قراءة كل ٥ث (مافيش استنباط) — كلها نفس النقطة
    const track = [fx(0, 24.5), fx(5000, 24.5), fx(10_000, 24.5)];
    const out = resolvePlatePins(track, [1000, 4600, 5500, 9000]);
    expect(out[0].pin).not.toBeNull(); // قراءة ٠
    expect(out[1].pin).not.toBeNull(); // قراءة ٥ث — الأقرب ليها (٠.٤ث)
    expect(out[2].pin).toBeNull(); //     نفس قراءة ٥ث ⇒ ممنوع تتعاد
    expect(out[2].reason).toBe("same-fix");
    expect(out[3].pin).not.toBeNull(); // قراءة ١٠ث
  });

  it("استنباط بين نفس القراءتين للوحتين في لحظتين مختلفتين ⇒ مسموح (كل واحدة بلحظتها)", () => {
    const out = resolvePlatePins([fx(0, 24.5), fx(4000, 24.5)], [1000, 3000]);
    expect(out.every((r) => r.pin !== null)).toBe(true);
  });
});

/* ------------------------------------------------ على صفوف الصفحة نفسها */

function entry(plate: string, timeStart: number | undefined, notes: string[] = []): PlateEntry {
  return {
    id: `e-${plate}`,
    review: {
      plate,
      heardPlate: plate,
      letters: [...plate.slice(0, 3)],
      digits: plate.slice(3),
      confidence: 90,
      status: "solid",
      corrections: [],
      notes,
      raw: plate,
      order: 1,
      needsAudioReview: false,
      timeStart,
    } as unknown as PlateEntry["review"],
    pin: null,
    match: { kind: "none" } as unknown as PlateEntry["match"],
    capturedAt: START,
    source: "batch",
  };
}

describe("stampEntriesWithTrack — الدبوس على اللوحات بعد التفريغ", () => {
  const track = Array.from({ length: 10 }, (_, i) => fx(i * 1000, 24 + i * 0.0001));

  it("بيحط دبوس بلحظة النطق (t_s بالثواني) ودقته، ومش «قديم»", () => {
    const [a] = stampEntriesWithTrack([entry("ابح1234", 2.5)], track, START);
    expect(a.pin).not.toBeNull();
    expect(a.pin!.lat).toBeCloseTo(24.00025, 9);
    expect(a.pin!.accuracy).toBe(5);
    expect(a.pin!.stale).toBe(false);
    expect(a.pin!.at).toBe(START + 2500);
    expect(a.review.notes.some((n) => n.startsWith(NO_PRECISE_PIN))).toBe(false);
  });

  it(`اللوحة اللي مالهاش موقع دقيق بتتعلّم «${NO_PRECISE_PIN}» في ملاحظاتها`, () => {
    const out = stampEntriesWithTrack([entry("ابح1234", 30), entry("حطس5678", undefined)], track, START);
    expect(out[0].pin).toBeNull();
    expect(out[0].review.notes.join(" ")).toContain(NO_PRECISE_PIN);
    expect(out[1].pin).toBeNull();
    expect(out[1].review.notes.join(" ")).toContain(NO_PRECISE_PIN);
  });

  it("إعادة التفريغ مابتكرّرش العلامة، ولو بقى ليها موقع العلامة القديمة بتتشال", () => {
    const once = stampEntriesWithTrack([entry("ابح1234", 30, ["ملاحظة قديمة"])], track, START);
    const twice = stampEntriesWithTrack(once, track, START);
    expect(twice[0].review.notes.filter((n) => n.startsWith(NO_PRECISE_PIN))).toHaveLength(1);
    expect(twice[0].review.notes).toContain("ملاحظة قديمة");
    const fixed = stampEntriesWithTrack(
      [{ ...once[0], review: { ...once[0].review, timeStart: 3 } }],
      track,
      START
    );
    expect(fixed[0].pin).not.toBeNull();
    expect(fixed[0].review.notes.some((n) => n.startsWith(NO_PRECISE_PIN))).toBe(false);
    expect(fixed[0].review.notes).toContain("ملاحظة قديمة");
  });

  it("مابيعدّلش المدخل وبيحافظ على الترتيب", () => {
    const input = [entry("ابح1234", 5), entry("حطس5678", 2)];
    const out = stampEntriesWithTrack(input, track, START);
    expect(input[0].pin).toBeNull();
    expect(out.map((e) => e.review.plate)).toEqual(["ابح1234", "حطس5678"]);
  });

  it("مسار فاضي (الموقع مقفول) ⇒ كل اللوحات بلا موقع ومتعلّمة", () => {
    const out = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 2)], [], START);
    expect(out.every((e) => e.pin === null)).toBe(true);
    expect(out.every((e) => e.review.notes.some((n) => n.startsWith(NO_PRECISE_PIN)))).toBe(true);
  });
});

/**
 * 📍 **«نفس موقع اللوحة اللي قبلها»** (١٩ أكتوبر ٢٠٢٦). المالك بعد لوحة اتفرّغت من غير موقع:
 * «لو قريبه من لوحه متاخده ليها موقع يتاخد نفس موقع اللوحه اللي قبلها مدام في نفس الموقع».
 *  · لحد **١٠ث** (بوقت النطق) من لوحة ليها دبوس حقيقي — اللي قبلها الأول، وإلا اللي بعدها.
 *  · «مدام في نفس الموقع» = **لازم دليل** إنه ماتحرّكش: قراءة بعد اللوحة (ناحيتها) قريبة من الدبوس، ولو
 *    مافيش ⇒ قراءات على الناحية التانية بتقول إنه فضل ثابت مدة قد الفرق. أي قراءة في النص على بعد
 *    أكتر من ٥٠م ⇒ اتحرّك ⇒ مابننسخش (ماشي بالعربية ١٠م/ث يبقى ٩٠م غلط — دبوس غلط أسوأ من مافيش).
 *  · متعلّمة «📍 نفس موقع اللوحة اللي قبلها (فرق Xث)» — باينة في الملاحظات والتصدير.
 *  · المنسوخ مابيتنسخش منه تاني (مافيش سلسلة تمدّ نقطة واحدة دقيقة كاملة).
 */
describe("stampEntriesWithTrack — نفس موقع اللوحة اللي قبلها", () => {
  const notesOf = (e: PlateEntry) => e.review.notes.join(" ");

  it("الموقع وقف ٥ث والقراءة اللي بعدها لسه في نفس المكان ⇒ نفس دبوس اللي قبلها + العلامة", () => {
    const track = [fx(1000, 24.5), fx(11000, 24.5001)]; // ≈١١م
    const [a, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(a.pin).not.toBeNull();
    expect(b.pin).not.toBeNull();
    expect(b.pin!.lat).toBe(a.pin!.lat);
    expect(b.pin!.lng).toBe(a.pin!.lng);
    expect(b.pin!.accuracy).toBe(a.pin!.accuracy);
    expect(notesOf(b)).toContain(`${NEIGHBOR_PIN} قبلها (فرق 5ث)`);
    expect(notesOf(b)).not.toContain(NO_PRECISE_PIN);
    expect(neighborPinOf(b)).toBe("before");
    expect(neighborPinOf(a)).toBeNull();
    expect(notesOf(a)).not.toContain(NEIGHBOR_PIN);
  });

  it("قراءة واحدة بس ومافيش أي دليل إنه واقف ⇒ مابتتنسخش (ممكن يكون ماشي)", () => {
    const track = [fx(1000, 24.5)];
    const [a, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(a.pin).not.toBeNull();
    expect(b.pin).toBeNull();
    expect(notesOf(b)).toContain(NO_PRECISE_PIN);
  });

  it("أول لوحة (الموقع لسه بيصحى) ⇒ بتاخد اللي بعدها لو القراءات بعدها ثابتة مدة قد الفرق", () => {
    const track = [5000, 6000, 7000, 8000, 9000, 10000].map((t) => fx(t, 24.5));
    const [a, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 5)], track, START);
    expect(b.pin).not.toBeNull();
    expect(a.pin).not.toBeNull();
    expect(a.pin!.lat).toBe(24.5);
    expect(notesOf(a)).toContain(`${NEIGHBOR_PIN} بعدها (فرق 4ث)`);
    expect(neighborPinOf(a)).toBe("after");
  });

  it("أول لوحة والقراءات بعدها بتتحرّك (عربية ~٥٥ كم/س) ⇒ مابتتنسخش", () => {
    // ٠.٠٠٠١٤ درجة/ث ≈ ١٥.٥م/ث ⇒ في ٤ث (الفرق) ≈ ٦٢م > ٥٠م
    const track = [5000, 6000, 7000, 8000, 9000, 10000].map((t) => fx(t, 24.5 + ((t - 5000) / 1000) * 0.00014));
    const [a] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 5)], track, START);
    expect(a.pin).toBeNull();
  });

  it("اللي قبلها أولى من اللي بعدها", () => {
    const track = [fx(1000, 24.5), fx(9000, 24.5001), fx(12000, 24.5001)];
    const [, b] = stampEntriesWithTrack(
      [entry("ابح1234", 1), entry("حطس5678", 6), entry("دعو9012", 9)],
      track,
      START
    );
    expect(b.pin!.lat).toBe(24.5);
    expect(notesOf(b)).toContain("قبلها");
  });

  it(`أبعد من ${NEIGHBOR_MAX_GAP_MS / 1000}ث ⇒ مابتتنسخش (من غير موقع دقيق زي الأول)`, () => {
    const track = [fx(1000, 24.5), fx(14500, 24.5)];
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 12)], track, START);
    expect(b.pin).toBeNull();
    expect(notesOf(b)).toContain(NO_PRECISE_PIN);
    expect(notesOf(b)).not.toContain(NEIGHBOR_PIN);
  });

  it("قراءة في النص بتقول إنه اتحرّك أكتر من ٥٠م ⇒ مابتتنسخش حتى لو رجع", () => {
    // ٠.٠٠١ درجة ≈ ١١١م — على بعد ٣ث من اللوحة التانية (أبعد من حد الالتقاط) بس جوّه الفترة
    const track = [fx(1000, 24.5), fx(3000, 24.501), fx(11000, 24.5)];
    const [a, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(a.pin).not.toBeNull();
    expect(b.pin).toBeNull();
    expect(notesOf(b)).toContain(NO_PRECISE_PIN);
  });

  it("القراءة اللي بعدها بعيدة (اتحرّك) ⇒ مابتتنسخش", () => {
    const track = [fx(1000, 24.5), fx(11000, 24.501)];
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(b.pin).toBeNull();
  });

  it("حركة صغيرة (أقل من ٥٠م) ⇒ لسه نفس المكان وبتتنسخ", () => {
    const track = [fx(1000, 24.5), fx(3000, 24.5002), fx(11000, 24.5002)]; // ≈٢٢م
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(b.pin).not.toBeNull();
  });

  it("قراءة أوسع من ١٠٠م مابتتحسبش (لا حركة ولا دليل)", () => {
    const track = [fx(1000, 24.5), fx(3000, 24.51, 46.7, 500), fx(11000, 24.5001)];
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(b.pin).not.toBeNull();
  });

  it("المنسوخ مابيتنسخش منه تاني — سلسلة ٠ث/٨ث/١٦ث: التالتة من غير موقع", () => {
    const track = [fx(-9000, 24.5), fx(-5000, 24.5), fx(0, 24.5)];
    const out = stampEntriesWithTrack(
      [entry("ابح1234", 0), entry("حطس5678", 8), entry("دعو9012", 16)],
      track,
      START
    );
    expect(out[1].pin).not.toBeNull();
    expect(out[2].pin).toBeNull();
    expect(notesOf(out[2])).toContain(NO_PRECISE_PIN);
  });

  it("الدبابيس الحقيقية مابتتلمسش", () => {
    const track = Array.from({ length: 10 }, (_, i) => fx(i * 1000, 24 + i * 0.0001));
    const plain = stampEntriesWithTrack([entry("ابح1234", 2.5), entry("حطس5678", 6)], track, START);
    expect(plain[0].pin!.lat).toBeCloseTo(24.00025, 9);
    expect(plain[1].pin!.lat).toBeCloseTo(24.0006, 9);
    expect(plain.every((e) => neighborPinOf(e) === null)).toBe(true);
  });

  it("لوحة مالهاش لحظة نطق ⇒ مابتتنسخش (مانعرفش هي قريبة ولا لأ)", () => {
    const track = [fx(1000, 24.5), fx(11000, 24.5)];
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", undefined)], track, START);
    expect(b.pin).toBeNull();
  });

  it("إعادة التفريغ مابتكرّرش العلامة — ولو بقى ليها دبوس حقيقي العلامة بتتشال", () => {
    const track = [fx(1000, 24.5), fx(11000, 24.5001)];
    const once = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(once[1].pin).not.toBeNull();
    const twice = stampEntriesWithTrack(once, track, START);
    expect(twice[1].review.notes.filter((n) => n.startsWith(NEIGHBOR_PIN))).toHaveLength(1);
    const real = stampEntriesWithTrack(once, [...track, fx(6000, 24.5003)], START);
    expect(real[1].review.notes.some((n) => n.startsWith(NEIGHBOR_PIN))).toBe(false);
    expect(real[1].pin!.lat).toBe(24.5003);
  });
});

/**
 * 📍 **الموقع «بالكيلو»** (٢٠ أكتوبر ٢٠٢٦) — المالك: «لما دقه الموقع بالكيلو قدام سيارة بلاش ياخد من نفس الموقع دة
 * ياخد موقع اللي قبلها او اللي بعدها لانها اقرب لوحات ليها». القراءات حوالين اللوحة كلها أوسع من ١٠٠م (مش موقع) ⇒
 * مافيش دليل على حركة ولا على وقوف ⇒ بتاخد دبوس اللوحة اللي قبلها (وإلا اللي بعدها) في حدود ١٠ث — طالما
 * مافيش قراءة دقيقة بتقول إنه اتحرّك.
 */
describe("stampEntriesWithTrack — الموقع بالكيلو ⇒ موقع اللوحة اللي جنبها", () => {
  const notesOf = (e: PlateEntry) => e.review.notes.join(" ");

  it("القراءة وقت اللوحة ±١٤١٤م ⇒ نفس دبوس اللي قبلها (مش القراءة دي)", () => {
    const track = [fx(1000, 24.5), fx(5000, 24.61, 46.7, 1414), fx(6200, 24.62, 46.7, 1414)];
    const [a, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(a.pin).not.toBeNull();
    expect(b.pin).not.toBeNull();
    expect(b.pin!.lat).toBe(24.5);
    expect(notesOf(b)).toContain(`${NEIGHBOR_PIN} قبلها (فرق 5ث)`);
  });

  it("أول لوحة والقراءة وقتها بالكيلو ⇒ اللي بعدها", () => {
    const track = [fx(500, 24.61, 46.7, 2000), fx(5000, 24.5)];
    const [a] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 5)], track, START);
    expect(a.pin!.lat).toBe(24.5);
    expect(notesOf(a)).toContain(`${NEIGHBOR_PIN} بعدها`);
  });

  it("التسجيل كله بالكيلو (الموقع الدقيق مقفول على الآيفون) ⇒ مافيش لوحة ليها دبوس تتنسخ منها", () => {
    const track = [fx(-3000, 24.6, 46.7, 1414), fx(12300, 24.6, 46.7, 1414)];
    const out = stampEntriesWithTrack([entry("ابح1234", 2.4), entry("حطس5678", 5.7)], track, START);
    expect(out.every((e) => e.pin === null)).toBe(true);
  });

  it("قراءة دقيقة في النص بتقول إنه اتحرّك أكتر من ٥٠م ⇒ مابتتنسخش حتى لو الباقي بالكيلو", () => {
    const track = [fx(1000, 24.5), fx(3000, 24.501), fx(5500, 24.61, 46.7, 1414)];
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], track, START);
    expect(b.pin).toBeNull();
  });

  it("الموقع ساكت خالص (مش بالكيلو) ⇒ زي الأول: من غير دليل مابتتنسخش", () => {
    const [, b] = stampEntriesWithTrack([entry("ابح1234", 1), entry("حطس5678", 6)], [fx(1000, 24.5)], START);
    expect(b.pin).toBeNull();
  });
});
