import { describe, it, expect } from "vitest";
import {
  fusePlate,
  isCanonicalPlate,
  decideJudgeAlertAction,
  type FusionInput,
  type FusionResult,
  type FusionSource,
  type JudgeAlertAction,
  type JudgeAlertTransition,
} from "@/lib/plateFusion";
import { normalizePlate } from "@/lib/plateParser";

// ─────────────────────────────────────────────────────────────────────────────
// دمج قرار موديلنا (whisper-plates) مع تفريغ Deepgram — منطق نقي بلا I/O.
//
// كل الأرقام تحت **مقيسة** على ١٢٠ مقطع ميداني محتجَز (وثّقناها في المهمة):
//   موديلنا      ١١٥/١٢٠ = ٩٥٫٨٪   (CER ٠٫٨٪)
//   Deepgram     ٩٨/١٢٠  = ٨١٧٪ (بإعداد الإنتاج)   McNemar p = 7.6e-5
//   النتائج المزدوجة: الاتنين صح ٩٧ · موديلنا لوحده ١٨ · Deepgram لوحده ١ · ولا واحد ٤
//
// الخلاصة اللي المنطق ده مبني عليها: الدمج **مش** بيرفع الدقة (السقف ١١٦/١٢٠)،
// قيمته إنه بيقيس **اليقين**: لما المحرّكين يتفقوا (٩٨/١٢٠ = ٨١٫٧٪ من الحالات)
// الجواب صح ٩٩٫٠٪ من الوقت، و٤ من أخطائنا الـ٥ الباقية واقعين جوّه الـ٢٢ اختلاف.
// عشان كده: الاتفاق = مافيش مراجعة · أي اختلاف = مراجعة.
// ─────────────────────────────────────────────────────────────────────────────

/** إدخال مختصر: موديلنا مقبول من البوابة. */
function ours(plate: string | null | undefined, accepted = true): FusionInput["ours"] {
  return { plate, accepted, reason: accepted ? "ok" : "low_mean_logprob", meanLogprob: accepted ? -0.11 : -0.72 };
}

/** أخطاء موديلنا الـ٥ المقيسة على الـ١٢٠ مقطع: (الحقيقة → اللي موديلنا قاله). */
const MEASURED_OUR_ERRORS: { gold: string; ourGuess: string }[] = [
  { gold: "بطم5355", ourGuess: "طم5355" },   // حرف ضايع → الشكل مكسور
  { gold: "ادب2181", ourGuess: "ددب2181" },  // ا → د
  { gold: "حبل5818", ourGuess: "حكل5818" },  // ب → ك
  { gold: "حده1325", ourGuess: "ررا1325" },  // انهيار كامل للحروف
  { gold: "حبل6881", ourGuess: "حبل6821" },  // خطأ رقم: 8 → 2
];

describe("isCanonicalPlate — شكل اللوحة السعودية (٣ حروف من المجموعة المغلقة + ٤ أرقام)", () => {
  it("يقبل اللوحة السليمة", () => {
    expect(isCanonicalPlate("ابح1234")).toBe(true);
    expect(isCanonicalPlate("حبل6881")).toBe(true);
  });

  it("يرفض عدد حروف/أرقام غلط", () => {
    expect(isCanonicalPlate("طم5355")).toBe(false);    // حرفين بس
    expect(isCanonicalPlate("ابحد1234")).toBe(false);  // ٤ حروف
    expect(isCanonicalPlate("ابح12345")).toBe(false);  // ٥ أرقام
    expect(isCanonicalPlate("1234")).toBe(false);      // بلا حروف
    expect(isCanonicalPlate("ابح")).toBe(false);       // بلا أرقام
    expect(isCanonicalPlate("")).toBe(false);
  });

  it("يرفض حرف مش من حروف اللوحات المعتمدة", () => {
    expect(isCanonicalPlate("خزغ1234")).toBe(false);
  });

  it("بيطبّع قبل الفحص: تطويل وهمزة وأرقام عربية", () => {
    expect(isCanonicalPlate("دمهـ4420")).toBe(true);
    expect(isCanonicalPlate("أبح1234")).toBe(true);
    expect(isCanonicalPlate("ابح١٢٣٤")).toBe(true);
  });
});

// ─── جدول القرار — صف بصف ────────────────────────────────────────────────────

