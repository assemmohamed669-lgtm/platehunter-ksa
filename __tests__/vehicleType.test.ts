import { describe, it, expect } from "vitest";
import { extractVehicleType } from "@/lib/plateParser";
import { typeToCode, VEHICLE_TYPE_CODES } from "@/lib/vehicleType";

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
  it("غير معروف أو فاضي → فاضي (فيفضل النص الأصلي عند التصدير)", () => {
    expect(typeToCode("")).toBe("");
    expect(typeToCode("دباب")).toBe("");
    expect(typeToCode("مركونة")).toBe("");
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
