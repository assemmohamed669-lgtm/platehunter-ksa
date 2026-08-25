import { describe, it, expect } from "vitest";
import { extractVehicleType } from "@/lib/plateParser";
import { typeToCode, VEHICLE_TYPE_CODES, VEHICLE_TYPE_LABELS, vehicleTypeLabel } from "@/lib/vehicleType";

describe("typeToCode — تحويل نوع السيارة للحرف المختصر (و/ف/ت/م)", () => {
  it("بيسيب الحرف زي ما هو", () => {
    for (const c of VEHICLE_TYPE_CODES) expect(typeToCode(c)).toBe(c);
  });
  it("بيحوّل الكلمة المنطوقة للحرف", () => {
    expect(typeToCode("ونيت")).toBe("و");
    expect(typeToCode("فان")).toBe("ف");
    expect(typeToCode("تاكسي")).toBe("ت");
    expect(typeToCode("أجرة")).toBe("ت");
    expect(typeToCode("ملاكي")).toBe("م");
    expect(typeToCode("خصوصي")).toBe("م");
  });
  it("الحرفان الجديدان (دي / د) موجودان في القائمة وبيرجعوا زي ما هما", () => {
    expect(VEHICLE_TYPE_CODES).toContain("دي");
    expect(VEHICLE_TYPE_CODES).toContain("د");
    expect(typeToCode("دي")).toBe("دي");
    expect(typeToCode("د")).toBe("د");   // «د» ماتتلغبطش بـ«دي»
  });
  it("الحروف الجديدة (ن = نقل • ب = باص) والكلمات بتاعتها", () => {
    expect(VEHICLE_TYPE_CODES).toContain("ن");
    expect(VEHICLE_TYPE_CODES).toContain("ب");
    expect(typeToCode("ن")).toBe("ن");
    expect(typeToCode("ب")).toBe("ب");
    expect(typeToCode("نقل")).toBe("ن");
    expect(typeToCode("باص")).toBe("ب");
    expect(typeToCode("اتوبيس")).toBe("ب");
  });

  it("الكلمات المنطوقة للحروف القديمة اللي ماكانتش متغطّاة", () => {
    expect(typeToCode("دباب")).toBe("د");
    expect(typeToCode("دينه")).toBe("دي");
  });

  it("مصدومة (مص) — موجودة في القائمة وبتترجم من الكلمة", () => {
    expect(VEHICLE_TYPE_CODES).toContain("مص");
    expect(typeToCode("مص")).toBe("مص");
    expect(typeToCode("مصدومة")).toBe("مص");
    expect(typeToCode("مصدوم")).toBe("مص");
    expect(typeToCode("مصدومه")).toBe("مص");
    expect(vehicleTypeLabel("مص")).toBe("مص (مصدومة)");
    expect(typeToCode("ملاكي")).toBe("م"); // مايتلغبطش مع مصدومة
  });

  it("متربة (مت) ومركونة (مر) — في القائمة وبتترجموا من الكلمة", () => {
    expect(VEHICLE_TYPE_CODES).toContain("مت");
    expect(VEHICLE_TYPE_CODES).toContain("مر");
    expect(typeToCode("مت")).toBe("مت");
    expect(typeToCode("متربة")).toBe("مت");
    expect(typeToCode("مترب")).toBe("مت");
    expect(typeToCode("متربه")).toBe("مت");
    expect(typeToCode("مر")).toBe("مر");
    expect(typeToCode("مركونة")).toBe("مر");
    expect(typeToCode("مركونه")).toBe("مر");
    expect(vehicleTypeLabel("مت")).toBe("مت (متربة)");
    expect(vehicleTypeLabel("مر")).toBe("مر (مركونة)");
  });

  it("جراج — في القائمة، بتترجم من الكلمة (جراج/كراج)، وبتتعرض من غير قوسين", () => {
    expect(VEHICLE_TYPE_CODES).toContain("جراج");
    expect(typeToCode("جراج")).toBe("جراج");
    expect(typeToCode("الجراج")).toBe("جراج");
    expect(typeToCode("كراج")).toBe("جراج");
    expect(vehicleTypeLabel("جراج")).toBe("جراج"); // المختصر = الاسم → بلا قوسين
  });

  it("غير معروف أو فاضي → فاضي (فيفضل النص الأصلي عند التصدير)", () => {
    expect(typeToCode("")).toBe("");
    expect(typeToCode("طيارة")).toBe("");   // مش نوع في القائمة
  });
});

describe("vehicleTypeLabel — شكل العرض في القايمة", () => {
  it("الاسم بين قوسين ومفصول عن الحرف بمسافة", () => {
    expect(vehicleTypeLabel("و")).toBe("و (ونيت)");
    expect(vehicleTypeLabel("ن")).toBe("ن (نقل)");
    expect(vehicleTypeLabel("ب")).toBe("ب (باص)");
    expect(vehicleTypeLabel("دي")).toBe("دي (دينه)");
  });

  it("الترتيب زي ما المالك طلبه", () => {
    // «ش» بعد «مو»، وحالات السيارة (مصدومة/متربة/مركونة) بعدها بطلب المالك.
    expect(VEHICLE_TYPE_LABELS.map(([c]) => c)).toEqual(["و", "ن", "ف", "ت", "دي", "د", "ب", "م", "مو", "ش", "مص", "مت", "مر", "جراج", "H1"]);
  });

  it("حرف مش في القايمة بيرجع زي ما هو", () => {
    expect(vehicleTypeLabel("ز")).toBe("ز");
  });
});

