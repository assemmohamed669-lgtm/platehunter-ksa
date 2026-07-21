import { describe, it, expect } from "vitest";
import {
  comparePlate,
  scoreModel,
  summarizeBenchmark,
  pairwiseAgreement,
  splitLettersDigits,
  type Prediction,
} from "@/lib/deepgramBenchmark";

describe("splitLettersDigits — يفصل الحروف عن الأرقام في اللوحة المطبّعة", () => {
  it("يفصل لوحة عادية", () => {
    expect(splitLettersDigits("دحق1234")).toEqual({ letters: "دحق", digits: "1234" });
  });
  it("لوحة بدون حروف (أرقام فقط)", () => {
    expect(splitLettersDigits("1234")).toEqual({ letters: "", digits: "1234" });
  });
});

describe("comparePlate — مقارنة تنبؤ الموديل باللوحة الصح", () => {
  it("تطابق تام → exact + الأرقام والحروف صح + صفر أخطاء حروف", () => {
    const c = comparePlate("دحق1234", "دحق1234");
    expect(c).toMatchObject({
      exact: true,
      digitsCorrect: true,
      lettersCorrect: true,
      letterErrors: 0,
      hasTruth: true,
    });
  });

  it("يطبّع قبل المقارنة (فراغات + أرقام عربية) فيعتبرهم متطابقين", () => {
    const c = comparePlate("د ح ق ١٢٣٤", "دحق1234");
    expect(c.exact).toBe(true);
  });

  it("غلط حرف واحد (الأرقام صح) → digitsCorrect لكن مش exact + خطأ حرف واحد", () => {
    const c = comparePlate("دهق1234", "دحق1234"); // ه بدل ح
    expect(c.exact).toBe(false);
    expect(c.digitsCorrect).toBe(true);
    expect(c.lettersCorrect).toBe(false);
    expect(c.letterErrors).toBe(1);
  });

  it("غلط رقم → digitsCorrect=false", () => {
    const c = comparePlate("دحق1239", "دحق1234");
    expect(c.exact).toBe(false);
    expect(c.digitsCorrect).toBe(false);
    expect(c.lettersCorrect).toBe(true);
  });

  it("تنبؤ فاضي → مش exact ومعلّم إن فيه truth", () => {
    const c = comparePlate("", "دحق1234");
    expect(c.exact).toBe(false);
    expect(c.hasTruth).toBe(true);
  });

  it("مفيش truth → hasTruth=false", () => {
    const c = comparePlate("دحق1234", "");
    expect(c.hasTruth).toBe(false);
  });
});

describe("scoreModel — يحسب دقة موديل على مجموعة تنبؤات", () => {
  const preds: Prediction[] = [
    { file: "a.m4a", predicted: "دحق1234", truth: "دحق1234" }, // exact
    { file: "b.m4a", predicted: "دهق1234", truth: "دحق1234" }, // letter error, digits ok
    { file: "c.m4a", predicted: "سصط5678", truth: "سصط5678" }, // exact
    { file: "d.m4a", predicted: "", truth: "ملك9999" },         // empty prediction
  ];

  it("يحسب exactPct والأرقام والحروف والفارغ", () => {
    const s = scoreModel("nova-3", preds);
    expect(s.model).toBe("nova-3");
    expect(s.total).toBe(4);        // كلهم فيهم truth
    expect(s.exact).toBe(2);        // a + c
    expect(s.exactPct).toBe(50);
    expect(s.digitsCorrect).toBe(3); // a, b, c (d فاضي فأرقامه غلط)
    expect(s.emptyPredictions).toBe(1);
  });

  it("مجموعة بلا truth → total=0 و exactPct=0", () => {
    const s = scoreModel("x", [{ file: "a", predicted: "دحق1234" }]);
    expect(s.total).toBe(0);
    expect(s.exactPct).toBe(0);
  });
});

describe("summarizeBenchmark — يرتّب الموديلات ويختار الأدق", () => {
  const byModel: Record<string, Prediction[]> = {
    "nova-3": [
      { file: "a", predicted: "دحق1234", truth: "دحق1234" },
      { file: "b", predicted: "دهق1234", truth: "دحق1234" }, // wrong
    ],
    "nova-2": [
      { file: "a", predicted: "دحق1234", truth: "دحق1234" },
      { file: "b", predicted: "دحق1234", truth: "دحق1234" }, // right → nova-2 أدق
    ],
  };

  it("يرتّب الأدق أولاً ويحدّد best", () => {
    const sum = summarizeBenchmark(byModel);
    expect(sum.best).toBe("nova-2");
    expect(sum.scores[0].model).toBe("nova-2");
    expect(sum.scores[0].exactPct).toBe(100);
    expect(sum.scores[1].model).toBe("nova-3");
    expect(sum.scores[1].exactPct).toBe(50);
    expect(sum.labeled).toBe(2);
  });

  it("بدون truth → best=null (مفيش قياس) لكن يفضل يرجّع الموديلات", () => {
    const sum = summarizeBenchmark({
      "nova-3": [{ file: "a", predicted: "دحق1234" }],
      "nova-2": [{ file: "a", predicted: "دهق1234" }],
    });
    expect(sum.best).toBeNull();
    expect(sum.labeled).toBe(0);
    expect(sum.scores.length).toBe(2);
  });
});

describe("pairwiseAgreement — اتفاق الموديلات (مفيد لما مفيش truth)", () => {
  it("يحسب نسبة اتفاق كل زوج موديلات على نفس الملفات", () => {
    const byModel: Record<string, Prediction[]> = {
      "nova-3": [
        { file: "a", predicted: "دحق1234" },
        { file: "b", predicted: "سصط5678" },
      ],
      "nova-2": [
        { file: "a", predicted: "دحق1234" }, // متفق
        { file: "b", predicted: "سصط5679" }, // مختلف
      ],
    };
    const ag = pairwiseAgreement(byModel);
    expect(ag).toHaveLength(1);
    expect(ag[0]).toMatchObject({ a: "nova-3", b: "nova-2", comparable: 2 });
    expect(ag[0].agreePct).toBe(50);
  });
});