describe("جدول القرار: الاتنين موجودين ومتطابقين بعد التطبيع → agree", () => {
  it("اتفاق تام → agree, needsReview=false", () => {
    const r = fusePlate({ deepgramPlate: "ابح1234", ours: ours("ابح1234") });
    expect(r.source).toBe<FusionSource>("agree");
    expect(r.plate).toBe("ابح1234");
    expect(r.needsReview).toBe(false);
    expect(r.reason).toBe("agree");
    expect(r.agreed).toBe(true);
  });

  it("الاتفاق هو الحالة الوحيدة اللي تخرج بلا مراجعة (٩٩٫٠٪ صح على ٩٨/١٢٠ مقطع)", () => {
    const r = fusePlate({ deepgramPlate: "حبل6881", ours: ours("حبل6881") });
    expect(r.needsReview).toBe(false);
  });

  it("المقارنة بالتطبيع لا بالنص الخام: التطويل مش اختلاف (دمهـ4420 = دمه4420)", () => {
    // الباج ده لوحده ضيّع ٥ مقاطع في قياس أسبق — المقارنة كانت === على النص الخام.
    const r = fusePlate({ deepgramPlate: "دمهـ4420", ours: ours("دمه4420") });
    expect(r.source).toBe<FusionSource>("agree");
    expect(r.needsReview).toBe(false);
    expect(r.plate).toBe("دمه4420");
    // والاتجاه المعاكس كذلك
    expect(fusePlate({ deepgramPlate: "دمه4420", ours: ours("دمهـ4420") }).source).toBe("agree");
  });

  it("الهمزة والأرقام العربية والمسافات مش اختلاف", () => {
    expect(fusePlate({ deepgramPlate: "أ ب ح 1234", ours: ours("ابح1234") }).source).toBe("agree");
    expect(fusePlate({ deepgramPlate: "ابح١٢٣٤", ours: ours("ابح1234") }).source).toBe("agree");
    expect(fusePlate({ deepgramPlate: "إبح-1234", ours: ours("ابح1234") }).source).toBe("agree");
  });

  it("النصّان الأصليان بيرجعا زي ما هما عشان الواجهة تعرض الاتنين", () => {
    const r = fusePlate({ deepgramPlate: "دمهـ4420", ours: ours("دمه4420") });
    expect(r.deepgramPlate).toBe("دمهـ4420");
    expect(r.oursPlate).toBe("دمه4420");
  });
});

describe("جدول القرار: الاتنين موجودين ومختلفين → ours + مراجعة", () => {
  it("اختلاف → نأخذ موديلنا ونعلّم مراجعة", () => {
    const r = fusePlate({ deepgramPlate: "حكل5818", ours: ours("حبل5818") });
    expect(r.source).toBe<FusionSource>("ours");
    expect(r.plate).toBe("حبل5818");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("disagree_prefer_ours");
    expect(r.agreed).toBe(false);
  });

  it("مبرَّر بالقياس: موديلنا لوحده صح ١٨ مقطع مقابل Deepgram لوحده ١", () => {
    // ١٨ مقابل ١ ⇒ ترجيح موديلنا في كل اختلاف هو الاختيار الرابح ١٨:١.
    const oursOnlyWins = 18, dgOnlyWins = 1;
    expect(oursOnlyWins).toBeGreaterThan(dgOnlyWins);
    const r = fusePlate({ deepgramPlate: "ابح1234", ours: ours("حبل6881") });
    expect(r.source).toBe("ours");
  });
});

describe("جدول القرار: موديلنا مقبول و Deepgram فاضي → ours + مراجعة", () => {
  it("Deepgram فاضي", () => {
    for (const dg of ["", "   ", null, undefined]) {
      const r = fusePlate({ deepgramPlate: dg as string, ours: ours("ابح1234") });
      expect(r.source).toBe<FusionSource>("ours");
      expect(r.plate).toBe("ابح1234");
      expect(r.needsReview).toBe(true);
      expect(r.reason).toBe("deepgram_empty_use_ours");
    }
  });

  it("Deepgram نصّ بلا لوحة (مايطبّعش لحاجة) = فاضي", () => {
    const r = fusePlate({ deepgramPlate: "مش عارف والله", ours: ours("ابح1234") });
    expect(r.source).toBe("ours");
    expect(r.reason).toBe("deepgram_empty_use_ours");
  });
});

describe("جدول القرار: موديلنا مرفوض من البوابة و Deepgram موجود → deepgram + مراجعة", () => {
  it("البوابة رفضت (ثقة واطية) → نرجع لـDeepgram", () => {
    const r = fusePlate({ deepgramPlate: "ابح1234", ours: ours("حبل6821", false) });
    expect(r.source).toBe<FusionSource>("deepgram");
    expect(r.plate).toBe("ابح1234");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("ours_unusable_use_deepgram");
  });

  it("مافيش قرار بوابة خالص (accepted غايب) → نعتبره مرفوض (فشل مغلق = سلوك النهاردة)", () => {
    const r = fusePlate({ deepgramPlate: "ابح1234", ours: { plate: "حبل6821" } });
    expect(r.source).toBe("deepgram");
    expect(r.reason).toBe("ours_unusable_use_deepgram");
  });
});

describe("جدول القرار: موديلنا مرفوض و Deepgram فاضي → none + مراجعة", () => {
  it("مافيش أي مرشّح → none واللوحة فاضية (اطلب من المندوب يكرّر)", () => {
    const r = fusePlate({ deepgramPlate: "", ours: ours("حبل6821", false) });
    expect(r.source).toBe<FusionSource>("none");
    expect(r.plate).toBe("");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("both_unavailable");
  });

  it("الاتنين فاضيين خالص → none", () => {
    const r = fusePlate({ deepgramPlate: null, ours: ours(null) });
    expect(r.source).toBe("none");
    expect(r.plate).toBe("");
    expect(r.needsReview).toBe(true);
  });
});