describe("extractVehicleType", () => {
  it("pulls the type spoken after the plate and returns the rest", () => {
    expect(extractVehicleType("ادن 6121 ونيت")).toEqual({ vehicleType: "ونيت", rest: "ادن 6121" });
  });

  it("detects the common field types", () => {
    expect(extractVehicleType("ابح 1234 مصدومة").vehicleType).toBe("مصدومة");
    expect(extractVehicleType("قنص 5678 فان").vehicleType).toBe("فان");
    expect(extractVehicleType("دحر 9999 دباب").vehicleType).toBe("دباب");
    expect(extractVehicleType("ابل 2150 مركونة").vehicleType).toBe("مركونة");
  });

  it("returns rest unchanged and no type when none present", () => {
    expect(extractVehicleType("ادن 6121")).toEqual({ rest: "ادن 6121" });
  });

  it("collapses the gap left where the type word was removed", () => {
    expect(extractVehicleType("ادن 6121 ونيت").rest).toBe("ادن 6121");
  });
});

describe("H1 — نوع مضاف بطلب المندوب", () => {
  it("H1 موجود في قايمة الأنواع", () => {
    expect(VEHICLE_TYPE_CODES).toContain("H1");
  });

  it("بيتعرض «H1» لوحده من غير قوسين", () => {
    expect(vehicleTypeLabel("H1")).toBe("H1");
  });

  it("typeToCode بيرجّع H1 مهما كانت حالة الحروف", () => {
    expect(typeToCode("H1")).toBe("H1");
    expect(typeToCode("h1")).toBe("H1");
    expect(typeToCode(" H1 ")).toBe("H1");
  });

  it("بيلقط النطق العربي لـH1", () => {
    expect(typeToCode("اتش وان")).toBe("H1");
    expect(typeToCode("إتش ١")).toBe("H1");
    expect(typeToCode("اتش1")).toBe("H1");
  });

  it("مابيأثرش على الأنواع القديمة", () => {
    expect(typeToCode("ونيت")).toBe("و");
    expect(typeToCode("فان")).toBe("ف");
    expect(typeToCode("ملاكي")).toBe("م");
    expect(vehicleTypeLabel("و")).toBe("و (ونيت)");
  });
});

/**
 * «موتوسيكل» اتضاف لقايمة أنواع السيارات (بطلب المندوب) — بيظهر في كل أنواع
 * التشييك (يدوي/كاميرا/صوتي/شاص/السجلات)، وبيتحفظ مع اللوحة، وبيطلع في
 * التصدير وفي نتيجة الفرز.
 *
 * ملاحظة: «د (دباب)» حاجة تانية غير الموتوسيكل — الاتنين موجودين.
 */
describe("موتوسيكل", () => {
  it("موجود في القايمة", () => {
    expect(VEHICLE_TYPE_CODES).toContain("مو");
  });

  it("بيتعرض باسمه الكامل في القايمة", () => {
    expect(vehicleTypeLabel("مو")).toBe("مو (موتوسيكل)");
  });

  it("الكلمة المنطوقة بتتحوّل للمختصر (للتشييك الصوتي)", () => {
    expect(typeToCode("موتوسيكل")).toBe("مو");
    expect(typeToCode("موتسيكل")).toBe("مو");
    expect(typeToCode("موتور")).toBe("مو");
    expect(typeToCode("موتوسكل")).toBe("مو");
  });

  it("المختصر نفسه بيعدّي زي ما هو", () => {
    expect(typeToCode("مو")).toBe("مو");
  });

  it("مابيتلخبطش مع «م (ملاكي)» ولا «د (دباب)»", () => {
    expect(typeToCode("م")).toBe("م");
    expect(typeToCode("ملاكي")).toBe("م");
    expect(typeToCode("دباب")).toBe("د");
    expect(typeToCode("د")).toBe("د");
  });
});

/**
 * «ش = شاص» — نوع بيتكرر كتير في الميدان السعودي (وانيت الشاص). المندوب
 * لازم يلاقيه في قايمة النوع، ولازم الصوت اللي يسمع «شاص» يحوّله للحرف.
 */
describe("ش = شاص", () => {
  it("موجود في القايمة باسمه", () => {
    expect(VEHICLE_TYPE_CODES).toContain("ش");
    expect(VEHICLE_TYPE_LABELS.find(([c]) => c === "ش")?.[1]).toBe("شاص");
    expect(vehicleTypeLabel("ش")).toBe("ش (شاص)");
  });

  it("الحرف بيرجع زي ما هو", () => {
    expect(typeToCode("ش")).toBe("ش");
  });

  it("الكلمة المنطوقة بتتحوّل للحرف", () => {
    expect(typeToCode("شاص")).toBe("ش");
    expect(typeToCode("الشاص")).toBe("ش");
    expect(typeToCode("شاصي")).toBe("ش");
  });

  it("ماتتلخبطش مع الأنواع التانية", () => {
    expect(typeToCode("ونيت")).toBe("و");
    expect(typeToCode("نقل")).toBe("ن");
    expect(typeToCode("موتوسيكل")).toBe("مو");
    expect(typeToCode("شاحنة")).not.toBe("ش");
  });

  it("الأنواع القديمة وترتيبها مالمستش", () => {
    expect(VEHICLE_TYPE_CODES.slice(0, 9)).toEqual(["و", "ن", "ف", "ت", "دي", "د", "ب", "م", "مو"]);
  });
});
