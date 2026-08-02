/**
 * إعادة تدقيق **مستقلة** لنافذة الرأي التاني بعد إصلاح التغطية.
 * =============================================================================
 * الهدف الوحيد هنا: **الدقّة**. كل حالة اتبنت عشان تحاول تخلّي نافذة مثبَتة
 * تحتوي كلام **لوحة مجاورة**، والاختبار بيقيس بالملي ثانية كم من صوت الجار جوّه
 * النافذة (المفروض صفر في كل الحالات).
 *
 * الحالات (نفس اللي التدقيق طلبها):
 *   P1  لوحة مقسومة نصّينها على جنبي لوحة **تالتة**
 *   P2  لوحتين مقسومتين ورا بعض
 *   P3  النتيجة اللي فيها النص التاني فيها كمان **حروف اللوحة اللي بعدها**
 *   P4  رسالة واحدة بلوحتين (الحزام المشيل) — نافذتين مختلفتين ومامتراكبتينش
 *   P5  اقتران غلط (لوحة مش في الكلام) = سكوت
 *   P6  نتيجة من تيار قديم جوّه التاريخ (ساعة مختلطة)
 *   P7  هل ينفع كلمة جوّه المدى تكون **بلا ذرّات** فتخبّي كلام جار؟
 */

import { describe, it, expect } from "vitest";
import {
  lastPlateWordSpan, provePlateSpanAcrossFinals, type DgWord, type DgFinal,
} from "@/lib/deepgramWords";
import { planPlateWindow, JUDGE_WORD_PAD_MS } from "@/lib/plateJudgeClient";
import { plateAtoms, normalizePlate } from "@/lib/plateParser";

// ── أدوات بناء ───────────────────────────────────────────────────────────────

/** كلمة بتوقيت بالثواني. */
function w(word: string, startS: number, endS: number): DgWord {
  return { word, start: startS, end: endS, confidence: 0.9 };
}

/**
 * بيبني نطق لوحة: كلمات بمدة ٣٠٠ms وفجوة ٥٠ms، بادئة من `t0` (ثواني).
 * بيرجّع الكلمات + نهاية آخر كلمة.
 */
function utter(tokens: string[], t0: number, dur = 0.30, gap = 0.05): { words: DgWord[]; end: number } {
  const out: DgWord[] = [];
  let t = t0;
  for (const tok of tokens) {
    out.push(w(tok, +t.toFixed(3), +(t + dur).toFixed(3)));
    t = +(t + dur + gap).toFixed(3);
  }
  return { words: out, end: +(t - gap).toFixed(3) };
}

/** المدى الصوتي (ms) اللي كلمات معيّنة بتشغله — للقياس «كم ms جار جوّه النافذة». */
function voiced(words: DgWord[]): Array<[number, number]> {
  return words.map((x) => [Math.round((x.start as number) * 1000), Math.round((x.end as number) * 1000)]);
}

/** تراكب نافذة [a,b] مع مناطق كلام (ms) — المجموع بالملي ثانية. */
function overlapMs(win: { startMs: number; endMs: number }, regions: Array<[number, number]>): number {
  let sum = 0;
  for (const [s, e] of regions) {
    const lo = Math.max(win.startMs, s), hi = Math.min(win.endMs, e);
    if (hi > lo) sum += hi - lo;
  }
  return sum;
}

/** اللوحة اللي الكلمات دي بتطلّعها (لتفادي تخمين النطق في الاختبار نفسه). */
function plateOf(tokens: string[]): string {
  const atoms = plateAtoms(tokens.join(" "));
  let letters = "", digits = "";
  for (const a of atoms) {
    if (a.t === "L") letters += a.v;
    else if (a.t === "D") digits += a.v;
  }
  return normalizePlate(letters + digits);
}

const finalOf = (words: DgWord[], prevWordEndMs: number | null): DgFinal => ({ words, prevWordEndMs });

