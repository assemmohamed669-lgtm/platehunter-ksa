import { describe, it, expect } from "vitest";
import { twinGuardDecision, areTwins, oneLetterApart, type TwinReading } from "@/lib/twinGuard";

/**
 * حارس التوأم — الحالات مأخوذة من **جلسات ميدانية حقيقية** (٣ سبتمبر ٢٠٢٦،
 * سيرفر Vast.ai كوريا، الحصاد في D:/voicex-harvest).
 *
 * 🔒 أهم اختبار في الملف ده: **«لوحتين حقيقيتين مايتلمسوش»** — المالك موافق على
 * الحارس بشرط إنه عمره ما يرمي لوحة صح. أي تعديل يكسر الاختبار ده = مرفوض.
 */

const r = (plate: string, o: Partial<TwinReading> = {}): TwinReading => ({
  letters: plate.replace(/[0-9]/g, ""),
  digits: plate.replace(/[^0-9]/g, ""),
  mult: 1,
  conf: 0.8,
  tMs: 0,
  ...o,
});

describe("oneLetterApart — فرق خانة واحدة", () => {
  it("حروف بفرق حرف واحد", () => expect(oneLetterApart("رعق", "حعق")).toBe(true));
  it("أرقام بفرق رقم واحد", () => expect(oneLetterApart("8651", "8652")).toBe(true));
  it("متطابقين = مش فرق خانة", () => expect(oneLetterApart("8651", "8651")).toBe(false));
  it("فرق خانتين = لأ", () => expect(oneLetterApart("8651", "8642")).toBe(false));
  it("أطوال مختلفة = لأ", () => expect(oneLetterApart("865", "8651")).toBe(false));
});

describe("areTwins — نفس الأرقام بفرق حرف، أو نفس الحروف بفرق رقم", () => {
  it("ترفرف الحرف (رعق7031/حعق7031)", () =>
    expect(areTwins(r("رعق7031"), r("حعق7031"))).toBe(true));
  it("ترفرف الرقم (رقو8651/رقو8652)", () =>
    expect(areTwins(r("رقو8651"), r("رقو8652"))).toBe(true));
  it("لوحتين مختلفتين خالص", () =>
    expect(areTwins(r("رقو8651"), r("دمم5012"))).toBe(false));
  it("نفس الحروف بس فرق رقمين = مش توأم", () =>
    expect(areTwins(r("رمد9488"), r("رمد9433"))).toBe(false));
});

describe("القواعد القديمة — سلوكها مايتغيرش", () => {
  it("وارد مفرد + توأم مؤكّد → ارمِ الوارد", () => {
    expect(twinGuardDecision(r("رقو8652", { mult: 1 }), r("رقو8651", { mult: 3 })))
      .toBe("drop-incoming");
  });

  it("وارد مؤكّد + توأم مفرد → امسح التوأم", () => {
    expect(twinGuardDecision(r("رقو8651", { mult: 3 }), r("رقو8652", { mult: 1 })))
      .toBe("drop-twin");
  });

  it("🔒 الاتنين مؤكّدين → ماتلمسش حاجة (عمره ما يرمي مؤكّدة)", () => {
    expect(twinGuardDecision(r("رمد9488", { mult: 2 }), r("رمد9483", { mult: 2 })))
      .toBe("none");
  });

  it("مصدر مش VoiceX (بلا mult) → الحارس يتخطّاه", () => {
    expect(twinGuardDecision(r("رقو8651", { mult: undefined }), r("رقو8652", { mult: 1 })))
      .toBe("none");
    expect(twinGuardDecision(r("رقو8651", { mult: 1 }), r("رقو8652", { mult: undefined })))
      .toBe("none");
  });
});

describe("الجديد — الاتنين مفردين من نفس النطق", () => {
  // الحالة الحقيقية: نافذة 2860 = رقو8652 · نافذة 2861 = رقو8651 (متتاليتين).
  it("نفس النطق (فرق ١.٥ث) → يسيب الأعلى ثقة", () => {
    expect(twinGuardDecision(
      r("رقو8651", { mult: 1, conf: 0.93, tMs: 11500 }),
      r("رقو8652", { mult: 1, conf: 0.71, tMs: 10000 }),
    )).toBe("drop-twin");
  });

  it("نفس النطق والوارد أضعف → ارمِ الوارد", () => {
    expect(twinGuardDecision(
      r("رقو8652", { mult: 1, conf: 0.71, tMs: 11500 }),
      r("رقو8651", { mult: 1, conf: 0.93, tMs: 10000 }),
    )).toBe("drop-incoming");
  });

  it("تعادل الثقة → الموجود على الشاشة يكسب (استقرار العرض)", () => {
    expect(twinGuardDecision(
      r("رقو8652", { mult: 1, conf: 0.8, tMs: 11000 }),
      r("رقو8651", { mult: 1, conf: 0.8, tMs: 10000 }),
    )).toBe("drop-incoming");
  });

  it("عند العتبة بالظبط (٢ث) لسه نفس النطق", () => {
    expect(twinGuardDecision(
      r("رقو8651", { mult: 1, conf: 0.9, tMs: 12000 }),
      r("رقو8652", { mult: 1, conf: 0.5, tMs: 10000 }),
    )).toBe("drop-twin");
  });
});

