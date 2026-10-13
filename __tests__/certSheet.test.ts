import { describe, it, expect } from "vitest";
import { certSheetRows, CERT_SHEET_COLUMNS, type DailyCertEntry } from "@/lib/certDaily";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📄 شيت «مشاركة الشهايد إكسيل»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٤ أكتوبر ٢٠٢٦): «زر اسمه مشاركة الشهايد إكسيل … الشيت يبقى فيه:
 *  رقم اللوحة بالعربي · نوع المركبة · المصنع · لون المركبة · سنة الصنع ·
 *  اسم المؤجر · اسم المستأجر · رقم الهيكل · رقم تسجيل العقد … ويظهر كل
 *  اللوحات اللي نزلت وقت ما نزل أو شارك الشيت».
 *
 *  الشيت = **كل** شهايد اليوم، مش اللي طابقت داتا المندوب بس.
 */
const e = (over: Partial<DailyCertEntry> = {}): DailyCertEntry => ({
  fileId: "f1", name: "x.pdf", createdAt: "2026-10-14T08:00:00Z",
  plate: "ابح1234", plateText: "ا ب ح 1234", vin: "VIN1", bank: "مصرف الراجحي",
  tenant: "فلان الفلاني", make: "تويوتا", model: "كامري", year: "2021", color: "ابيض",
  status: "متعثر", certDate: "21/07/2025", certNo: "CRN-119-001",
  ...over,
});

describe("أعمدة الشيت", () => {
  it("🔴 بالترتيب اللي المالك طلبه بالظبط", () => {
    expect(CERT_SHEET_COLUMNS).toEqual([
      "رقم اللوحة", "نوع المركبة", "المصنع", "لون المركبة", "سنة الصنع",
      "اسم المؤجر", "اسم المستأجر", "رقم الهيكل", "رقم تسجيل العقد",
    ]);
  });

  it("🔴 كل خانة من مكانها الصح", () => {
    const [row] = certSheetRows([e()]);
    expect(row).toEqual({
      "رقم اللوحة": "ا ب ح 1234",
      "نوع المركبة": "كامري",
      "المصنع": "تويوتا",
      "لون المركبة": "ابيض",
      "سنة الصنع": "2021",
      "اسم المؤجر": "مصرف الراجحي",
      "اسم المستأجر": "فلان الفلاني",
      "رقم الهيكل": "VIN1",
      "رقم تسجيل العقد": "CRN-119-001",
    });
  });

  it("الخانة الناقصة بتبقى فاضية — مش «undefined» ولا «null»", () => {
    const [row] = certSheetRows([e({ tenant: "", certNo: undefined, color: "" })]);
    expect(row["اسم المستأجر"]).toBe("");
    expect(row["رقم تسجيل العقد"]).toBe("");
    expect(row["لون المركبة"]).toBe("");
    expect(JSON.stringify(row)).not.toMatch(/undefined|null/);
  });

  it("مفيش لوحة بالعربي ⇒ بيرجع لمفتاح اللوحة بدل ما يسيبها فاضية", () => {
    const [row] = certSheetRows([e({ plateText: "", plate: "ابح1234" })]);
    expect(row["رقم اللوحة"]).toBe("ابح1234");
  });

  it("🔴 نفس اللوحة من كذا شركة ⇒ صف واحد (الأغنى بالبيانات)", () => {
    const rows = certSheetRows([
      e({ fileId: "a", tenant: "", color: "", vin: "" }),
      e({ fileId: "b" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]["اسم المستأجر"]).toBe("فلان الفلاني");
  });

  it("لوحات مختلفة ⇒ صف لكل واحدة", () => {
    const rows = certSheetRows([
      e({ fileId: "a", plate: "ابح1234", plateText: "ا ب ح 1234" }),
      e({ fileId: "b", plate: "دنح4321", plateText: "د ن ح 4321" }),
    ]);
    expect(rows.map((r) => r["رقم اللوحة"])).toEqual(["ا ب ح 1234", "د ن ح 4321"]);
  });

  it("مفيش شهايد ⇒ مفيش صفوف (الزرار بيقول «مفيش» بدل شيت فاضي)", () => {
    expect(certSheetRows([])).toEqual([]);
  });
});