/** نداء `planPlateWindow` بمدخل واقعي (نفس اللي الصفحة بتبعته). */
function plan(finals: DgFinal[], expect: string, emit: { index: number; count: number; fromCarry: boolean } | null) {
  const cur = finals[finals.length - 1].words;
  const ends = cur.map((x) => x.end as number).filter((x) => Number.isFinite(x));
  const starts = cur.map((x) => x.start as number).filter((x) => Number.isFinite(x));
  return planPlateWindow({
    words: cur,
    finals,
    expectPlateNorm: expect,
    prevWordEndMs: finals[finals.length - 1].prevWordEndMs,
    wordStartMs: starts.length ? Math.min(...starts) * 1000 : null,
    wordEndMs: ends.length ? Math.max(...ends) * 1000 : null,
    arrivalMs: (ends.length ? Math.max(...ends) : 0) * 1000 + 1000,
    mediaElapsedMs: (ends.length ? Math.max(...ends) : 0) * 1000 + 500,
    streamFresh: true,
    audioDrops: 0,
    pausedMs: 0,
    emit,
    timing: null,
  });
}

const LOG: string[] = [];
function log(s: string) { LOG.push(s); }

// ─────────────────────────────────────────────────────────────────────────────

describe("P1 — لوحة مقسومة نصّينها على جنبي لوحة تالتة", () => {
  // حروف دبي في النتيجة ١، لوحة حمل٥٦٧٨ كاملة في النتيجة ٢، أرقام ١٨٨٢ في ٣.
  const A_L = ["دال", "باء", "ياء"];
  const C = ["حاء", "ميم", "لام", "5", "6", "7", "8"];
  const A_D = ["1", "8", "8", "2"];

  const f1 = utter(A_L, 1.00);
  const f2 = utter(C, 2.60);
  const f3 = utter(A_D, 5.20);
  const rowPlate = plateOf([...A_L, ...A_D]);
  const thirdPlate = plateOf(C);

  it("اللوحة المستهدفة والتالتة مختلفتين فعلاً (سلامة الحالة نفسها)", () => {
    expect(rowPlate).toBe("دبي1882");
    expect(thirdPlate).toBe("حمل5678");
  });

  it("الإثبات لازم يفشل — مافيش أي طريقة تبني دبي1882 بلا ما تعدّي على حمل5678", () => {
    const finals = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000)), finalOf(f3.words, Math.round(f2.end * 1000))];
    const proof = provePlateSpanAcrossFinals(finals, rowPlate);
    log(`P1 proof(دبي1882) = ${proof === null ? "null (سكوت)" : JSON.stringify(proof.span)}`);
    expect(proof).toBeNull();
    const p = plan(finals, rowPlate, { index: 0, count: 1, fromCarry: true });
    log(`P1 planPlateWindow = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("carried_over");
  });

  it("ولا حتى بتاريخ أطول (٥ نتايج) — الجار جوّه المدى بيرمي الإثبات", () => {
    const pre = utter(["واحد", "اتنين"], 0.10);
    const finals = [
      finalOf(pre.words, null), finalOf(f1.words, Math.round(pre.end * 1000)),
      finalOf(f2.words, Math.round(f1.end * 1000)), finalOf(f3.words, Math.round(f2.end * 1000)),
    ];
    expect(provePlateSpanAcrossFinals(finals, rowPlate)).toBeNull();
  });
});

describe("P2 — لوحتين مقسومتين ورا بعض", () => {
  // f1: حروف دبي | f2: أرقام دبي + حروف رصي | f3: أرقام رصي
  const A_L = ["دال", "باء", "ياء"];
  const A_D = ["1", "8", "8", "2"];
  const B_L = ["راء", "صاد", "ياء"];
  const B_D = ["9", "0", "7", "6"];

  const f1 = utter(A_L, 1.00);                       // 1.000 → 1.650
  const f2a = utter(A_D, 2.50);                      // 2.500 → 3.900  (وقفة جوّانية 850ms)
  const f2b = utter(B_L, 4.40);                      // 4.400 → 5.050  (سكتة بين لوحتين 500ms)
  const f2 = { words: [...f2a.words, ...f2b.words], end: f2b.end };
  const f3 = utter(B_D, 5.55);                       // 5.550 → 6.950  (وقفة جوّانية 500ms)

  const plateA = plateOf([...A_L, ...A_D]);
  const plateB = plateOf([...B_L, ...B_D]);

  it("الحالة مبنية صح", () => {
    expect(plateA).toBe("دبي1882");
    expect(plateB).toBe("رصي9076");
  });

  it("نافذة اللوحة الأولى مافيهاش ولا ms من حروف اللوحة التانية", () => {
    const finals = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000))];
    const p = plan(finals, plateA, { index: 0, count: 1, fromCarry: true });
    log(`P2 نافذة ${plateA} = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const leak = overlapMs(p, voiced([...f2b.words, ...f3.words]));
    log(`P2  تسريب على ${plateA}: ${leak}ms`);
    expect(leak).toBe(0);
    // ولازم تغطّي كل صوت اللوحة نفسها
    const own = voiced([...f1.words, ...f2a.words]);
    expect(overlapMs(p, own)).toBe(own.reduce((s, [a, b]) => s + (b - a), 0));
  });

  it("نافذة اللوحة التانية مافيهاش ولا ms من أرقام اللوحة الأولى", () => {
    const finals = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000)), finalOf(f3.words, Math.round(f2.end * 1000))];
    const p = plan(finals, plateB, { index: 0, count: 1, fromCarry: true });
    log(`P2 نافذة ${plateB} = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const leak = overlapMs(p, voiced([...f1.words, ...f2a.words]));
    log(`P2  تسريب على ${plateB}: ${leak}ms`);
    expect(leak).toBe(0);
    const own = voiced([...f2b.words, ...f3.words]);
    expect(overlapMs(p, own)).toBe(own.reduce((s, [a, b]) => s + (b - a), 0));
  });

  it("النافذتين مايتراكبوش على أي صوت منطوق", () => {
    const finals2 = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000))];
    const finals3 = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000)), finalOf(f3.words, Math.round(f2.end * 1000))];
    const pa = plan(finals2, plateA, { index: 0, count: 1, fromCarry: true });
    const pb = plan(finals3, plateB, { index: 0, count: 1, fromCarry: true });
    expect(pa.ok && pb.ok).toBe(true);
    if (!pa.ok || !pb.ok) return;
    // التراكب المسموح بس في **الصمت** بين اللوحتين: أي تراكب لازم يكون بلا كلام.
    const inter = Math.min(pa.endMs, pb.endMs) - Math.max(pa.startMs, pb.startMs);
    const allVoiced = voiced([...f1.words, ...f2.words, ...f3.words]);
    const shared = { startMs: Math.max(pa.startMs, pb.startMs), endMs: Math.min(pa.endMs, pb.endMs) };
    log(`P2 تراكب النافذتين = ${Math.max(0, inter)}ms، منه كلام = ${inter > 0 ? overlapMs(shared, allVoiced) : 0}ms`);
    if (inter > 0) expect(overlapMs(shared, allVoiced)).toBe(0);
  });
});

describe("P3 — النتيجة التانية فيها كمان حروف اللوحة اللي بعدها، بسكتة ٢٥٠ms بس", () => {
  // أضيق سكتة بين لوحتين في جلسة المالك التانية = ٢٥٠ms. لازم الحدّ العلوي
  // يمنع الحشوة من دخول حروف الجار.
  const A_L = ["دال", "باء", "ياء"];
  const A_D = ["1", "8", "8", "2"];
  const B_L = ["راء", "صاد", "ياء"];

  const f1 = utter(A_L, 1.00);
  const f2a = utter(A_D, 2.50);
  const f2b = utter(B_L, +(f2a.end + 0.25).toFixed(3));   // سكتة ٢٥٠ms بس
  const f2 = { words: [...f2a.words, ...f2b.words], end: f2b.end };
  const plateA = plateOf([...A_L, ...A_D]);

  it("صفر ms من حروف الجار، والحشوة بتتصفّر بدل ما تدخل عليه", () => {
    const finals = [finalOf(f1.words, 500), finalOf(f2.words, Math.round(f1.end * 1000))];
    const p = plan(finals, plateA, { index: 0, count: 1, fromCarry: true });
    log(`P3 نافذة ${plateA} = ${JSON.stringify(p)} (سكتة ٢٥٠ms)`);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(overlapMs(p, voiced(f2b.words))).toBe(0);
    // النهاية = نهاية آخر رقم بالظبط (الحشوة اتصفّرت: 250 − 250 = 0)
    expect(p.endMs).toBe(Math.round(f2a.end * 1000));
  });
});

describe("P4 — رسالة واحدة بلوحتين (الحزام المشيل)", () => {
  const A = ["كاف", "هاء", "طاء", "5", "2", "5", "1"];
  const B = ["باء", "دال", "كاف", "1", "5", "8", "8"];
  const ua = utter(A, 1.00);                                  // 1.000 → 3.450
  const ub = utter(B, +(ua.end + 0.46).toFixed(3));           // سكتة ٤٦٠ms (أضيق مقيس)
  const words = [...ua.words, ...ub.words];
  const plateA = plateOf(A), plateB = plateOf(B);

  it("الحالة مبنية صح", () => {
    expect(plateA).toBe("كهط5251");
    expect(plateB).toBe("بدك1588");
  });

  it("نافذتين **مختلفتين**، كل واحدة متحقَّقة ضد لوحة صفّها، وبلا تسريب", () => {
    const finals = [finalOf(words, 500)];
    const pa = plan(finals, plateA, { index: 0, count: 2, fromCarry: false });
    const pb = plan(finals, plateB, { index: 1, count: 2, fromCarry: false });
    log(`P4 ${plateA} = ${JSON.stringify(pa)}`);
    log(`P4 ${plateB} = ${JSON.stringify(pb)}`);
    expect(pa.ok).toBe(true);
    expect(pb.ok).toBe(true);
    if (!pa.ok || !pb.ok) return;
    expect(pa.startMs).not.toBe(pb.startMs);
    expect(pa.endMs).not.toBe(pb.endMs);
    expect(overlapMs(pa, voiced(ub.words))).toBe(0);
    expect(overlapMs(pb, voiced(ua.words))).toBe(0);
    // ولا تراكب على أي كلام
    const shared = { startMs: Math.max(pa.startMs, pb.startMs), endMs: Math.min(pa.endMs, pb.endMs) };
    if (shared.endMs > shared.startMs) expect(overlapMs(shared, voiced(words))).toBe(0);
    log(`P4 تراكب = ${Math.max(0, shared.endMs - shared.startMs)}ms (كله صمت)`);
  });

  it("اقتران غلط مرفوض: لوحة مش في الكلام = سكوت", () => {
    const finals = [finalOf(words, 500)];
    const p = plan(finals, "زهط5251", { index: 0, count: 2, fromCarry: false });
    log(`P4 اقتران غلط (زهط5251) = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("multi_plate_message");
  });

  it("خلط الأرقام مرفوض: كهط١٥٨٨ (حروف من دي وأرقام من التانية) = سكوت", () => {
    const finals = [finalOf(words, 500)];
    const p = plan(finals, "كهط1588", { index: 0, count: 2, fromCarry: false });
    log(`P4 خلط (كهط1588) = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(false);
  });

  it("الصف التاني برضه ممنوع من نوافذ الرسالة لو الإثبات فشل", () => {
    // كلمات بلا توقيت ⇒ الإثبات مستحيل ⇒ ممنوع الرجوع لنافذة min/max.
    const noTime: DgWord[] = words.map((x) => ({ word: x.word }));
    const p = planPlateWindow({
      words: noTime, finals: [finalOf(noTime, null)], expectPlateNorm: plateB,
      wordStartMs: 1000, wordEndMs: 6000, arrivalMs: 7000, mediaElapsedMs: 6500,
      streamFresh: true, audioDrops: 0, pausedMs: 0,
      emit: { index: 1, count: 2, fromCarry: false }, timing: { startMs: 0, endMs: 9000 },
    });
    log(`P4 بلا توقيت (صف ٢) = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(false);
  });
});

