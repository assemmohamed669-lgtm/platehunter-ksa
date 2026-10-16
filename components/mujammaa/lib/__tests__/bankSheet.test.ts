import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  buildBankSheet,
  detectPlateColumn,
  matchInBankSheet,
  parseBankSheetFile,
  rowDetails,
  type BankRow,
} from "../bankSheet";

const HEADERS = ["رقم اللوحة", "طراز المركبة", "صانع المركبة", "سنة الصنع", "لون المركبة"];

const ROWS: BankRow[] = [
  {
    "رقم اللوحة": "أ ب ح 1234",
    "طراز المركبة": "كامري",
    "صانع المركبة": "تويوتا",
    "سنة الصنع": "2019",
    "لون المركبة": "أبيض",
  },
  {
    "رقم اللوحة": "س ص ط 5678",
    "طراز المركبة": "سوناتا",
    "صانع المركبة": "هيونداي",
    "سنة الصنع": "2021",
    "لون المركبة": "أسود",
  },
];

const sheet = buildBankSheet(HEADERS, ROWS, {
  fileName: "بنك.xlsx",
  sheetName: "إحالة",
});

describe("detectPlateColumn", () => {
  it("بيلاقي العمود من اسمه", () => {
    expect(detectPlateColumn(HEADERS, ROWS)).toBe("رقم اللوحة");
  });

  it("بيلاقيه من المحتوى لو الاسم مش واضح", () => {
    const headers = ["كود", "بيانات", "ملاحظة"];
    const rows: BankRow[] = [
      { كود: "1", بيانات: "أ ب ح 1234", ملاحظة: "لا شيء" },
      { كود: "2", بيانات: "س ص ط 5678", ملاحظة: "لا شيء" },
    ];
    expect(detectPlateColumn(headers, rows)).toBe("بيانات");
  });

  it("بيشتغل على أعمدة إنجليزية", () => {
    const headers = ["Plate Number", "Vehicle Name"];
    const rows: BankRow[] = [{ "Plate Number": "NKD 5678", "Vehicle Name": "Camry" }];
    expect(detectPlateColumn(headers, rows)).toBe("Plate Number");
  });
});

describe("buildBankSheet", () => {
  it("بيبني فهرس بلوحات مطبّعة", () => {
    expect(sheet.plateColumn).toBe("رقم اللوحة");
    expect(sheet.index.has("ابح1234")).toBe(true);
    expect(sheet.index.has("سصط5678")).toBe(true);
    expect(sheet.plates).toHaveLength(2);
  });

  it("بيعدّ الصفوف اللي مالهاش لوحة", () => {
    const s = buildBankSheet(
      HEADERS,
      [...ROWS, { ...ROWS[0], "رقم اللوحة": "" }],
      { fileName: "x", sheetName: "y" }
    );
    expect(s.skipped).toBe(1);
  });

  it("أول ظهور للوحة المكرّرة هو اللي يكسب", () => {
    const s = buildBankSheet(
      HEADERS,
      [ROWS[0], { ...ROWS[0], "طراز المركبة": "كورولا" }],
      { fileName: "x", sheetName: "y" }
    );
    expect(s.index.get("ابح1234")?.["طراز المركبة"]).toBe("كامري");
  });

  it("بيقرا لوحات البنك الإنجليزية بالتخطيطين", () => {
    const s = buildBankSheet(
      ["Plate Number", "Vehicle Name"],
      [
        { "Plate Number": "NKD 5678", "Vehicle Name": "Camry" },
        { "Plate Number": "7709 ABS", "Vehicle Name": "Sonata" },
      ],
      { fileName: "x", sheetName: "y" }
    );
    expect(s.index.has("نكد5678")).toBe(true);
    expect(s.index.has("سبا7709")).toBe(true);
  });
});

describe("matchInBankSheet", () => {
  it("تطابق تام", () => {
    const m = matchInBankSheet(sheet, "ابح1234");
    expect(m.kind).toBe("exact");
    expect(m.similarity).toBe(100);
    expect(m.row?.["طراز المركبة"]).toBe("كامري");
  });

  it("تطابق تام مع لوحة مكتوبة بمسافات", () => {
    expect(matchInBankSheet(sheet, "أ ب ح 1234").kind).toBe("exact");
  });

  /**
   * ⛔ اتغيّر بقرار المالك (٢٠٢٦/٨/١٥): كان بيتوقّع «fuzzy» على فرق خانة.
   * التطابق التقريبي اتشال خالص — «مطلوبة» = تطابق كامل بس.
   * السبب والتمن مكتوبين في ‎bankSheet.ts‎ و‎wantedExact.test.ts‎.
   */
  it("فرق حرف واحد = **مش مطلوبة**", () => {
    expect(matchInBankSheet(sheet, "ابط1234").kind).toBe("none");
  });

  it("فرق خانتين = مش مطلوبة كذلك", () => {
    expect(matchInBankSheet(sheet, "ابط1235").kind).toBe("none");
  });

  it("لوحة بعيدة = مافيش تطابق", () => {
    expect(matchInBankSheet(sheet, "نوي9999").kind).toBe("none");
  });

  it("بلا شيت مرفوع = مافيش تطابق بلا كراش", () => {
    expect(matchInBankSheet(null, "ابح1234").kind).toBe("none");
  });

  it("لوحة فاضية = مافيش تطابق", () => {
    expect(matchInBankSheet(sheet, "").kind).toBe("none");
  });
});

