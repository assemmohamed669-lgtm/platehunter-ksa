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

  it("غير معروف أو فاضي → فاضي (فيفضل النص الأصلي عند التصدير)", () => {
    expect(typeToCode("")).toBe("");
    expect(typeToCode("مركونة")).toBe("");
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
    expect(VEHICLE_TYPE_LABELS.map(([c]) => c)).toEqual(["و", "ن", "ف", "ت", "دي", "د", "ب", "م", "H1"]);
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