describe("P6 — نتيجة من تيار قديم جوّه التاريخ (ساعة مختلطة)", () => {
  const A_L = ["دال", "باء", "ياء"];
  const A_D = ["1", "8", "8", "2"];

  it("الاتجاه الواقعي (ساعة جديدة بتبدأ من الصفر) = مرفوض", () => {
    const stale = utter(A_L, 12.00);           // تيار قديم، ثانية ١٢
    const fresh = utter(A_D, 0.40);            // تيار جديد، ثانية ٠٫٤
    const finals = [finalOf(stale.words, null), finalOf(fresh.words, null)];
    const proof = provePlateSpanAcrossFinals(finals, plateOf([...A_L, ...A_D]));
    log(`P6 اتجاه واقعي = ${proof === null ? "null (مرفوض بفحص التزايد)" : JSON.stringify(proof.span)}`);
    expect(proof).toBeNull();
  });

  it("الاتجاه المعاكس **موسوم** (زي ما الصفحة بتبعته دلوقتي) = سكوت", () => {
    const stale = utter(A_L, 0.40);
    const fresh = utter(A_D, 1.60);
    const finals: DgFinal[] = [
      { words: stale.words, prevWordEndMs: null, streamFresh: false },
      { words: fresh.words, prevWordEndMs: null, streamFresh: true },
    ];
    const expectP = plateOf([...A_L, ...A_D]);
    expect(provePlateSpanAcrossFinals(finals, expectP)).toBeNull();
    const p = plan(finals, expectP, { index: 0, count: 1, fromCarry: true });
    log(`P6 موسوم = ${JSON.stringify(p)}`);
    expect(p.ok).toBe(false);
  });

  it("⚠️ الاتجاه المعاكس **بلا وسم** — الثقب اللي كان: الإثبات بيعدّي", () => {
    // إعادة اتصال في أول ٠٫٩ث من التيار القديم؛ النتيجة القديمة (٠٫٤٠–١٫٠٥)
    // بتوصل متأخّرة بعد ما التيار الجديد وصل ١٫٥ث ⇒ التوقيت **متزايد** فبيعدّي.
    const stale = utter(A_L, 0.40);            // تيار قديم: 0.400 → 1.050
    const fresh = utter(A_D, 1.60);            // تيار جديد: 1.600 → 3.000
    const finals = [finalOf(stale.words, null), finalOf(fresh.words, null)];
    const expectP = plateOf([...A_L, ...A_D]);
    const proof = provePlateSpanAcrossFinals(finals, expectP);
    log(`P6 اتجاه معاكس = ${proof === null ? "null" : JSON.stringify(proof.span)}`);
    const p = plan(finals, expectP, { index: 0, count: 1, fromCarry: true });
    log(`P6 نافذة = ${JSON.stringify(p)}`);
    // ده توثيق للثقب، مش قبول له: الاختبار بيسجّل السلوك الحالي.
    expect(proof).not.toBeNull();
    expect(p.ok).toBe(true);
    if (p.ok) log(`P6 صوت مش تبع اللوحة جوّه النافذة ≈ ${1600 - 1050}ms (فجوة تيار)`);
  });
});

