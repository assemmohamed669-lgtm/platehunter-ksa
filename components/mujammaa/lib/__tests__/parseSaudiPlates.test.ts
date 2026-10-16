import { describe, it, expect } from "vitest";
import { parseSaudiPlates } from "../parseSaudiPlates";

const plates = (text: string) => parseSaudiPlates(text).map((p) => p.plate);

describe("parseSaudiPlates — الحالة الأساسية", () => {
  it("لوحة بحروف منفردة وأرقام رقمية", () => {
    expect(plates("أ ب ح 1234")).toEqual(["ابح1234"]);
  });

  it("لوحة بأسماء الحروف كاملة", () => {
    expect(plates("ألف باء حاء 1234")).toEqual(["ابح1234"]);
  });

  it("لوحة بأسماء الحروف المختصرة", () => {
    expect(plates("كاف لام ميم 5678")).toEqual(["كلم5678"]);
  });

  it("لوحة بأرقام منطوقة", () => {
    expect(plates("سين طاء راء واحد اتنين تلاتة أربعة")).toEqual(["سطر1234"]);
  });

  it("لوحة بأرقام هندية", () => {
    expect(plates("أ ب ح ١٢٣٤")).toEqual(["ابح1234"]);
  });

  it("لوحة بأرقام مركّبة — ألفين وسبعمية", () => {
    expect(plates("نون كاف دال ألفين وسبعمية")).toEqual(["نكد2700"]);
  });

  it("بيتجاهل كلمات الحشو", () => {
    expect(plates("لوحة رقم أ ب ح 1234 تشييك")).toEqual(["ابح1234"]);
  });
});

describe("parseSaudiPlates — السرد السريع (لوحات متتالية بدون توقف)", () => {
  it("لوحتين ورا بعض", () => {
    expect(plates("أ ب ح 1234 س ص ط 5678")).toEqual(["ابح1234", "سصط5678"]);
  });

  it("تلات لوحات بأسماء حروف كاملة بدون فواصل", () => {
    expect(
      plates("ألف باء حاء واحد اتنين تلاتة أربعة كاف لام ميم خمسة ستة سبعة تمانية نون واو ياء تسعة صفر واحد اتنين")
    ).toEqual(["ابح1234", "كلم5678", "نوي9012"]);
  });

  it("«و» اللي بمعنى «كذلك» بين اللوحات ما تتحسبش حرف", () => {
    expect(plates("أ ب ح 1234 و س ص ط 5678")).toEqual(["ابح1234", "سصط5678"]);
  });

  it("مثال المواصفات بالحرف: «حا با كاف خمسة اتنين واحد اتنين أ د س ستة اتنين تلاتة تمانية»", () => {
    expect(
      plates("حا با كاف خمسة اتنين واحد اتنين أ د س ستة اتنين تلاتة تمانية")
    ).toEqual(["حبك5212", "ادس6238"]);
  });

  it("بيحافظ على الترتيب", () => {
    const r = parseSaudiPlates("أ ب ح 1111 د ر س 2222");
    expect(r[0].order).toBe(1);
    expect(r[1].order).toBe(2);
  });
});

describe("parseSaudiPlates — حماية من الإنذار الكاذب", () => {
  it("كلام عادي مافيهوش لوحة = صفر نتائج", () => {
    expect(plates("السلام عليكم يا أستاذ إزيك عامل إيه النهاردة")).toEqual([]);
  });

  it("«لا» و «ما» و «ها» في كلام عادي ما تطلعش لوحة", () => {
    expect(plates("لا والله ما شفت حاجة ها هو جاي")).toEqual([]);
  });

  it("حروف بدون أرقام ما تطلعش لوحة", () => {
    expect(plates("كاف لام ميم")).toEqual([]);
  });

  it("أرقام بدون حروف ما تطلعش لوحة", () => {
    expect(plates("1234 5678")).toEqual([]);
  });

  it("«يا» النداء قبل لوحة ما تفسدهاش", () => {
    expect(plates("يا أ ب ح 1234")).toEqual(["ابح1234"]);
  });
});

