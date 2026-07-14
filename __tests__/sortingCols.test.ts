import { describe, it, expect } from "vitest";
import { matchesPreferred, guessDefaultColumns, detectMakeModelColumn, looksLikeCarName } from "@/lib/sortingCols";

describe("detectMakeModelColumn — by header name", () => {
  it("matches an explicit Arabic make column", () => {
    expect(detectMakeModelColumn(["رقم اللوحة", "صانع المركبة", "الحي"])).toBe("صانع المركبة");
  });
  it("matches الماركة", () => {
    expect(detectMakeModelColumn(["رقم اللوحة", "الماركة", "GPS"])).toBe("الماركة");
  });
  it("matches an English Vehicle Name / Model column", () => {
    expect(detectMakeModelColumn(["Plate Number", "Vehicle Name", "Chassis"])).toBe("Vehicle Name");
    expect(detectMakeModelColumn(["Plate", "Model", "Year"])).toBe("Model");
  });
});

describe("detectMakeModelColumn — by content when the header is unrecognizable", () => {
  const rows = [
    { "رقم اللوحة": "أبح1234", "عمود ١": "كورولا", "الحي": "العليا" },
    { "رقم اللوحة": "دبك5678", "عمود ١": "يارس", "الحي": "الملز" },
    { "رقم اللوحة": "سصع9012", "عمود ١": "هايلوكس", "الحي": "النزهة" },
    { "رقم اللوحة": "طقن3456", "عمود ١": "أزيرا", "الحي": "الروضة" },
  ];
  it("detects the column whose VALUES are car names even with a meaningless header", () => {
    expect(detectMakeModelColumn(["رقم اللوحة", "عمود ١", "الحي"], rows)).toBe("عمود ١");
  });
  it("returns null when no column has car-name content and no header matches", () => {
    const plain = [
      { "رقم اللوحة": "أبح1234", "الحي": "العليا", "اللون": "أبيض" },
      { "رقم اللوحة": "دبك5678", "الحي": "الملز", "اللون": "أسود" },
      { "رقم اللوحة": "سصع9012", "الحي": "النزهة", "اللون": "فضي" },
    ];
    expect(detectMakeModelColumn(["رقم اللوحة", "الحي", "اللون"], plain)).toBeNull();
  });
  it("prefers the header match over content scan", () => {
    const rows2 = [
      { "الماركة": "تويوتا", "ملاحظة": "كامري أبيض" },
      { "الماركة": "نيسان", "ملاحظة": "صني" },
      { "الماركة": "كيا", "ملاحظة": "ريو" },
    ];
    expect(detectMakeModelColumn(["الماركة", "ملاحظة"], rows2)).toBe("الماركة");
  });
});

describe("looksLikeCarName", () => {
  it("recognizes Arabic and English car names inside a longer value", () => {
    expect(looksLikeCarName("تويوتا كورولا 2020")).toBe(true);
    expect(looksLikeCarName("Toyota Hilux")).toBe(true);
    expect(looksLikeCarName("أبيض")).toBe(false);
  });
});

describe("matchesPreferred — English headers (case-insensitive)", () => {
  it("matches color / type / make regardless of case", () => {
    expect(matchesPreferred("COLOR")).toBe(true);
    expect(matchesPreferred("Color")).toBe(true);
    expect(matchesPreferred("color")).toBe(true);
    expect(matchesPreferred("TYPE OF CAR")).toBe(true);
    expect(matchesPreferred("Type Of Car")).toBe(true);
    expect(matchesPreferred("Make")).toBe(true);
    expect(matchesPreferred("Year Model")).toBe(true);
  });
  it("matches Arabic color/type/district/year", () => {
    expect(matchesPreferred("لون المركبة الأساسي")).toBe(true);
    expect(matchesPreferred("نوع السيارة")).toBe(true);
    expect(matchesPreferred("الحي")).toBe(true);
    expect(matchesPreferred("سنة الصنع")).toBe(true);
  });
});

// ─── Columns from actual uploaded files ──────────────────────────────────────

// Data file (نسخه من التفريغ / داتا ج): رقم اللوحة, GPS, تاريخ التسجيل, الحي, نوع السيارة, ...
const DATA_FILE_HEADERS = [
  "رقم اللوحة",
  "GPS",
  "تاريخ التسجيل",
  "الحي",
  "الشارع",
  "ملاحظات",
  "نوع السيارة",
  "اسم المسجّل",
  "موقع الشارع",
];

// Arabic bank referral file (مجمع البنك الاهلي): رقماللوحة, طراز المركبة, صانع المركبة, سنة الصنع, لون المركبة الأساسي, رقم الهيكل, ...
const ARABIC_BANK_HEADERS = [
  "رقماللوحة",
  "F-Account number",
  "Agency",
  "طراز المركبة",
  "رقم الهيكل",
  "نوع تسجيل اللوحة",
  "صانع المركبة",
  "سنة الصنع",
  "لون المركبة الأساسي",
  "اسم المستخدم الفعلي",
];

