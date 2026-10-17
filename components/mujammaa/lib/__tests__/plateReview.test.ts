import { describe, it, expect } from "vitest";
import {
  extractPlates,
  reconcileSecondOpinion,
  applyManualEdit,
  pickBestTranscript,
  AUDIO_REVIEW_THRESHOLD,
} from "../plateReview";

describe("الطبقة ١ — الحصر القسري على الـ١٧ حرف", () => {
  it("لوحة سليمة = ثقة ١٠٠٪ وبلا مراجعة", () => {
    const [p] = extractPlates("أ ب ح 1234");
    expect(p.plate).toBe("ابح1234");
    expect(p.confidence).toBe(100);
    expect(p.status).toBe("solid");
    expect(p.corrections).toEqual([]);
    expect(p.needsAudioReview).toBe(false);
  });

  it("حرف مستحيل يتصحّح قسرياً ويتسجّل التصحيح", () => {
    // «تاء» مستحيلة على لوحة سعودية → أقرب حرف معتمد «ط»
    const [p] = extractPlates("ألف باء تاء 1234");
    expect(p.plate).toBe("ابط1234");
    expect(p.heardPlate).toBe("ابت1234");
    expect(p.corrections).toHaveLength(1);
    expect(p.corrections[0]).toMatchObject({ from: "ت", to: "ط" });
    expect(p.confidence).toBeLessThan(100);
    expect(p.needsAudioReview).toBe(true);
  });

  it("«جيم» تتصحّح لـ «حاء»", () => {
    const [p] = extractPlates("جيم باء كاف 5212");
    expect(p.plate).toBe("حبك5212");
  });

  it("«فاء» تتصحّح لـ «قاف» ومعاها بديل «واو»", () => {
    const [p] = extractPlates("فاء باء كاف 1111");
    expect(p.plate).toBe("قبك1111");
    expect(p.alternatives).toContain("وبك1111");
  });

  it("أكتر من حرف غلط = خصم أكبر", () => {
    const [p] = extractPlates("تاء ثاء جيم 1234");
    expect(p.plate).toBe("طسح1234");
    expect(p.confidence).toBeLessThan(70);
  });
});

describe("الطبقة ٢ — فحص الشكل", () => {
  it("أرقام ناقصة تقلّل الثقة وتطلب مراجعة", () => {
    const [p] = extractPlates("أ ب ح 12");
    expect(p.status).not.toBe("solid");
    expect(p.needsAudioReview).toBe(true);
    expect(p.notes.join(" ")).toContain("الأرقام أقل من ٤");
  });

  it("حروف ناقصة", () => {
    const [p] = extractPlates("أ ب 1234");
    expect(p.notes.join(" ")).toContain("الحروف أقل من ٣");
  });
});

describe("الطبقة ٣ — التوجيه بشيت البنك", () => {
  const vocabulary = ["ابح1234", "سصط5678", "كلم9012"];

  it("اللوحة موجودة نصاً في الشيت = تأكيد قوي", () => {
    const [p] = extractPlates("أ ب ح 1234", { vocabulary });
    expect(p.confidence).toBeGreaterThanOrEqual(99);
    expect(p.notes.join(" ")).toContain("موجودة نصاً في شيت البنك");
  });

  it("لوحة مشكوك فيها تفرق حرف عن لوحة واحدة في الشيت → تتصحّح عليها", () => {
    // «تاء» اتصحّحت لـ «ط» فطلعت «ابط1234» وثقتها نزلت،
    // والشيت فيه «ابح1234» على مسافة حرف واحد ومافيش غيرها قريبة
    const [p] = extractPlates("ألف باء تاء 1234", { vocabulary });
    expect(p.plate).toBe("ابح1234");
    expect(p.confidence).toBeGreaterThanOrEqual(92);
    expect(p.notes.join(" ")).toContain("بتوجيه من شيت البنك");
    expect(p.alternatives).toContain("ابط1234");
  });

  it("أكتر من مرشّح قريب = ما بيخمّنش", () => {
    const [p] = extractPlates("ألف باء تاء 1234", {
      vocabulary: ["ابح1234", "ابس1234"],
    });
    expect(p.plate).toBe("ابط1234");
    expect(p.notes.join(" ")).toContain("ما صحّحناهاش");
  });

  it("لوحة سليمة مش في الشيت ما تتغيّرش ولا تتجرّ لأقرب لوحة", () => {
    const [p] = extractPlates("ن و ي 3456", { vocabulary });
    expect(p.plate).toBe("نوي3456");
    expect(p.confidence).toBe(100);
  });
});