describe("parseSaudiPlates — الحروف اللي فيها «و»", () => {
  it("لوحة فيها واو جوّه التهجئة", () => {
    expect(plates("ألف واو باء 1234")).toEqual(["اوب1234"]);
  });

  it("لوحة بتبدأ بواو منطوقة كاسم حرف", () => {
    expect(plates("واو نون باء 4321")).toEqual(["ونب4321"]);
  });
});

describe("parseSaudiPlates — علامة «ألف» الملتبسة", () => {
  it("«ألف» في مكان الحروف = حرف الألف", () => {
    expect(plates("ألف باء حاء 1234")).toEqual(["ابح1234"]);
  });

  it("«ألف» في مكان الأرقام = 1000", () => {
    expect(plates("باء حاء دال ألف")).toEqual(["بحد1000"]);
  });

  it("«ألف وميتين» في مكان الأرقام = 1200", () => {
    expect(plates("باء حاء دال ألف وميتين")).toEqual(["بحد1200"]);
  });
});

describe("parseSaudiPlates — الأعلام (Flags) على الحالات الناقصة", () => {
  it("أرقام أقل من ٤ = علم «أرقام ناقصة»", () => {
    const r = parseSaudiPlates("أ ب ح 12");
    expect(r).toHaveLength(1);
    expect(r[0].digits).toBe("12");
    expect(r[0].flags).toContain("few-digits");
  });

  it("حرفين بس = علم «حروف ناقصة»", () => {
    const r = parseSaudiPlates("أ ب 1234");
    expect(r).toHaveLength(1);
    expect(r[0].flags).toContain("few-letters");
  });

  it("٤ حروف = ياخد آخر تلاتة ويعلّم زيادة حروف + يقترح بديل", () => {
    const r = parseSaudiPlates("ياء ألف باء حاء 1234");
    expect(r).toHaveLength(1);
    expect(r[0].letters).toEqual(["ا", "ب", "ح"]);
    expect(r[0].flags).toContain("extra-letters");
    expect(r[0].alternatives).toContain("ياب1234");
  });

  it("أرقام أكتر من ٤ = ياخد أول أربعة ويعلّم + يقترح آخر أربعة", () => {
    const r = parseSaudiPlates("أ ب ح 12345");
    expect(r[0].digits).toBe("1234");
    expect(r[0].flags).toContain("extra-digits");
    expect(r[0].alternatives).toContain("ابح2345");
  });

  it("لوحة سليمة تماماً مافيهاش أعلام", () => {
    const r = parseSaudiPlates("أ ب ح 1234");
    expect(r[0].flags).toEqual([]);
  });
});

describe("parseSaudiPlates — أرقام مجزّأة", () => {
  it("رقمين مكتوبين على مجموعتين يتلزقوا", () => {
    expect(plates("أ ب ح 12 34")).toEqual(["ابح1234"]);
  });
});

describe("parseSaudiPlates — توقيتات الكلمات (لنظام المراجعة الصوتية)", () => {
  it("بيرجّع بداية ونهاية كل لوحة من توقيتات الكلمات", () => {
    const r = parseSaudiPlates([
      { word: "ألف", start: 1.0, end: 1.3 },
      { word: "باء", start: 1.3, end: 1.6 },
      { word: "حاء", start: 1.6, end: 1.9 },
      { word: "1234", start: 1.9, end: 2.6 },
      { word: "سين", start: 3.4, end: 3.7 },
      { word: "طاء", start: 3.7, end: 4.0 },
      { word: "راء", start: 4.0, end: 4.3 },
      { word: "5678", start: 4.3, end: 5.0 },
    ]);

    expect(r).toHaveLength(2);
    expect(r[0].timeStart).toBeCloseTo(1.0);
    expect(r[0].timeEnd).toBeCloseTo(2.6);
    expect(r[1].timeStart).toBeCloseTo(3.4);
    expect(r[1].timeEnd).toBeCloseTo(5.0);
  });
});

describe("parseSaudiPlates — النص المصدر محفوظ", () => {
  it("بيحفظ الكلام الأصلي لكل لوحة عشان نراجعه", () => {
    const r = parseSaudiPlates("لوحة ألف باء حاء واحد اتنين تلاتة أربعة");
    expect(r[0].raw).toContain("ألف");
    expect(r[0].raw).toContain("أربعة");
  });
});