describe("جدول القرار: موديلنا موجود بس شكله مكسور → يُعتبر غير موجود", () => {
  it("حرفين بس (طم5355) وDeepgram موجود → deepgram", () => {
    const r = fusePlate({ deepgramPlate: "بطم5355", ours: ours("طم5355") });
    expect(r.source).toBe<FusionSource>("deepgram");
    expect(r.plate).toBe("بطم5355");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("ours_unusable_use_deepgram");
    expect(r.oursUsable).toBe(false);
  });

  it("شكل مكسور و Deepgram فاضي → none", () => {
    const r = fusePlate({ deepgramPlate: "", ours: ours("ابحد1234") });
    expect(r.source).toBe("none");
    expect(r.plate).toBe("");
  });

  it("كل أشكال الكسر تُعتبر غير موجودة، مهما كانت البوابة قالت accepted", () => {
    for (const bad of ["طم5355", "ابحد1234", "ابح12345", "1234", "ابح", "خزغ1234", "ABC1234"]) {
      const r = fusePlate({ deepgramPlate: "ابح1234", ours: ours(bad) });
      expect(r.oursUsable, bad).toBe(false);
      expect(r.source, bad).toBe("deepgram");
    }
  });

  it("Deepgram مكسور الشكل بيفضل مقبول — ده سلوك النهاردة بالحرف", () => {
    // ملف الحكم (judge) إضافي: أسوأ حالة لازم تساوي النهاردة، والنهاردة صف
    // Deepgram بيخرج من parsePlateFromTranscript بلا فلتر شكل هنا.
    const r = fusePlate({ deepgramPlate: "اب12", ours: ours(null) });
    expect(r.source).toBe("deepgram");
    expect(r.plate).toBe(normalizePlate("اب12"));
  });
});

// ─── قاعدة «واحد بس على شيت التشييك» ─────────────────────────────────────────
//
// المبرّر من القياس: في الـ٢٢ اختلاف، موديلنا صح في ١٨ وDeepgram صح في ١.
// أي قاعدة ترجيح لازم **ماتقدرش** تشيل جواب صح. الشيت هو الدليل الخارجي الوحيد
// المتاح وقت التنفيذ، والقاعدة بتشتغل **بس** لما واحد بالظبط عضو في الشيت —
// فلو موديلنا صح وموجود بالشيت مافيش حاجة بتتغيّر، ولو موديلنا صح ومش بالشيت
// وDeepgram كذلك (تعادل «ولا واحد») برضه مافيش حاجة بتتغيّر. النتيجة إن القاعدة
// تقدر تكسب الاختلاف الوحيد اللي Deepgram كان صح فيه بلا ما تخسر أي من الـ١٨.
describe("قاعدة الشيت: عند الاختلاف، لو واحد بالظبط على شيت التشييك نرجّحه", () => {
  const sheet = (members: string[]) => (p: string) => members.includes(p);

  it("موديلنا بس على الشيت → ours بسبب الشيت", () => {
    const r = fusePlate({
      deepgramPlate: "حكل5818",
      ours: ours("حبل5818"),
      onCheckSheet: sheet(["حبل5818"]),
    });
    expect(r.source).toBe<FusionSource>("ours");
    expect(r.plate).toBe("حبل5818");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("disagree_sheet_prefers_ours");
  });

  it("Deepgram بس على الشيت → deepgram بسبب الشيت", () => {
    const r = fusePlate({
      deepgramPlate: "حبل5818",
      ours: ours("حكل5818"),
      onCheckSheet: sheet(["حبل5818"]),
    });
    expect(r.source).toBe<FusionSource>("deepgram");
    expect(r.plate).toBe("حبل5818");
    expect(r.needsReview).toBe(true);
    expect(r.reason).toBe("disagree_sheet_prefers_deepgram");
  });

  it("تعادل — الاتنين على الشيت → القاعدة ماتشتغلش، نرجع لموديلنا", () => {
    const r = fusePlate({
      deepgramPlate: "حكل5818",
      ours: ours("حبل5818"),
      onCheckSheet: sheet(["حبل5818", "حكل5818"]),
    });
    expect(r.source).toBe("ours");
    expect(r.reason).toBe("disagree_prefer_ours");
  });

  it("تعادل — ولا واحد على الشيت → القاعدة ماتشتغلش، نرجع لموديلنا", () => {
    const r = fusePlate({
      deepgramPlate: "حكل5818",
      ours: ours("حبل5818"),
      onCheckSheet: sheet([]),
    });
    expect(r.source).toBe("ours");
    expect(r.reason).toBe("disagree_prefer_ours");
  });

  it("الدالة مش مبعوتة → القاعدة ماتشتغلش أبداً", () => {
    const r = fusePlate({ deepgramPlate: "حكل5818", ours: ours("حبل5818") });
    expect(r.reason).toBe("disagree_prefer_ours");
    expect(fusePlate({ deepgramPlate: "حكل5818", ours: ours("حبل5818"), onCheckSheet: null }).reason)
      .toBe("disagree_prefer_ours");
    expect(fusePlate({ deepgramPlate: "حكل5818", ours: ours("حبل5818"), onCheckSheet: undefined }).reason)
      .toBe("disagree_prefer_ours");
  });

  it("القاعدة ماتشتغلش على الاتفاق (ولا بتنادي الدالة أصلاً)", () => {
    let calls = 0;
    const r = fusePlate({
      deepgramPlate: "ابح1234",
      ours: ours("ابح1234"),
      onCheckSheet: () => { calls++; return true; },
    });
    expect(r.source).toBe("agree");
    expect(r.reason).toBe("agree");
    expect(calls).toBe(0);
  });

  it("القاعدة ماتشتغلش لما واحد بس موجود (مافيش اختلاف يتحكم فيه)", () => {
    let calls = 0;
    const cb = () => { calls++; return true; };
    expect(fusePlate({ deepgramPlate: "", ours: ours("ابح1234"), onCheckSheet: cb }).reason)
      .toBe("deepgram_empty_use_ours");
    expect(fusePlate({ deepgramPlate: "ابح1234", ours: ours("ابح1234", false), onCheckSheet: cb }).reason)
      .toBe("ours_unusable_use_deepgram");
    expect(calls).toBe(0);
  });

  it("الدالة بتطبّع قبل السؤال — الشيت مطبّع", () => {
    const r = fusePlate({
      deepgramPlate: "حكل5818",
      ours: ours("حبـل5818"),                // فيه تطويل
      onCheckSheet: sheet(["حبل5818"]),      // الشيت بلا تطويل
    });
    expect(r.source).toBe("ours");
    expect(r.reason).toBe("disagree_sheet_prefers_ours");
  });

  it("لو الدالة رمت استثناء → نتجاهلها بصمت ونرجع لموديلنا (مسار الصوت ماينكسرش)", () => {
    const r = fusePlate({
      deepgramPlate: "حكل5818",
      ours: ours("حبل5818"),
      onCheckSheet: () => { throw new Error("boom"); },
    });
    expect(r.source).toBe("ours");
    expect(r.reason).toBe("disagree_prefer_ours");
  });
});