describe("الطبقة ٤ — المراجعة الصوتية", () => {
  const vocabulary = ["ابح1234"];

  it("الرأيين اتفقوا = الثقة تعلى والمراجعة تخلص", () => {
    const [p] = extractPlates("ألف باء تاء 1234");
    const merged = reconcileSecondOpinion(p, "ألف باء طاء 1234");
    expect(merged.plate).toBe("ابط1234");
    expect(merged.audioReview?.agreed).toBe(true);
    expect(merged.confidence).toBeGreaterThanOrEqual(97);
    expect(merged.needsAudioReview).toBe(false);
  });

  it("الرأي التاني شكله سليم والأول ناقص = التاني يكسب", () => {
    const [p] = extractPlates("أ ب ح 12"); // أرقام ناقصة
    const merged = reconcileSecondOpinion(p, "ألف باء حاء 1234");
    expect(merged.plate).toBe("ابح1234");
    expect(merged.audioReview?.agreed).toBe(false);
    expect(merged.notes.join(" ")).toContain("المراجعة الصوتية اختلفت");
  });

  it("الاختلاف بيمنع الثقة من إنها توصل «سليمة»", () => {
    const [p] = extractPlates("أ ب ح 12");
    const merged = reconcileSecondOpinion(p, "ألف باء حاء 1234");
    expect(merged.confidence).toBeLessThan(90);
    expect(merged.status).not.toBe("solid");
  });

  it("الرأي التاني موجود في الشيت والأول لأ = التاني يكسب", () => {
    const [p] = extractPlates("أ ب ح 9999");
    // الأول سليم شكلاً، فبنعتمد على الشيت للفصل
    const merged = reconcileSecondOpinion(p, "ألف باء حاء 1234", { vocabulary });
    expect(merged.plate).toBe("ابح1234");
  });

  it("المقطع ما طلّعش لوحة = نسيب الأصلي ونعلّم", () => {
    const [p] = extractPlates("أ ب ح 12");
    const merged = reconcileSecondOpinion(p, "مش واضح خالص");
    expect(merged.plate).toBe("ابح12");
    expect(merged.audioReview?.secondOpinion).toBeNull();
    expect(merged.needsAudioReview).toBe(false);
  });

  it("حد المراجعة ٩٠ — أي لوحة تحته تتبعت", () => {
    expect(AUDIO_REVIEW_THRESHOLD).toBe(90);
  });
});

describe("التعديل اليدوي", () => {
  it("تعديل المندوب فوق أي محرك", () => {
    const [p] = extractPlates("ألف باء تاء 1234");
    const edited = applyManualEdit(p, { letters: ["ا", "ب", "ح"] });
    expect(edited.plate).toBe("ابح1234");
    expect(edited.confidence).toBe(100);
    expect(edited.status).toBe("solid");
    expect(edited.manuallyEdited).toBe(true);
  });

  it("تعديل الأرقام بيشيل أي حرف غير رقمي وبيقصّ على ٤", () => {
    const [p] = extractPlates("أ ب ح 1234");
    const edited = applyManualEdit(p, { digits: "9a8b7c6d5" });
    expect(edited.digits).toBe("9876");
  });
});

describe("pickBestTranscript — اختيار أفضل احتمال", () => {
  it("بيختار الاحتمال اللي فيه لوحة سليمة مش الأول", () => {
    // المحرك رشّح كلام عادي أولاً، والاحتمال التاني فيه لوحة كاملة
    const best = pickBestTranscript([
      "كاف خمسة من زرتني",
      "حاء باء كاف خمسة اتنين صفر اتنين",
    ]);

    expect(best.index).toBe(1);
    expect(best.plates.map((p) => p.plate)).toEqual(["حبك5202"]);
  });

  it("بيفضّل الاحتمال اللي لوحته في شيت البنك", () => {
    // الاحتمالين فيهم لوحة سليمة، بس واحدة بس موجودة في الشيت
    const best = pickBestTranscript(
      ["نون واو ياء تسعة تسعة تسعة تسعة", "حاء باء كاف خمسة اتنين صفر اتنين"],
      { vocabulary: ["حبك5202"] }
    );

    expect(best.plates.map((p) => p.plate)).toEqual(["حبك5202"]);
  });

  it("عند التعادل بيمشي مع ترشيح المحرك الأول", () => {
    const best = pickBestTranscript([
      "ألف باء حاء واحد اتنين تلاتة أربعة",
      "سين صاد طاء خمسة ستة سبعة تمانية",
    ]);
    expect(best.index).toBe(0);
  });

  it("مافيش لوحة في أي احتمال = بيرجّع الأول بلا لوحات", () => {
    const best = pickBestTranscript(["كلام عادي خالص", "كلام تاني برضه"]);
    expect(best.index).toBe(0);
    expect(best.plates).toEqual([]);
  });

  it("قائمة فاضية ما تكسرش", () => {
    const best = pickBestTranscript([]);
    expect(best.text).toBe("");
    expect(best.plates).toEqual([]);
  });

  it("بيختار الاحتمال اللي فيه أكتر لوحات", () => {
    const best = pickBestTranscript([
      "ألف باء حاء واحد اتنين تلاتة أربعة",
      "ألف باء حاء واحد اتنين تلاتة أربعة سين صاد طاء خمسة ستة سبعة تمانية",
    ]);
    expect(best.index).toBe(1);
    expect(best.plates).toHaveLength(2);
  });
});

describe("السرد السريع + المراجعة معاً", () => {
  it("مثال المواصفات كامل بمرور المراجعة", () => {
    const r = extractPlates(
      "حا با كاف خمسة اتنين واحد اتنين أ د س ستة اتنين تلاتة تمانية"
    );
    expect(r.map((p) => p.plate)).toEqual(["حبك5212", "ادس6238"]);
    expect(r.every((p) => p.status === "solid")).toBe(true);
    expect(r.every((p) => !p.needsAudioReview)).toBe(true);
  });
});
