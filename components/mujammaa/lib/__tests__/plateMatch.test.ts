import { describe, it, expect } from "vitest";
import {
  checkSecondOpinion,
  levenshtein,
  levenshteinWithin,
  similarityPercent,
  bankPlateToArabic,
  anyPlateToNormalized,
  findNearestInVocabulary,
  isWellFormedPlate,
} from "../plateMatch";
import { normalizePlate } from "../textNormalize";

describe("normalizePlate", () => {
  it("يشيل المسافات ويوحّد الهمزة", () => {
    expect(normalizePlate("أ ب ح 1234")).toBe("ابح1234");
    expect(normalizePlate("إ ب ح 1234")).toBe("ابح1234");
    expect(normalizePlate("هـ و ي 5678")).toBe("هوي5678");
  });
});

describe("levenshtein", () => {
  it("المسافة صفر للمتطابق", () => {
    expect(levenshtein("ابح1234", "ابح1234")).toBe(0);
  });

  it("حرف واحد مختلف = ١", () => {
    expect(levenshtein("ابح1234", "ابط1234")).toBe(1);
  });

  it("نص فاضي", () => {
    expect(levenshtein("", "ابح")).toBe(3);
    expect(levenshtein("ابح", "")).toBe(3);
  });

  it("بيشتغل صح لو استُدعي مرات كتير ورا بعض (الـ buffers المشتركة)", () => {
    expect(levenshtein("ابح1234", "سصط5678")).toBe(7);
    expect(levenshtein("ابح1234", "ابح1234")).toBe(0);
    expect(levenshtein("ابح1234", "ابح1235")).toBe(1);
  });
});

describe("levenshteinWithin — الحساب المحدود (للشيتات الكبيرة)", () => {
  it("بيرجّع نفس نتيجة الحساب الكامل لما المسافة جوّه الحد", () => {
    expect(levenshteinWithin("ابح1234", "ابط1234", 1)).toBe(1);
    expect(levenshteinWithin("ابح1234", "ابح1234", 1)).toBe(0);
    expect(levenshteinWithin("ابح1234", "ابط1235", 2)).toBe(2);
  });

  it("بيرجّع Infinity لما المسافة تعدّي الحد", () => {
    expect(levenshteinWithin("ابح1234", "ابط1235", 1)).toBe(Infinity);
    expect(levenshteinWithin("ابح1234", "سصط5678", 1)).toBe(Infinity);
  });

  it("بيتخطى فرق الطول الكبير فوراً", () => {
    expect(levenshteinWithin("ابح1234", "اب", 1)).toBe(Infinity);
  });

  it("نتيجته مطابقة للحساب الكامل على مجموعة عشوائية", () => {
    const samples = ["ابح1234", "ابط1234", "ابح1235", "سصط5678", "نوي9999", "ابح123"];
    for (const a of samples) {
      for (const b of samples) {
        const full = levenshtein(a, b);
        const bounded = levenshteinWithin(a, b, 2);
        if (full <= 2) expect(bounded).toBe(full);
        else expect(bounded).toBe(Infinity);
      }
    }
  });
});

describe("similarityPercent", () => {
  it("١٠٠٪ للمتطابق", () => {
    expect(similarityPercent("أ ب ح 1234", "ابح1234")).toBe(100);
  });

  it("لوحة ٧ خانات بحرف مختلف ≈ ٨٦٪", () => {
    expect(similarityPercent("ابح1234", "ابط1234")).toBe(86);
  });
});

describe("bankPlateToArabic — التخطيطان", () => {
  it("حروف ثم أرقام = ترتيب عربي، الحروف كما هي", () => {
    expect(bankPlateToArabic("NKD 5678")).toBe("نكد5678");
    expect(bankPlateToArabic("ABJ 1234")).toBe("ابح1234");
  });

  it("أرقام ثم حروف = تخطيط لاتيني، الحروف تتعكس", () => {
    expect(bankPlateToArabic("7709 ABS")).toBe("سبا7709");
    expect(bankPlateToArabic("1234 KLZ")).toBe("ملك1234");
  });

  it("لوحة عربية أصلاً تتطبّع بس", () => {
    expect(bankPlateToArabic("أ ب ح 1234")).toBe("ابح1234");
  });

  it("نص فاضي", () => {
    expect(bankPlateToArabic("")).toBe("");
    expect(bankPlateToArabic("   ")).toBe("");
  });
});