// ─── الحالات المقيسة فعلاً على الـ١٢٠ مقطع ───────────────────────────────────

describe("مرسّى في الواقع: أخطاء موديلنا الـ٥ المقيسة على الـ١٢٠ مقطع", () => {
  it("الخطأ ١ — بطم5355 → طم5355: حرف ضايع فالشكل مكسور، فالبوابة تسقطه وDeepgram يكسب المقطع", () => {
    const { gold, ourGuess } = MEASURED_OUR_ERRORS[0];
    const r = fusePlate({ deepgramPlate: gold, ours: ours(ourGuess) });
    expect(r.source).toBe("deepgram");
    expect(r.plate).toBe(gold);          // اللوحة الصح
    expect(r.needsReview).toBe(true);
  });

  it("الأخطاء ٢..٥ — الشكل سليم بس الحروف/الأرقام غلط → اختلاف، ours + مراجعة", () => {
    for (const { gold, ourGuess } of MEASURED_OUR_ERRORS.slice(1)) {
      const r = fusePlate({ deepgramPlate: gold, ours: ours(ourGuess) });
      expect(r.source, ourGuess).toBe("ours");
      expect(r.plate, ourGuess).toBe(ourGuess);   // بناخد الغلط عن قصد…
      expect(r.needsReview, ourGuess).toBe(true); // …بس المندوب يشوف علامة المراجعة
      expect(r.deepgramPlate, ourGuess).toBe(gold);
      expect(r.oursPlate, ourGuess).toBe(ourGuess);
    }
  });

  it("الأخطاء ٢..٥ — الشيت يصلّحها كلها لما الحقيقة بس هي اللي على الشيت", () => {
    for (const { gold, ourGuess } of MEASURED_OUR_ERRORS.slice(1)) {
      const r = fusePlate({
        deepgramPlate: gold,
        ours: ours(ourGuess),
        onCheckSheet: (p) => p === normalizePlate(gold),
      });
      expect(r.source, ourGuess).toBe("deepgram");
      expect(r.plate, ourGuess).toBe(gold);
      expect(r.reason, ourGuess).toBe("disagree_sheet_prefers_deepgram");
    }
  });

  it("المقطع الوحيد اللي Deepgram لوحده جابه صح (١/١٢٠) — بنخسره عن قصد، والشيت يرجّعه", () => {
    // القياس سجّل العدد (١) مش هوية المقطع؛ وبالتعريف هو واحد من أخطائنا الـ٥
    // الواقعة جوّه الـ٢٢ اختلاف، فبناخد واحد منها كنموذج بنيوي.
    const { gold, ourGuess } = MEASURED_OUR_ERRORS[1];   // ادب2181 / ددب2181
    const lost = fusePlate({ deepgramPlate: gold, ours: ours(ourGuess) });
    expect(lost.source).toBe("ours");
    expect(lost.plate).toBe("ددب2181");
    expect(lost.needsReview).toBe(true);   // التكلفة مرئية للمندوب، مش مسكوت عنها
    const rescued = fusePlate({
      deepgramPlate: gold, ours: ours(ourGuess),
      onCheckSheet: (p) => p === "ادب2181",
    });
    expect(rescued.source).toBe("deepgram");
    expect(rescued.plate).toBe("ادب2181");
  });

  it("الخطأ الخامس المتخفّي جوّه مجموعة الاتفاق (المتبقّي ١٪ من ٩٨ اتفاق) → agree بلا مراجعة", () => {
    // ٩٨ اتفاق × ٩٩٫٠٪ صح ≈ خطأ واحد جوّه الاتفاق. ده بالتعريف مايتصادش:
    // المحرّكان غلطوا نفس الغلط، فمافيش أي إشارة تفرّق.
    const { ourGuess } = MEASURED_OUR_ERRORS[3];   // ررا1325
    const r = fusePlate({ deepgramPlate: ourGuess, ours: ours(ourGuess) });
    expect(r.source).toBe("agree");
    expect(r.needsReview).toBe(false);
  });

  it("٩٧ مقطع «الاتنين صح» → كلها agree بلا مراجعة", () => {
    for (const gold of ["ابح1234", "دمه4420", "حبل5818", "حده1325", "بطم5355"]) {
      const r = fusePlate({ deepgramPlate: gold, ours: ours(gold) });
      expect(r.source, gold).toBe("agree");
      expect(r.needsReview, gold).toBe(false);
      expect(r.plate, gold).toBe(gold);
    }
  });

  it("٤ مقاطع «ولا واحد صح» → اختلاف فبتخرج بمراجعة (بتتصاد وإن ماتصلّحتش)", () => {
    const r = fusePlate({ deepgramPlate: "حكل5818", ours: ours("حبل6821") });
    expect(r.needsReview).toBe(true);
    expect(r.source).toBe("ours");
  });
});