/* ==========================================================================
 *  قراءة ملف Excel حقيقي — مش صفوف جاهزة
 * ==========================================================================
 *  الاختبارات فوق بتفحص المنطق. الاختبار ده بيبني ملف xlsx فعلي بنفس
 *  المكتبة اللي التطبيق بيقرا بيها، وبيمرّره على نفس المسار اللي المندوب
 *  بيستخدمه لما يرفع ملف من الشاشة.
 */
function makeXlsxFile(
  rows: Record<string, string>[],
  sheetName = "إحالة",
  fileName = "بنك.xlsx"
): File {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseBankSheetFile — ملف Excel حقيقي", () => {
  it("بيقرا ملف xlsx ويبني الفهرس", async () => {
    const file = makeXlsxFile([
      { "رقم اللوحة": "أ ب ح 1234", "طراز المركبة": "كامري", "لون المركبة": "أبيض" },
      { "رقم اللوحة": "س ص ط 5678", "طراز المركبة": "سوناتا", "لون المركبة": "أسود" },
    ]);

    const parsed = await parseBankSheetFile(file);

    expect(parsed.fileName).toBe("بنك.xlsx");
    expect(parsed.sheetName).toBe("إحالة");
    expect(parsed.plateColumn).toBe("رقم اللوحة");
    expect(parsed.plates.sort()).toEqual(["ابح1234", "سصط5678"].sort());
    expect(parsed.index.get("ابح1234")?.["طراز المركبة"]).toBe("كامري");
  });

  it("بيفضّل ورقة «تشييك» لو موجودة", async () => {
    const worksheetA = XLSX.utils.json_to_sheet([{ "رقم اللوحة": "أ ب ح 1111" }]);
    const worksheetB = XLSX.utils.json_to_sheet([{ "رقم اللوحة": "س ص ط 2222" }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheetA, "ورقة1");
    XLSX.utils.book_append_sheet(workbook, worksheetB, "تشييك");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new File([bytes], "x.xlsx");

    const parsed = await parseBankSheetFile(file);
    expect(parsed.sheetName).toBe("تشييك");
    expect(parsed.plates).toEqual(["سصط2222"]);
  });

  it("بيقرا لوحات البنوك الإنجليزية من ملف حقيقي بالتخطيطين", async () => {
    const file = makeXlsxFile([
      { "Plate Number": "NKD 5678", "Vehicle Name": "Camry" },
      { "Plate Number": "7709 ABS", "Vehicle Name": "Accent" },
    ]);

    const parsed = await parseBankSheetFile(file);
    expect(parsed.plateColumn).toBe("Plate Number");
    expect(parsed.plates.sort()).toEqual(["نكد5678", "سبا7709"].sort());
  });

  it("ملف CSV بيتقرا كذلك", async () => {
    const csv = "رقم اللوحة,طراز المركبة\nأ ب ح 1234,كامري\nس ص ط 5678,سوناتا\n";
    const file = new File(["﻿" + csv], "بنك.csv", { type: "text/csv" });

    const parsed = await parseBankSheetFile(file);
    expect(parsed.plates.sort()).toEqual(["ابح1234", "سصط5678"].sort());
  });

  it("ملف فاضي بيرمي خطأ برسالة مفهومة مش كراش", async () => {
    const file = makeXlsxFile([]);
    await expect(parseBankSheetFile(file)).rejects.toThrow(/فاضية/);
  });

  it("ملف مش Excel خالص بيرمي خطأ مش بيكسر التطبيق", async () => {
    const file = new File(["مجرد نص عادي مش ملف"], "x.txt", { type: "text/plain" });
    await expect(parseBankSheetFile(file)).rejects.toThrow();
  });
});

describe("rowDetails", () => {
  it("بيرجّع كل التفاصيل ما عدا عمود اللوحة", () => {
    const details = rowDetails(sheet.index.get("ابح1234"), sheet.plateColumn);
    const labels = details.map((d) => d.label);
    expect(labels).not.toContain("رقم اللوحة");
    expect(labels).toContain("طراز المركبة");
    expect(details.find((d) => d.label === "لون المركبة")?.value).toBe("أبيض");
  });

  it("بيشيل الخانات الفاضية", () => {
    const details = rowDetails(
      { "رقم اللوحة": "ابح1234", "طراز المركبة": "كامري", "لون المركبة": "" },
      "رقم اللوحة"
    );
    expect(details).toHaveLength(1);
  });

  it("بلا صف = قائمة فاضية", () => {
    expect(rowDetails(undefined, "رقم اللوحة")).toEqual([]);
  });
});