describe("P7 — هل ينفع كلمة جوّه المدى تكون بلا ذرّات فتخبّي كلام جار؟", () => {
  it("كل كلمة معقولة بتطلّع ذرّة واحدة على الأقل — فمافيش كلام مخفي", () => {
    const samples = [
      "والله", "يمين", "يسار", "جراج", "ونيت", "تحت", "العمارة", "كمان", "خلاص",
      "دال", "باء", "1", "8", "الشارع", "اللي", "جنب", "المحل", "طيب", "اه",
      "هه", "ألف", "خمسمية", "وتمانين", "مية", "عشرة", "صفر", "زيرو",
    ];
    const empty = samples.filter((s) => plateAtoms(s).length === 0);
    log(`P7 كلمات بلا ذرّات من ${samples.length}: ${JSON.stringify(empty)}`);
    expect(empty).toEqual([]);
  });

  it("الكلمات الوحيدة اللي بتختفي: الواو الرابطة بين أرقام، والترقيم لوحده", () => {
    // الواو بين أرقام بتتشال في Step 2.5 — ٢٠٠ms تقريباً، مش لوحة.
    expect(plateAtoms("1 و 2").map((a) => a.t).join("")).toBe("DD");
    // ترقيم لوحده = صفر ذرّات (Deepgram مابيرجّعش كلمات ترقيم لوحدها عملياً).
    expect(plateAtoms("،").length).toBe(0);
  });

  it("لوحة جار كاملة جوّه المدى **مستحيل** تختفي: بتطلّع ذرّات فبتكسر الإثبات", () => {
    const A_L = ["دال", "باء", "ياء"], A_D = ["1", "8", "8", "2"];
    const noise = ["والله", "يمين", "تحت", "العمارة"];       // كلام مش لوحة
    const f1 = utter(A_L, 1.00);
    const fN = utter(noise, 2.00);
    const f2 = utter(A_D, 3.50);
    const finals = [finalOf(f1.words, 500), finalOf([...fN.words, ...f2.words], Math.round(f1.end * 1000))];
    const proof = provePlateSpanAcrossFinals(finals, plateOf([...A_L, ...A_D]));
    log(`P7 ضجيج جوّه المدى = ${proof === null ? "null (ذرّات N كسرت الإثبات)" : JSON.stringify(proof.span)}`);
    expect(proof).toBeNull();
  });
});

