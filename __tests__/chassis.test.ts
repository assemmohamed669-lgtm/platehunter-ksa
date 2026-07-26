import { describe, it, expect } from "vitest";
import {
  normalizeChassis,
  detectChassisColumn,
  pickBestChassisSource,
  buildChassisIndex,
  matchChassisInIndex,
  type SheetTable,
} from "@/lib/chassis";

describe("normalizeChassis — تطبيع رقم الشاص", () => {
  it("يكبّر الحروف ويشيل الفراغات والشرطات والنقط والشرطة السفلية والسلاش", () => {
    expect(normalizeChassis("3n1cn8ad xpl-824")).toBe("3N1CN8ADXPL824");
    expect(normalizeChassis("mhf.lw9_2020")).toBe("MHFLW92020");
    expect(normalizeChassis("JT2/BG22K")).toBe("JT2BG22K");
  });
  it("يحوّل الأرقام العربية لإنجليزية", () => {
    expect(normalizeChassis("AB ١٢٣٤٥٦٧٨")).toBe("AB12345678");
  });
  it("فاضي/غير نصّي → فاضي", () => {
    expect(normalizeChassis("")).toBe("");
    // @ts-expect-error اختبار مدخل غير نصّي
    expect(normalizeChassis(null)).toBe("");
    // @ts-expect-error اختبار مدخل غير نصّي
    expect(normalizeChassis(undefined)).toBe("");
  });
});

describe("detectChassisColumn — اكتشاف عمود الشاص", () => {
  it("يمسك «رقم الهيكل» العربي", () => {
    expect(detectChassisColumn(["رقم اللوحة", "رقم الهيكل", "لون المركبة"])).toBe("رقم الهيكل");
  });
  it("يمسك «Chassis Number» و«TAMM VIN» الإنجليزي", () => {
    expect(detectChassisColumn(["Plate Number", "Chassis Number", "Year Model"])).toBe("Chassis Number");
    expect(detectChassisColumn(["Plate Number", "TAMM VIN"])).toBe("TAMM VIN");
  });
  it("ما يخلطش بين «نوع الهيكل» (نوع البدن) و«رقم الهيكل» (رقم الشاص)", () => {
    const rows = [
      { "نوع الهيكل": "ونيت", "النوع": "هايلوكس" },
      { "نوع الهيكل": "صالون", "النوع": "كامري" },
    ];
    expect(detectChassisColumn(["نوع الهيكل", "النوع"], rows)).toBeNull();
  });
  it("مافيش عمود شاص → null", () => {
    expect(detectChassisColumn(["رقم اللوحة", "الحي", "اللون"])).toBeNull();
  });
  it("بدون اسم واضح يكتشف بالمحتوى (رقم طويل حروف+أرقام) ومايختارش عمود اللوحة", () => {
    const rows = [
      { "اللوحة": "ابح1234", "الرقم": "3N1CN8ADXPL824" },
      { "اللوحة": "دهس5678", "الرقم": "JT2BG22K1W0123456" },
      { "اللوحة": "كقو9012", "الرقم": "MHFLW9EM5K1234567" },
    ];
    expect(detectChassisColumn(["اللوحة", "الرقم"], rows)).toBe("الرقم");
  });
});

describe("pickBestChassisSource — اختيار أغنى ورقة فيها عمود شاص", () => {
  const sheetFew: SheetTable = {
    sheetName: "ورقة1",
    headers: ["رقم اللوحة", "رقم الهيكل"],
    rows: [
      { "رقم اللوحة": "ابح1234", "رقم الهيكل": "3N1CN8ADXPL824" },
      { "رقم اللوحة": "دهس5678", "رقم الهيكل": "" },
    ],
  };
  const sheetMany: SheetTable = {
    sheetName: "تشييك",
    headers: ["Plate Number", "Chassis Number"],
    rows: [
      { "Plate Number": "AB1234", "Chassis Number": "JT2BG22K1W0000001" },
      { "Plate Number": "CD5678", "Chassis Number": "JT2BG22K1W0000002" },
      { "Plate Number": "EF9012", "Chassis Number": "JT2BG22K1W0000003" },
    ],
  };
  const sheetNone: SheetTable = { sheetName: "فارغة", headers: ["الحي", "اللون"], rows: [{ "الحي": "النرجس", "اللون": "أبيض" }] };

  it("يختار الورقة اللي عمود الشاص فيها قيم أكتر", () => {
    const src = pickBestChassisSource([sheetFew, sheetMany, sheetNone]);
    expect(src).not.toBeNull();
    expect(src!.sheetName).toBe("تشييك");
    expect(src!.chassisCol).toBe("Chassis Number");
  });
  it("مافيش أي ورقة فيها شاص → null", () => {
    expect(pickBestChassisSource([sheetNone])).toBeNull();
  });
});

describe("buildChassisIndex + matchChassisInIndex — المطابقة", () => {
  const rows = [
    { "رقم اللوحة": "ابح1234", "رقم الهيكل": "3N1CN8ADXPL824" },
    { "رقم اللوحة": "دهس5678", "رقم الهيكل": "JT2BG22K1W0123456" },
  ];
  const index = buildChassisIndex(rows, "رقم الهيكل");

  it("يبني فهرس مطبّع", () => {
    expect(index.size).toBe(2);
    expect(index.has("3N1CN8ADXPL824")).toBe(true);
  });
  it("مطابقة تامة (رغم اختلاف الشكل/الفراغات)", () => {
    const m = matchChassisInIndex(index, "3n1cn8ad xpl-824");
    expect(m.found).toBe(true);
    expect(m.matchType).toBe("exact");
    expect(m.row?.["رقم اللوحة"]).toBe("ابح1234");
  });
  it("مطابقة تقريبية بفرق خانة واحدة", () => {
    const m = matchChassisInIndex(index, "3N1CN8ADXPL820");
    expect(m.found).toBe(true);
    expect(m.matchType).toBe("fuzzy");
    expect(m.distance).toBe(1);
    expect(m.similarity).toBeGreaterThan(85);
  });
  it("فرق 3 خانات → مش موجود", () => {
    const m = matchChassisInIndex(index, "3N1CN8ADXPL999");
    expect(m.found).toBe(false);
  });
  it("مدخل فاضي → مش موجود", () => {
    const m = matchChassisInIndex(index, "");
    expect(m.found).toBe(false);
  });
});