// ─── اختبار الخصائص (property) على مجموعة مولَّدة ─────────────────────────────

describe("خصائص الدالة على مجموعة مولَّدة", () => {
  const CANDIDATES: (string | null | undefined)[] = [
    null, undefined, "", "   ",
    "ابح1234", "أبح1234", "ابح١٢٣٤", "دمهـ4420", "دمه4420",
    "طم5355", "ررا1325", "حبل6821", "حبل6881",
    "ابح12345", "اب12", "ابحد1234", "1234", "ابح", "ABC1234", "خزغ1234",
  ];

  const SHEETS: (((p: string) => boolean) | null | undefined)[] = [
    undefined,
    null,
    () => true,
    () => false,
    (p: string) => p === "ابح1234",
    (p: string) => { throw new Error("sheet exploded"); },
  ];

  const ACCEPTED = [true, false];

  const SOURCES: FusionSource[] = ["agree", "ours", "deepgram", "none"];

  function* corpus() {
    for (const o of CANDIDATES)
      for (const d of CANDIDATES)
        for (const acc of ACCEPTED)
          for (const sheet of SHEETS)
            yield { o, d, acc, sheet };
  }

  it("حجم المجموعة معروف ومعلَن", () => {
    expect(CANDIDATES.length).toBe(20);
    expect(SHEETS.length).toBe(6);
    expect([...corpus()].length).toBe(20 * 20 * 2 * 6);
    expect([...corpus()].length).toBe(4800);
  });

  it("كل الخصائص على ٤٨٠٠ حالة: اللوحة المختارة مرشّح، لا مراجعة إلا مع الاتفاق، وحتمية، وبلا تعديل للإدخال", () => {
    let n = 0;
    const seenSources = new Set<FusionSource>();
    const seenReasons = new Set<string>();

    for (const { o, d, acc, sheet } of corpus()) {
      const build = (): FusionInput => {
        const oursObj = Object.freeze({ plate: o, accepted: acc, reason: "ok", meanLogprob: -0.1 });
        return Object.freeze({ deepgramPlate: d, ours: oursObj, onCheckSheet: sheet }) as FusionInput;
      };
      const input = build();
      const r: FusionResult = fusePlate(input);
      n++;

      const oursNorm = normalizePlate(o ?? "");
      const dgNorm = normalizePlate(d ?? "");

      // ١. اللوحة المختارة لازم تكون أحد المرشّحين (مطبّعاً)، أو فاضية مع none.
      expect([oursNorm, dgNorm, ""], `chosen ∉ candidates for ${o} / ${d}`).toContain(r.plate);
      if (r.source === "none") expect(r.plate).toBe("");
      else expect(r.plate).not.toBe("");
      if (r.source === "ours" || r.source === "agree") expect(r.plate).toBe(oursNorm);
      if (r.source === "deepgram") expect(r.plate).toBe(dgNorm);

      // ٢. مافيش needsReview=false إلا لو source==='agree'.
      if (!r.needsReview) expect(r.source).toBe("agree");
      if (r.source !== "agree") expect(r.needsReview).toBe(true);

      // ٣. المرشّحان الأصليان بيرجعا زي ما هما (سترنج، فاضي لو مافيش).
      expect(r.oursPlate).toBe(o ?? "");
      expect(r.deepgramPlate).toBe(d ?? "");
      expect(r.oursNorm).toBe(oursNorm);
      expect(r.deepgramNorm).toBe(dgNorm);

      // ٤. النوع والسبب من مجموعة مغلقة، والسبب مش فاضي.
      expect(SOURCES).toContain(r.source);
      expect(typeof r.reason).toBe("string");
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.agreed).toBe(r.source === "agree");

      // ٥. حتمية: نفس الإدخال → نفس المخرَج بالحرف.
      expect(fusePlate(build())).toEqual(r);
      expect(fusePlate(build())).toEqual(r);

      // ٦. نقاء: الإدخال متجمّد، فأي تعديل كان هيرمي استثناء فوق.
      expect(input.ours.plate).toBe(o);
      expect(input.deepgramPlate).toBe(d);

      seenSources.add(r.source);
      seenReasons.add(r.reason);
    }

    expect(n).toBe(4800);
    // المجموعة بتغطّي كل صفوف الجدول وكل الأسباب الممكنة.
    expect([...seenSources].sort()).toEqual(["agree", "deepgram", "none", "ours"]);
    expect([...seenReasons].sort()).toEqual([
      "agree",
      "both_unavailable",
      "deepgram_empty_use_ours",
      "disagree_prefer_ours",
      "disagree_sheet_prefers_deepgram",
      "disagree_sheet_prefers_ours",
      "ours_unusable_use_deepgram",
    ]);
  });

  it("الاتفاق دايماً بلا مراجعة والاختلاف دايماً بمراجعة — على كل زوج لوحتين سليمتين", () => {
    const valid = ["ابح1234", "أبح1234", "ابح١٢٣٤", "دمهـ4420", "دمه4420", "ررا1325", "حبل6821", "حبل6881"];
    let pairs = 0;
    for (const a of valid) for (const b of valid) {
      const r = fusePlate({ deepgramPlate: b, ours: ours(a) });
      pairs++;
      const same = normalizePlate(a) === normalizePlate(b);
      expect(r.needsReview, `${a} / ${b}`).toBe(!same);
      expect(r.source, `${a} / ${b}`).toBe(same ? "agree" : "ours");
    }
    expect(pairs).toBe(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// آلة حالة الإنذار بعد ترقيع الحَكَم — `decideJudgeAlertAction`
// =============================================================================
// المشكلة اللي الدالة دي بتحلّها (عيب صادته المراجعة العدائية على الطيّار):
//   إعادة البحث بعد الدمج بتتنادى **صامتة** (`searchInCheck(p, {silent:true})`)
//   عشان مانلفّش صفّارة تانية لنفس النبضة. النتيجة إن ترقيع الصف كان بيغيّر
//   `row.found` **بلا** أي مزامنة مع الإنذار:
//     • F→T: العربية بقت مطلوبة و**ولا صفّارة** طلعت وكارت «مطلوبة» مافتحش.
//     • T→F: الصفّارة كانت طلعت خلاص، والكارت فضل واقف على اللوحة القديمة
//       «مطلوبة» بعد ما الصف نفسه بقى غير مطلوب (يحصل من مسار fuzzy ≥٨٨٪:
//       `found` بيبقى true والشيت `has()` بيقول false، فقاعدة الشيت تسكت،
//       موديلنا يكسب، واللوحة الجديدة ماتطلعش على الشيت).
//
// الدالة **نقية**: بتاخد الانتقال وبترجع فعل واحد، والصفحة هي اللي تنفّذه.
// الثوابت اللي الاختبارات تحت بتفرضها:
//   ١. **صفّارة واحدة بالظبط لكل نبضة**: `fire` ممنوع لو الصفّارة اتشغّلت خلاص
//      (`wasFound`)، ولازم تحصل لو الحالة النهائية «مطلوبة» وماكانتش اتشغّلت.
//   ٢. **الكارت و`row.found` عمرهم ما يختلفوا** بعد تنفيذ الفعل.
// ─────────────────────────────────────────────────────────────────────────────

describe("decideJudgeAlertAction — الانتقالات الستّة الأساسية", () => {
  /** انتقال مختصر: الافتراضي «الترقيع اتطبّق واللوحة اتغيّرت». */
  const tr = (o: Partial<JudgeAlertTransition>): JudgeAlertTransition => ({
    patched: true, prevPlate: "ابح1234", nextPlate: "حبل5818",
    wasFound: false, nowFound: false, ...o,
  });

  it("false→true: الصف بقى مطلوب ومافيش صفّارة اتشغّلت ⇒ fire", () => {
    expect(decideJudgeAlertAction(tr({ wasFound: false, nowFound: true })))
      .toBe<JudgeAlertAction>("fire");
  });

  it("true→false: الصفّارة اتشغّلت خلاص والصف بقى غير مطلوب ⇒ clear (بلا صفّارة تانية)", () => {
    expect(decideJudgeAlertAction(tr({ wasFound: true, nowFound: false })))
      .toBe<JudgeAlertAction>("clear");
  });

  it("true→true بنفس اللوحة: مافيش حاجة تتغيّر ⇒ none", () => {
    expect(decideJudgeAlertAction(tr({
      prevPlate: "ابح1234", nextPlate: "ابح1234", wasFound: true, nowFound: true,
    }))).toBe<JudgeAlertAction>("none");
  });

  it("true→true بلوحة مختلفة: الكارت لازم يتنقل للوحة الجديدة ⇒ repoint (بلا صفّارة تانية)", () => {
    expect(decideJudgeAlertAction(tr({
      prevPlate: "ابح1234", nextPlate: "حبل5818", wasFound: true, nowFound: true,
    }))).toBe<JudgeAlertAction>("repoint");
  });

  it("false→false: ولا الصف ولا الكارت اتغيّروا ⇒ none", () => {
    expect(decideJudgeAlertAction(tr({ wasFound: false, nowFound: false })))
      .toBe<JudgeAlertAction>("none");
  });

  it("الترقيع مااتطبّقش (المندوب عدّل بإيده / البحث رجّع null) ⇒ none في كل الأحوال", () => {
    for (const wasFound of [true, false])
      for (const nowFound of [true, false])
        for (const nextPlate of ["ابح1234", "حبل5818", ""])
          expect(
            decideJudgeAlertAction(tr({ patched: false, wasFound, nowFound, nextPlate })),
            `${wasFound}/${nowFound}/${nextPlate}`,
          ).toBe<JudgeAlertAction>("none");
  });
});

describe("decideJudgeAlertAction — حالة الـfuzzy اللي صادتها المراجعة", () => {
  // مسار `searchInCheck` الغشيم: تطابق تقريبي ≥٨٨٪ بيرجّع found=true بس
  // `checkIndex.has(dgNorm)` = false. عند الاختلاف الاتنين بيرجّعوا false من
  // الشيت ⇒ قاعدة الشيت تسكت ⇒ موديلنا يكسب ⇒ اللوحة الجديدة مش على الشيت
  // (ولا قريبة منه) ⇒ الصف يقلب true→false **بعد** ما الصفّارة اتشغّلت.
  it("found=true من fuzzy واللوحة الجديدة مش على الشيت ⇒ clear مش fire", () => {
    const action = decideJudgeAlertAction({
      patched: true,
      prevPlate: "حكل5818",   // اللي Deepgram قاله — طابق fuzzy ٨٨٪ على «حبل5818»
      nextPlate: "حبل6821",   // لوحة موديلنا — مش على الشيت خالص
      wasFound: true,         // الصفّارة اتشغّلت وقت النطق
      nowFound: false,
    });
    expect(action).toBe<JudgeAlertAction>("clear");
    expect(action).not.toBe("fire");   // ممنوع صفّارة تانية
  });

  it("والعكس: Deepgram مالقاش حاجة ولوحة موديلنا طابقت fuzzy ⇒ fire", () => {
    expect(decideJudgeAlertAction({
      patched: true, prevPlate: "حبل6821", nextPlate: "حبل5818",
      wasFound: false, nowFound: true,
    })).toBe<JudgeAlertAction>("fire");
  });
});

describe("decideJudgeAlertAction — التطبيع والحالات المتطرّفة", () => {
  it("المقارنة بالتطبيع: تطويل/همزة/أرقام عربية مش «لوحة مختلفة»", () => {
    for (const [prev, next] of [
      ["دمه4420", "دمهـ4420"],
      ["ابح1234", "أبح1234"],
      ["ابح1234", "ابح١٢٣٤"],
      ["ابح1234", "أ ب ح 1234"],
    ]) {
      expect(
        decideJudgeAlertAction({ patched: true, prevPlate: prev, nextPlate: next, wasFound: true, nowFound: true }),
        `${prev} / ${next}`,
      ).toBe<JudgeAlertAction>("none");
    }
  });

  it("انتقال الحالة بيكسب على مقارنة اللوحة: found اتغيّر واللوحة زي ما هي ⇒ نتصرّف", () => {
    // مستحيل عملياً (found دالة اللوحة + الشيت) بس الدالة لازم تبقى كاملة ومحافظة:
    // أي اتجاه للحالة النهائية «مطلوبة» لازم يطلّع صفّارة.
    expect(decideJudgeAlertAction({
      patched: true, prevPlate: "ابح1234", nextPlate: "ابح1234", wasFound: false, nowFound: true,
    })).toBe<JudgeAlertAction>("fire");
    expect(decideJudgeAlertAction({
      patched: true, prevPlate: "ابح1234", nextPlate: "ابح1234", wasFound: true, nowFound: false,
    })).toBe<JudgeAlertAction>("clear");
  });

  it("نقيّة وحتمية: نفس الإدخال (متجمّد) → نفس الفعل، بلا تعديل للإدخال", () => {
    const build = () => Object.freeze({
      patched: true, prevPlate: "ابح1234", nextPlate: "حبل5818", wasFound: true, nowFound: true,
    }) as JudgeAlertTransition;
    const a = decideJudgeAlertAction(build());
    expect(decideJudgeAlertAction(build())).toBe(a);
    expect(decideJudgeAlertAction(build())).toBe(a);
    const frozen = build();
    decideJudgeAlertAction(frozen);
    expect(frozen.prevPlate).toBe("ابح1234");
    expect(frozen.nextPlate).toBe("حبل5818");
  });
});

describe("decideJudgeAlertAction — دفتر الصفّارات على كل الانتقالات (٣٢ حالة)", () => {
  const ACTIONS: JudgeAlertAction[] = ["fire", "clear", "repoint", "none"];

  /** كل تجميعة: الترقيع × الحالة قبل × الحالة بعد × (اللوحة اتغيّرت؟) × (اللوحة الجديدة فاضية؟) */
  function* transitions() {
    for (const patched of [true, false])
      for (const wasFound of [true, false])
        for (const nowFound of [true, false])
          for (const plateChanged of [true, false])
            for (const oddForm of [true, false]) {
              const prevPlate = "ابح1234";
              const nextPlate = plateChanged
                ? (oddForm ? "حبل5818" : "حبل6821")
                : (oddForm ? "أبح١٢٣٤" : "ابح1234");   // نفس اللوحة بشكل تاني
              yield { patched, wasFound, nowFound, prevPlate, nextPlate, plateChanged };
            }
  }

  it("حجم الجدول معروف ومعلَن", () => {
    expect([...transitions()].length).toBe(2 * 2 * 2 * 2 * 2);
    expect([...transitions()].length).toBe(32);
  });

  it("صفّارة واحدة بالظبط لما الحالة النهائية «مطلوبة»، وعمرها ما تبقى اتنين", () => {
    let n = 0;
    for (const t of transitions()) {
      const action = decideJudgeAlertAction(t);
      expect(ACTIONS, JSON.stringify(t)).toContain(action);
      n++;

      // الصفّارة اللي اتشغّلت وقت النطق: `searchInCheck` غير الصامت بينادي
      // fireWantedAlert لو found، فـwasFound = صفّارة واحدة.
      const sirensBefore = t.wasFound ? 1 : 0;
      const sirensFromAction = action === "fire" ? 1 : 0;
      const totalSirens = sirensBefore + sirensFromAction;
      // الحالة النهائية للصف: الترقيع لو اتطبّق هو اللي بيحكم.
      const finalFound = t.patched ? t.nowFound : t.wasFound;

      // ١. عمرها ما تبقى اتنين — لا صفّارتين لنفس العربية.
      expect(totalSirens, `two sirens: ${JSON.stringify(t)}`).toBeLessThanOrEqual(1);
      // ٢. `fire` ممنوعة لو الصفّارة اتشغّلت خلاص.
      if (action === "fire") expect(t.wasFound, JSON.stringify(t)).toBe(false);
      // ٣. ولا صفر لما النهاية «مطلوبة».
      if (finalFound) expect(totalSirens, `zero sirens: ${JSON.stringify(t)}`).toBe(1);
    }
    expect(n).toBe(32);
  });

  it("الكارت و`row.found` عمرهم ما يختلفوا بعد تنفيذ الفعل", () => {
    for (const t of transitions()) {
      const action = decideJudgeAlertAction(t);
      const finalFound = t.patched ? t.nowFound : t.wasFound;

      // نموذج الكارت: بيفتح على الصف وقت النطق لو found (page.tsx:2037)،
      // وبعدين الفعل بيعدّله.
      let cardPlate: string | null = t.wasFound ? t.prevPlate : null;
      if (action === "fire") cardPlate = t.nextPlate;
      else if (action === "clear") cardPlate = null;
      else if (action === "repoint") cardPlate = t.nextPlate;

      const rowPlate = t.patched ? t.nextPlate : t.prevPlate;

      // الكارت مفتوح ⟺ الصف مطلوب.
      expect(cardPlate !== null, `card/found disagree: ${JSON.stringify(t)}`).toBe(finalFound);
      // ولو مفتوح، لوحته = لوحة الصف (بالتطبيع).
      if (cardPlate !== null) {
        expect(normalizePlate(cardPlate), `card plate: ${JSON.stringify(t)}`)
          .toBe(normalizePlate(rowPlate));
      }
    }
  });

  it("`repoint` بس لما الاتنين مطلوبين واللوحة اتغيّرت فعلاً، و`clear` بس على T→F", () => {
    for (const t of transitions()) {
      const action = decideJudgeAlertAction(t);
      if (action === "repoint") {
        expect(t.patched).toBe(true);
        expect(t.wasFound && t.nowFound).toBe(true);
        expect(normalizePlate(t.prevPlate)).not.toBe(normalizePlate(t.nextPlate));
      }
      if (action === "clear") {
        expect(t.patched).toBe(true);
        expect(t.wasFound).toBe(true);
        expect(t.nowFound).toBe(false);
      }
    }
  });
});
