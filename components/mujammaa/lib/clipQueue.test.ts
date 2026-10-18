import { describe, expect, it } from "vitest";
import { pickNextJob } from "./clipQueue";
import { clipJobFields, clipRunOutcome, FixCollector, type StoredClip } from "./clipStore";
import type { PlateEntry } from "./plateEntry";

/**
 * 🧮 طابور التفريغ + موقع كل لوحة من مقطعها هي (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «لو مثلا مسجل 5 مقاطع … وداس قدام كل واحد علي كلمه تفريغ يتفرغو بالترتيب يقفو صف اللي يخلص يتفرغ
 * غيرو وهكذا وهما بيتفرغو يقدر بردو يسجل مقاطع تاني واهم حاجه ان كل مقطع من دول فيه لوحات كل لوحه ينزل
 * قدامها موقعها بالظبط وقت ما قاله المندوب … لو طلع فيه غلط مواقع السيارات دي مشكله كبيرة».
 */
const job = (id: string, status: string, order?: number) => ({ id, status, order });

describe("pickNextJob — بالترتيب اللي المندوب داس بيه", () => {
  it("واحد في المرة، والأقدم في الدوسة الأول — مش اللي جهز الأول", () => {
    // داس على ٣ ثم ١ ثم ٢ … بس ٢ جهز الأول في القايمة
    const jobs = [job("c2", "waiting", 3), job("c3", "waiting", 1), job("c1", "waiting", 2)];
    expect(pickNextJob(jobs, [])?.id).toBe("c3");
  });

  it("🔴 مقطع اتداس عليه الأول لسه بيتقري من التخزين ⇒ اللي بعده يستنى (مايسبقوش)", () => {
    // داس على المقطع الكبير (١) ثم الصغير (٢)؛ الصغير جهز وانضم للطابور، والكبير لسه بيتقري
    expect(pickNextJob([job("small", "waiting", 2)], [1])).toBeNull();
    // الكبير جهز ⇒ هو الأول
    expect(pickNextJob([job("small", "waiting", 2), job("big", "waiting", 1)], [])?.id).toBe("big");
  });

  it("اللي شغّال أو خلص أو فشل مابيتختارش — ومافيش مستني ⇒ ولا حاجة", () => {
    const jobs = [job("a", "done", 1), job("b", "failed", 2), job("c", "working", 3)];
    expect(pickNextJob(jobs, [])).toBeNull();
    expect(pickNextJob([...jobs, job("d", "waiting", 4)], [])?.id).toBe("d");
  });

  it("مهمة قديمة من غير رقم ⇒ بترتيب القايمة وبعد اللي ليهم أرقام", () => {
    expect(pickNextJob([job("old", "waiting"), job("new", "waiting", 5)], [])?.id).toBe("new");
    expect(pickNextJob([job("old1", "waiting"), job("old2", "waiting")], [])?.id).toBe("old1");
  });
});

describe("📍 كل مقطع بمساره هو — ٥ مقاطع ورا بعض، والتفريغ وهو بيسجّل", () => {
  const T0 = 1_760_800_000_000;
  /** المندوب ماشي شمال: كل مقطع في حتة مختلفة (خط عرض بيزيد ٠.٠٠١ كل ثانية) */
  const recordClip = (n: number, startEpoch: number, secs: number) => {
    const col = new FixCollector();
    for (let s = 0; s <= secs; s++) {
      const lat = 24 + n + s * 0.001; // كل مقطع في «مدينة» لوحده عشان أي خلط يبان
      col.add({ lat, lng: 46.7, accuracy: 5, at: startEpoch + s * 1000 }, startEpoch + s * 1000 + 150);
    }
    const clip: StoredClip = {
      id: `c${n}`, seqNo: n, label: `مقطع ${n}`, createdAt: startEpoch, startEpoch, durationSec: secs,
      mime: "audio/webm", source: "record", status: "ready", parts: 1, bytes: 100, updatedAt: startEpoch + secs * 1000,
      stamp: { startedAt: startEpoch } as never, rawFixes: col.list(),
    } as StoredClip;
    return { clip, col };
  };
  const entry = (plate: string, t: number) =>
    ({ id: plate, review: { plate, notes: [], timeStart: t }, pin: null, match: { kind: "none" }, capturedAt: 0, source: "batch" }) as unknown as PlateEntry;

  it("كل لوحة بمكان المندوب **لحظة نطقها في مقطعها** — ومافيش لوحة بتاخد من مقطع تاني", () => {
    const clips = [1, 2, 3, 4, 5].map((n) => recordClip(n, T0 + n * 600_000, 60));
    // المقطع السادس بيتسجّل والخمسة بيتفرّغوا — قراياته بتتضاف لمجمّعه هو بس
    const live = new FixCollector();
    for (let s = 0; s < 30; s++) live.add({ lat: 40 + s * 0.001, lng: 50, accuracy: 5, at: T0 + 9_000_000 + s * 1000 }, T0 + 9_000_000 + s * 1000);
    for (const { clip } of clips) {
      const f = clipJobFields(clip);
      const out = clipRunOutcome({
        ok: true,
        entries: [entry("ابح1234", 3), entry("حطس5678", 6.5), entry("رني8293", 41)],
        fixes: f.fixes,
        startEpoch: f.startedAtMs,
        tookSec: 1,
        now: 0,
      });
      const n = clip.seqNo;
      const lats = out.entries.map((e) => e.pin!.lat);
      expect(lats[0]).toBeCloseTo(24 + n + 3 * 0.001, 6);
      expect(lats[1]).toBeCloseTo(24 + n + 6.5 * 0.001, 6);
      expect(lats[2]).toBeCloseTo(24 + n + 41 * 0.001, 6);
      // الوقت بتاع الدبوس = بداية المقطع ده + ثانية النطق
      expect(out.entries[0].pin!.at).toBe(clip.startEpoch + 3000);
      // مافيش ولا لوحة من مسار التسجيل اللي شغّال دلوقتي
      expect(out.entries.every((e) => (e.pin?.lat ?? 0) < 40)).toBe(true);
    }
  });

  it("المسار بيتاخد صورة وقت ما المقطع اتقفل — قرايات التسجيل الجديد مابتغيّرهوش", () => {
    const { clip, col } = recordClip(1, T0, 10);
    const before = clipJobFields(clip).fixes.length;
    col.add({ lat: 99, lng: 99, accuracy: 5, at: T0 + 20_000 }, T0 + 20_000);
    expect(clipJobFields(clip).fixes.length).toBe(before);
    expect(clipJobFields(clip).fixes.every((x) => x.lat < 30)).toBe(true);
  });

  it("لحظة نطق مالهاش قراءة قريبة (الموبايل وقف) ⇒ من غير موقع — مابنخترعش ولا بنستلف من مقطع تاني", () => {
    const { clip } = recordClip(2, T0, 10);
    const f = clipJobFields(clip);
    const out = clipRunOutcome({ ok: true, entries: [entry("ابح1234", 30)], fixes: f.fixes, startEpoch: f.startedAtMs, tookSec: 1, now: 0 });
    expect(out.entries[0].pin).toBeNull();
  });
});