describe("anyPlateToNormalized", () => {
  it("بيختار الطريق الصح تلقائياً", () => {
    expect(anyPlateToNormalized("7709 ABS")).toBe("سبا7709");
    expect(anyPlateToNormalized("أ ب ح 1234")).toBe("ابح1234");
  });
});

describe("isWellFormedPlate", () => {
  it("٣ حروف معتمدة + ٤ أرقام = سليمة", () => {
    expect(isWellFormedPlate("ابح1234")).toBe(true);
  });

  it("حرف مش على اللوحة = مش سليمة", () => {
    expect(isWellFormedPlate("ابج1234")).toBe(false);
  });

  it("أرقام ناقصة = مش سليمة", () => {
    expect(isWellFormedPlate("ابح123")).toBe(false);
  });

  it("حروف ناقصة = مش سليمة", () => {
    expect(isWellFormedPlate("اب1234")).toBe(false);
  });
});

describe("findNearestInVocabulary — التوجيه بالمفردات المقفولة", () => {
  const vocab = ["ابح1234", "سصط5678", "كلم9012"];

  it("تطابق تام", () => {
    const r = findNearestInVocabulary("ابح1234", vocab);
    expect(r?.distance).toBe(0);
    expect(r?.ambiguous).toBe(false);
  });

  it("حرف واحد فرق = يلاقيها", () => {
    const r = findNearestInVocabulary("ابط1234", vocab, 1);
    expect(r?.plate).toBe("ابح1234");
    expect(r?.distance).toBe(1);
    expect(r?.ambiguous).toBe(false);
  });

  it("بعيدة خالص = null", () => {
    expect(findNearestInVocabulary("نوي9999", vocab, 1)).toBeNull();
  });

  it("بيعلّم الالتباس لو فيه أكتر من مرشّح على نفس المسافة", () => {
    const r = findNearestInVocabulary("ابح1230", ["ابح1231", "ابح1232"], 1);
    expect(r?.ambiguous).toBe(true);
  });
});

describe("checkSecondOpinion — حارس النافذة الغلط", () => {
  it("خلاف طبيعي على السمع = مقبول", () => {
    // نفس الحروف، فرق رقم — ده تصحيح حقيقي حصل ميدانياً
    expect(checkSecondOpinion("دعق7989", "دعق7890").plausible).toBe(true);
    expect(checkSecondOpinion("حقن5898", "حكن5898").plausible).toBe(true);
    expect(checkSecondOpinion("طعن0444", "طعن4444").plausible).toBe(true);
  });

  it("ولا حرف مشترك = نافذة غلط، بنرفضه", () => {
    // الحالات دي حصلت فعلاً وكانت بتشيل إجابة Deepgram الصح
    expect(checkSecondOpinion("ادس6238", "رحل20006").plausible).toBe(false);
    expect(checkSecondOpinion("نوي3456", "حبم2222").plausible).toBe(false);
    expect(checkSecondOpinion("سطر5678", "بعه234").plausible).toBe(false);
  });

  it("حرف واحد مشترك يكفي للقبول (محافظ بالقصد)", () => {
    expect(checkSecondOpinion("ابح1234", "احه5079").plausible).toBe(true);
  });

  it("متطابقين = مقبول", () => {
    expect(checkSecondOpinion("ابح1234", "ابح1234").plausible).toBe(true);
  });

  it("الموديل ما رجّعش لوحة = مرفوض", () => {
    expect(checkSecondOpinion("ابح1234", "").plausible).toBe(false);
  });

  it("Deepgram فاضي = بنقبل رأي الموديل (مافيش حاجة نقارن بيها)", () => {
    expect(checkSecondOpinion("", "ابح1234").plausible).toBe(true);
  });

  it("سبب الرفض مكتوب بالعربي", () => {
    const r = checkSecondOpinion("ادس6238", "رحل20006");
    expect(r.reason).toContain("نافذة الصوت");
  });
});
