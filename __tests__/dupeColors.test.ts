import { describe, it, expect } from "vitest";
import { buildDupeColorMap, buildScopedDupeColorMap } from "@/lib/dupeColors";

describe("buildScopedDupeColorMap — نطاقات منفصلة (بلا تلوين كاذب)", () => {
  // الحالة الميدانية اللي كانت بتلوّن غلط: لوحة متشيّكة **مرة واحدة** بس موجودة
  // في قائمة الصوت وكمان في شيت السجلات (لأنها اتصدّرت) — مش مكررة.
  it("لوحة واحدة موجودة في القائمة وفي السجلات → مش مكررة (مفيش لون)", () => {
    const live = ["سحو2894"];
    const sheet = ["سحو2894"];
    const m = buildScopedDupeColorMap([live, sheet], 8);
    expect(m.size).toBe(0);
  });

  it("لوحة اتقالت مرتين في نفس الجلسة → مكررة", () => {
    const m = buildScopedDupeColorMap([["ابح1234", "ابح1234"], []], 8);
    expect(m.get("ابح1234")).toBe(0);
  });

  it("لوحة ليها سجلين في الشيت → مكررة (اتشيّكت قبل كده)", () => {
    const m = buildScopedDupeColorMap([[], ["دهس5678", "دهس5678"]], 8);
    expect(m.get("دهس5678")).toBe(0);
  });

  it("لوحة اتشيّكت بطريقتين قبل التصدير (صوت + كاميرا) → مكررة", () => {
    // النطاق الواحد بيجمع يدوي/كاميرا/صوت مع بعض
    const live = ["ابح1234" /* صوت */, "ابح1234" /* كاميرا */];
    const m = buildScopedDupeColorMap([live, []], 8);
    expect(m.get("ابح1234")).toBe(0);
  });

  it("نفس اللوحة بتاخد نفس اللون مهما اتكرّرت في أكتر من نطاق", () => {
    const m = buildScopedDupeColorMap([["أ", "أ"], ["أ", "أ"], ["ب", "ب"]], 8);
    expect(m.get("أ")).toBe(0);
    expect(m.get("ب")).toBe(1);
  });

  it("الشاص نطاق لوحده — تكراره مايتخلطش بالقوائم", () => {
    const m = buildScopedDupeColorMap([["س1111"], [], ["س1111", "س1111"]], 8);
    expect(m.get("س1111")).toBe(0); // مكررة جوّه الشاص
    const m2 = buildScopedDupeColorMap([["س1111"], [], ["س1111"]], 8);
    expect(m2.size).toBe(0);        // مرة في كل نطاق → مش مكررة
  });

  it("المفاتيح الفاضية ونطاقات فاضية → مفيش لون", () => {
    expect(buildScopedDupeColorMap([[], [], []], 8).size).toBe(0);
    expect(buildScopedDupeColorMap([["", ""], [""]], 8).size).toBe(0);
    expect(buildScopedDupeColorMap([["أ", "أ"]], 0).size).toBe(0);
  });
});
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";

// نفس منطق plateKeyFromRow في صفحة التشييك: لوحة صف الشاص بتتقرا من أعمدة الصف
// نفسه (ممكن ييجي من ورقة تانية) + تحقّق من الشكل (٣ حروف + ٤ أرقام) عشان
// detectPlateColumn بيرجّع أول عمود لو مالقاش فمانلوّنش قيم عشوائية كمكرر.
function plateKeyFromRow(row: Record<string, string>): string {
  const col = detectPlateColumn(Object.keys(row), [row]);
  const k = normalizePlate(bankPlateToArabic(String(col ? row[col] ?? "" : "")));
  const letters = k.replace(/[0-9]/g, "");
  const digits = k.replace(/[^0-9]/g, "");
  return letters.length === 3 && digits.length === 4 ? k : "";
}

describe("plateKeyFromRow — لوحة صف الشاص (لتلوين المكرر)", () => {
  it("بيمسك اللوحة من عمود بأي اسم (ورقة تانية) — «رقماللوحة» بدون مسافة", () => {
    expect(plateKeyFromRow({ "رقماللوحة": "أ ب ح 1234", "هيكل المرور": "6G1LL54F56L462203" })).toBe("ابح1234");
  });
  it("يطابق نفس مفتاح اللوحة المتشيّكة يدوي (فالاتنين ياخدوا نفس اللون)", () => {
    const fromChassisRow = plateKeyFromRow({ "Plate Number": "ابح1234", "VIN": "6G1LL54F56L462203" });
    const fromManual = normalizePlate(bankPlateToArabic("أ ب ح 1234"));
    expect(fromChassisRow).toBe(fromManual);
    const m = buildDupeColorMap([fromChassisRow, fromManual], 8);
    expect(m.get(fromManual)).toBe(0); // مكررة → لون واحد للاتنين
  });
  it("مايلوّنش قيمة مش لوحة (بنك/رقم) لو الكشف رجّع أول عمود", () => {
    expect(plateKeyFromRow({ "البنك": "الأهلي", "المبلغ": "50000" })).toBe("");
  });
  it("صف بلا لوحة → مفتاح فاضي (مايتحسبش في التلوين)", () => {
    expect(plateKeyFromRow({})).toBe("");
    expect(buildDupeColorMap(["", ""], 8).size).toBe(0);
  });
});

describe("buildDupeColorMap — لون لكل لوحة مكررة", () => {
  it("المكرر بس هو اللي بياخد لون (اللي مرة واحدة يفضل بلا لون)", () => {
    const m = buildDupeColorMap(["ابح1234", "ابح1234", "دهس5678"], 8);
    expect(m.get("ابح1234")).toBe(0);
    expect(m.has("دهس5678")).toBe(false);
  });

  it("كل لوحة مكررة بلون مختلف", () => {
    const m = buildDupeColorMap(["أ", "أ", "ب", "ب", "ج", "ج"], 8);
    expect(m.get("أ")).toBe(0);
    expect(m.get("ب")).toBe(1);
    expect(m.get("ج")).toBe(2);
  });

  it("٣ نسخ من نفس اللوحة = لون واحد ليهم كلهم", () => {
    const m = buildDupeColorMap(["س", "س", "س"], 8);
    expect(m.size).toBe(1);
    expect(m.get("س")).toBe(0);
  });

  it("اللون بترتيب أول ظهور (ثابت مايتغيّرش مع إعادة الرسم)", () => {
    const a = buildDupeColorMap(["ب", "ب", "أ", "أ"], 8);
    expect(a.get("ب")).toBe(0); // «ب» ظهرت الأول
    expect(a.get("أ")).toBe(1);
  });

  it("لو المكرر أكتر من عدد الألوان، الألوان بتلفّ من الأول", () => {
    const keys: string[] = [];
    for (let i = 0; i < 5; i++) keys.push(`p${i}`, `p${i}`);
    const m = buildDupeColorMap(keys, 3);
    expect(m.get("p0")).toBe(0);
    expect(m.get("p3")).toBe(0); // لفّت
    expect(m.get("p4")).toBe(1);
  });

  it("المفاتيح الفاضية بتتجاهل", () => {
    const m = buildDupeColorMap(["", "", "أ", "أ"], 8);
    expect(m.has("")).toBe(false);
    expect(m.get("أ")).toBe(0);
  });

  it("قائمة فاضية / بلا ألوان → خريطة فاضية", () => {
    expect(buildDupeColorMap([], 8).size).toBe(0);
    expect(buildDupeColorMap(["أ", "أ"], 0).size).toBe(0);
  });
});