describe("سلامة المسار الأحادي (path A) — مالمسوش", () => {
  it("lastPlateWordSpan لسه بترجّع null على أي مادة لوحة زايدة في الآخر", () => {
    const u = utter(["كاف", "هاء", "طاء", "5", "2", "5", "1", "باء"], 1.00);
    expect(lastPlateWordSpan(u.words, "كهط5251")).toBeNull();
  });
  it("وبترجّع المدى لما اللوحة هي آخر حاجة", () => {
    const u = utter(["كاف", "هاء", "طاء", "5", "2", "5", "1"], 1.00);
    const sp = lastPlateWordSpan(u.words, "كهط5251");
    expect(sp).not.toBeNull();
    expect(sp!.startMs).toBe(1000);
  });
  it("الحشوة ٢٥٠ms على الجنبين زي ما هي", () => {
    expect(JUDGE_WORD_PAD_MS).toBe(250);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// نقاء غير-الطيّار + ثبات نافذة التدريب — فحص على المصدر نفسه
// ─────────────────────────────────────────────────────────────────────────────

describe("نقاء غير-الطيّار", () => {
  function page(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("node:fs").readFileSync("app/(app)/instant-check/page.tsx", "utf8");
  }

  it("مودولات الطيّار كلها `await import` جوّه فرع المالك، مش import ساكن", () => {
    const src = page();
    for (const m of ["plateJudgeClient", "plateFusion", "plateJudgeLog"]) {
      // `import type` مسموح (بيتمحي وقت الترجمة، مافيش chunk). أي import
      // **قيمة** ساكن = المودول بيتحمّل على جهاز كل مندوب.
      const stat = [...src.matchAll(new RegExp(`^import (.*)from "@/lib/${m}"`, "gm"))];
      for (const hit of stat) expect(hit[1], `${m}: ${hit[0]}`).toMatch(/^type /);
      expect(src, m).toMatch(new RegExp(`import\\("@/lib/${m}"\\)`));
    }
    // والأبواب التلاتة قبل التسليح
    expect(src).toMatch(/if \(!isPilotOwner\(uid\)\) return;/);
    expect(src).toMatch(/if \(!\(await fetchPlateJudgeEnabled\(\)\)\) return;/);
  });

  it("تاريخ النتايج بيتكتب **جوّه** `if (judgeArmedRef.current)` بس", () => {
    const src = page();
    const at = src.indexOf("judgeFinalsRef.current;");
    expect(at).toBeGreaterThan(0);
    // أقرب فتحة فرع قبله لازم تكون فرع التسليح
    const before = src.slice(Math.max(0, at - 1200), at);
    expect(before).toMatch(/if \(judgeArmedRef\.current\) \{/);
    // والنتيجة بتتوسم ببصمة التيار (وإلا نتيجة من سوكيت قديم تدخل التاريخ)
    expect(src).toMatch(/streamFresh: dgStreamSeqRef\.current === streamSeq,\s*\}\);/);
  });

  it("`requestSecondOpinion` بيخرج فوراً لو مش مسلَّح", () => {
    expect(page()).toMatch(/if \(!judgeArmedRef\.current \|\| !mods \|\| !owner\) return;/);
  });
});

describe("نافذة التدريب زي ما هي بالحرف", () => {
  it("الصف لسه بياخد `startMs/endMs/wordConfidenceOk` من `curTimingRef` وحده", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("node:fs").readFileSync("app/(app)/instant-check/page.tsx", "utf8") as string;
    expect(src).toMatch(/startMs: curTimingRef\.current\?\.startMs,/);
    expect(src).toMatch(/endMs: curTimingRef\.current\?\.endMs,/);
    expect(src).toMatch(/wordConfidenceOk: curTimingRef\.current\?\.confOk \?\? false,/);
    // والحشوة ٣ث بتاعة التدريب لسه هي هي — والطيّار مابيقراهاش
    expect(src).toMatch(/startMs: Math\.max\(0, nowMs - durMs - 3000\),/);
    expect(src).toMatch(/endMs: nowMs \+ 500,/);
    // ولا حرف من الطيّار بيكتب في `curTimingRef`
    const writes = src.match(/curTimingRef\.current = /g) ?? [];
    // النافذة الواسعة · احتياطي توقيت Deepgram · تصفير بلا كلمات · تصفير الجلسة
    expect(writes.length).toBe(4);
  });
});

describe("طبع كل النوافذ المقيسة", () => {
  it("سجل", () => {
    // eslint-disable-next-line no-console
    console.log("\n===== AUDIT WINDOWS =====\n" + LOG.join("\n") + "\n=========================\n");
    expect(LOG.length).toBeGreaterThan(0);
  });
});