describe("🔒 الأمان — لوحتين حقيقيتين مايتلمسوش", () => {
  it("إيقاع النطق الطبيعي (~٣.٤ث) → الاتنين يفضلوا", () => {
    expect(twinGuardDecision(
      r("رمد9483", { mult: 1, conf: 0.6, tMs: 13400 }),
      r("رمد9488", { mult: 1, conf: 0.95, tMs: 10000 }),
    )).toBe("none");
  });

  it("فرق ثانيتين وجزء → برّه العتبة، الاتنين يفضلوا", () => {
    expect(twinGuardDecision(
      r("سحك4702", { mult: 1, conf: 0.4, tMs: 12100 }),
      r("سحك4708", { mult: 1, conf: 0.99, tMs: 10000 }),
    )).toBe("none");
  });

  it("مافيش زمن نطق (قراءة قديمة/مصدر تاني) → ماتلمسش حاجة", () => {
    expect(twinGuardDecision(
      r("رقو8651", { mult: 1, conf: 0.9, tMs: undefined }),
      r("رقو8652", { mult: 1, conf: 0.5, tMs: 10000 }),
    )).toBe("none");
  });

  it("لوحتين مش توأم أصلاً → ماتلمسش حاجة مهما كانت الثقة", () => {
    expect(twinGuardDecision(
      r("رقو8651", { mult: 1, conf: 0.99, tMs: 10000 }),
      r("دمم5012", { mult: 1, conf: 0.10, tMs: 10100 }),
    )).toBe("none");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  قراءة النطق الكامل مقابل قراءة النافذة المقطوعة
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 **بلاغ المالك (٤ سبتمبر ٢٠٢٦):** المندوب قال «ردي٧٢٦٥». البرنامج طلّع
 * `ردي7365` الأول، وبعدها `ردي7265`. ولاحظ إن **آخر قراءة دايماً هي الصح**.
 *
 * وده **مش صدفة، له سبب في الكود**: المحرك بيقرا بطريقتين —
 *   · **نافذة ثابتة ٥ث كل ١.٥ث** ⇒ بتقطع اللوحة البطيئة في نصها ⇒ قراءة جزئية.
 *   · **النطق كامل** (بعد ما السكوت يجي) ⇒ اللوحة كلها مرة واحدة ⇒ أدق.
 * النافذة بتوصل **الأول** (كل ١.٥ث) والنطق الكامل بيوصل **بعدها** (محتاج ٩٠٠
 * مللي سكوت). فـ«الأخيرة صح» فعلياً معناها **«النطق الكامل صح»**.
 *
 * فبدل قاعدة «الأحدث تكسب» (تخمين على التوقيت)، بنستخدم **«الكامل يكسب
 * المقطوع»** — سبب هندسي، ومايتأثرش بترتيب وصول الردود من السيرفر.
 *
 * ⚠️ لسه محكوم بقيد «نفس النطق» (≤٢ث): لوحتين حقيقيتين ورا بعض مايتلمسوش.
 */
describe("النطق الكامل مقابل النافذة المقطوعة", () => {
  const T = 10_000;
  it("🔴 قراءة النطق الكامل تكسب قراءة النافذة — حتى لو الاتنين مؤكّدين", () => {
    // ده بالظبط بلاغ ردي7365 / ردي7265
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.8, tMs: T + 900, fromUtterance: true },
      { letters: "ردي", digits: "7365", mult: 2, conf: 0.9, tMs: T, fromUtterance: false },
    )).toBe("drop-twin");
  });

  it("النافذة ما تكسبش النطق الكامل حتى لو ثقتها أعلى", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7365", mult: 2, conf: 0.99, tMs: T + 900, fromUtterance: false },
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.5, tMs: T, fromUtterance: true },
    )).toBe("drop-incoming");
  });

  it("🔴 نطقين مختلفين (فرق > ٢ث) مايتلمسوش مهما كان المصدر", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.8, tMs: T + 4000, fromUtterance: true },
      { letters: "ردي", digits: "7365", mult: 2, conf: 0.9, tMs: T, fromUtterance: false },
    )).toBe("none");
  });

  it("🔴 الاتنين من نطق كامل ⇒ ماتلمسش (مافيش سبب نفضّل واحدة)", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.8, tMs: T + 500, fromUtterance: true },
      { letters: "ردي", digits: "7365", mult: 2, conf: 0.9, tMs: T, fromUtterance: true },
    )).toBe("none");
  });

  it("الاتنين من نوافذ ⇒ ماتلمسش (السلوك القديم زي ما هو)", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.8, tMs: T + 500, fromUtterance: false },
      { letters: "ردي", digits: "7365", mult: 2, conf: 0.9, tMs: T, fromUtterance: false },
    )).toBe("none");
  });

  it("مصدر مش VoiceX ⇒ الحارس يتخطّى حتى مع علم النطق الكامل", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", tMs: T + 500, fromUtterance: true },
      { letters: "ردي", digits: "7365", tMs: T, fromUtterance: false },
    )).toBe("none");
  });

  it("🔴 مش توأم أصلاً ⇒ ماتلمسش مهما كان المصدر (لوحتين مختلفتين)", () => {
    expect(twinGuardDecision(
      { letters: "ردي", digits: "7265", mult: 2, conf: 0.8, tMs: T + 500, fromUtterance: true },
      { letters: "سبك", digits: "1122", mult: 2, conf: 0.9, tMs: T, fromUtterance: false },
    )).toBe("none");
  });
});