// English bank referral file (شيت احاله بنك): Plate Number, Vehicle Name, Chassis Number, Year Model, ...
const ENGLISH_BANK_HEADERS = [
  "Plate Number",
  "Vehicle Name",
  "Chassis Number",
  "TAMM VIN",
  "Year Model",
  "Number Of Violations",
  "Insurance",
  "Certificate No",
];

// ─── matchesPreferred ─────────────────────────────────────────────────────────

describe("matchesPreferred — data file columns", () => {
  it("matches GPS", () => expect(matchesPreferred("GPS")).toBe(true));
  it("matches الحي", () => expect(matchesPreferred("الحي")).toBe(true));
  it("matches نوع السيارة", () => expect(matchesPreferred("نوع السيارة")).toBe(true));
  it("does NOT match تاريخ التسجيل", () => expect(matchesPreferred("تاريخ التسجيل")).toBe(false));
  it("does NOT match اسم المسجّل", () => expect(matchesPreferred("اسم المسجّل")).toBe(false));
  it("does NOT match الشارع", () => expect(matchesPreferred("الشارع")).toBe(false));
});

describe("matchesPreferred — Arabic bank referral columns", () => {
  it("matches طراز المركبة as brand column", () => expect(matchesPreferred("طراز المركبة")).toBe(true));
  it("matches صانع المركبة as brand column", () => expect(matchesPreferred("صانع المركبة")).toBe(true));
  it("matches سنة الصنع as year column", () => expect(matchesPreferred("سنة الصنع")).toBe(true));
  it("matches لون المركبة الأساسي as color column", () => expect(matchesPreferred("لون المركبة الأساسي")).toBe(true));
  it("does NOT match رقم الهيكل", () => expect(matchesPreferred("رقم الهيكل")).toBe(false));
  it("does NOT match نوع تسجيل اللوحة", () => expect(matchesPreferred("نوع تسجيل اللوحة")).toBe(false));
  it("does NOT match Agency", () => expect(matchesPreferred("Agency")).toBe(false));
  it("does NOT match F-Account number", () => expect(matchesPreferred("F-Account number")).toBe(false));
});

describe("matchesPreferred — English bank referral columns", () => {
  it("matches Vehicle Name as brand column", () => expect(matchesPreferred("Vehicle Name")).toBe(true));
  it("matches Year Model as year column", () => expect(matchesPreferred("Year Model")).toBe(true));
  it("does NOT match Chassis Number", () => expect(matchesPreferred("Chassis Number")).toBe(false));
  it("does NOT match TAMM VIN", () => expect(matchesPreferred("TAMM VIN")).toBe(false));
  it("does NOT match Insurance", () => expect(matchesPreferred("Insurance")).toBe(false));
  it("does NOT match Number Of Violations", () => expect(matchesPreferred("Number Of Violations")).toBe(false));
  it("does NOT match Certificate No", () => expect(matchesPreferred("Certificate No")).toBe(false));
});

// ─── guessDefaultColumns ──────────────────────────────────────────────────────

describe("guessDefaultColumns — data file", () => {
  it("auto-selects only GPS, الحي, نوع السيارة (not dates/names/streets)", () => {
    const result = guessDefaultColumns(DATA_FILE_HEADERS, "رقم اللوحة");
    expect(result).toContain("GPS");
    expect(result).toContain("الحي");
    expect(result).toContain("نوع السيارة");
    expect(result).not.toContain("تاريخ التسجيل");
    expect(result).not.toContain("الشارع");
    expect(result).not.toContain("اسم المسجّل");
    expect(result).not.toContain("ملاحظات");
  });
});

describe("guessDefaultColumns — Arabic bank referral file", () => {
  it("auto-selects طراز المركبة, صانع المركبة, سنة الصنع, لون المركبة الأساسي", () => {
    const result = guessDefaultColumns(ARABIC_BANK_HEADERS, "رقماللوحة");
    expect(result).toContain("طراز المركبة");
    expect(result).toContain("صانع المركبة");
    expect(result).toContain("سنة الصنع");
    expect(result).toContain("لون المركبة الأساسي");
  });

  it("does NOT auto-select رقم الهيكل or Agency", () => {
    const result = guessDefaultColumns(ARABIC_BANK_HEADERS, "رقماللوحة");
    expect(result).not.toContain("رقم الهيكل");
    expect(result).not.toContain("Agency");
    expect(result).not.toContain("F-Account number");
  });
});

describe("guessDefaultColumns — English bank referral file", () => {
  it("auto-selects Vehicle Name and Year Model only", () => {
    const result = guessDefaultColumns(ENGLISH_BANK_HEADERS, "Plate Number");
    expect(result).toContain("Vehicle Name");
    expect(result).toContain("Year Model");
    expect(result).not.toContain("Chassis Number");
    expect(result).not.toContain("TAMM VIN");
    expect(result).not.toContain("Insurance");
    expect(result).not.toContain("Certificate No");
    expect(result).not.toContain("Number Of Violations");
  });
});
