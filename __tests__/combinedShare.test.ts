import { describe, it, expect } from "vitest";
import { buildCombinedShareRows, tashyeekShareRow, type ShareDataRow } from "@/lib/combinedShare";

/**
 * الفرز بيطلّع نافذتين: سيارات **الداتا** وسيارات **السجلات** (شيت التشييك).
 * المندوب عايز المشاركة الواحدة تطلع فيها الاتنين، وسيارات السجلات يتكتب
 * قدامها «سجلات» عشان يعرف إنها من التشييك مش من الداتا.
 */

const DATA: ShareDataRow[] = [
  { src: "", plate: "ا ب ح 1234", type: "صالون", model: "لاندكروزر", bank: "الراجحي", dist: "الواحة", addr: "8واحه ليلي", date: "01/08/2026", gps: "https://maps.app.goo.gl/a", color: "ابيض", notes: "" },
  { src: "", plate: "د ن ر 5678", type: "H1", model: "باترول", bank: "", dist: "السامر", addr: "", date: "", gps: "", color: "اسود", notes: "مركونة" },
];
const TASH: ShareDataRow[] = [
  { src: "سجلات", plate: "ر ل د 6202", type: "نقل", model: "هايلكس", bank: "", dist: "الأجواد", addr: "", date: "05/08/2026", gps: "https://maps.app.goo.gl/b", color: "فضي", notes: "" },
];

describe("buildCombinedShareRows — الداتا والسجلات في مشاركة واحدة", () => {
  it("الصفوف بتتلمّ ورا بعض: الداتا الأول وبعدها السجلات", () => {
    const { rows } = buildCombinedShareRows(DATA, TASH);
    expect(rows).toHaveLength(3);
    expect(rows[0].plate).toBe("ا ب ح 1234");
    expect(rows[2].plate).toBe("ر ل د 6202");
  });

  it("سيارات السجلات معلّم قدامها «سجلات» والداتا فاضية", () => {
    const { rows, hasSrc } = buildCombinedShareRows(DATA, TASH);
    expect(hasSrc).toBe(true);
    expect(rows.map((r) => r.src)).toEqual(["", "", "سجلات"]);
  });

  it("من غير سجلات → مافيش عمود «المصدر» خالص (نفس الشكل القديم)", () => {
    const { rows, hasSrc } = buildCombinedShareRows(DATA, []);
    expect(hasSrc).toBe(false);
    expect(rows).toHaveLength(2);
  });

  it("سجلات من غير داتا بتشتغل برضه", () => {
    const { rows, hasSrc } = buildCombinedShareRows([], TASH);
    expect(hasSrc).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].src).toBe("سجلات");
  });

  it("عمود البنك بيظهر لو أي صف فيه بنك، والتاريخ كذلك", () => {
    const { hasBank, hasDate } = buildCombinedShareRows(DATA, TASH);
    expect(hasBank).toBe(true);
    expect(hasDate).toBe(true);
  });

  it("مفيش بنك ولا تاريخ → الأعمدة دي مابتظهرش", () => {
    const bare: ShareDataRow[] = [{ src: "", plate: "ابح1234", type: "", model: "", bank: "", dist: "", addr: "", date: "", gps: "", color: "", notes: "" }];
    const { hasBank, hasDate } = buildCombinedShareRows(bare, []);
    expect(hasBank).toBe(false);
    expect(hasDate).toBe(false);
  });

  it("ترتيب الأعمدة زي ما المندوب طلب: المصدر › المطلوب › نوع السيارة › الموقع", () => {
    const { columns } = buildCombinedShareRows(DATA, TASH);
    expect(columns.slice(0, 5)).toEqual(["المصدر", "المطلوب", "نوع السيارة", "العنوان", "الحي"]);
  });

  it("من غير سجلات الترتيب بيفضل زي الأول بالظبط (المطلوب أول عمود)", () => {
    const { columns } = buildCombinedShareRows(DATA, []);
    expect(columns[0]).toBe("المطلوب");
    expect(columns.slice(0, 4)).toEqual(["المطلوب", "نوع السيارة", "العنوان", "الحي"]);
  });

  it("صفوف الصورة بتطابق الأعمدة عدداً وترتيباً", () => {
    const { columns, imageRows } = buildCombinedShareRows(DATA, TASH);
    for (const r of imageRows) expect(r).toHaveLength(columns.length);
    expect(imageRows[2][0]).toBe("سجلات");
    expect(imageRows[2][1]).toBe("ر ل د 6202");
  });
});

/**
 * سيارات **السجلات** في المشاركة كانت بتطلع باللوحة بس — من غير النوع ولا
 * الماركة ولا الموقع ولا الملاحظات ولا التاريخ. السبب: كان بيتعاد حلّ الأعمدة
 * بمفاتيح ناقصة بدل ما نقرا من الصف اللي المندوب شايفه في النافذة.
 */
describe("tashyeekShareRow — كل تفاصيل سيارة السجلات في المشاركة", () => {
  // نفس شكل الصف اللي بيظهر في نافذة السجلات
  const row = {
    "رقم اللوحة": "ا ب ح 1234",
    "نوع السيارة": "ونيت",
    "العنوان": "8واحه ليلي",
    "نوع السيارة (المحفظة)": "لاندكروزر",
    "اللون": "ابيض",
    "تاريخ التسجيل": "10/08/2026",
    "GPS": "https://maps.app.goo.gl/x",
    "ملاحظات": "مركونة تحت العمارة",
    "الحالة": "متشيكة بالصوت",
  };

  it("كل التفاصيل بتطلع مش اللوحة بس", () => {
    const r = tashyeekShareRow(row);
    expect(r.plate).toBe("ا ب ح 1234");
    expect(r.type).toBe("ونيت");
    expect(r.addr).toBe("8واحه ليلي");
    expect(r.color).toBe("ابيض");
    expect(r.date).toBe("10/08/2026");
    expect(r.gps).toBe("https://maps.app.goo.gl/x");
    expect(r.notes).toBe("مركونة تحت العمارة");
  });

  it("«الماركة» = موديل المحفظة مش نوع السيارة (دي كانت الغلطة)", () => {
    expect(tashyeekShareRow(row).model).toContain("لاندكروزر");
  });

  it("معلّم عليها «سجلات»", () => {
    expect(tashyeekShareRow(row).src).toBe("سجلات");
  });

  it("الموقع المحسوب بيغلب عمود GPS الخام", () => {
    expect(tashyeekShareRow(row, "https://maps.app.goo.gl/better").gps)
      .toBe("https://maps.app.goo.gl/better");
  });

  it("أسماء أعمدة مختلفة شوية بتتقرا برضه", () => {
    const other = {
      "رقم اللوحة": "دنر5678", "النوع": "صالون", "الحي-الشارع": "السامر",
      "طراز المركبة": "باترول", "لون المركبة": "اسود", "التاريخ": "11/08/2026",
      "الملاحظات": "بجوار المسجد", "بنك": "الراجحي",
    };
    const r = tashyeekShareRow(other);
    expect(r.type).toBe("صالون");
    expect(r.addr).toBe("السامر");
    expect(r.model).toContain("باترول");
    expect(r.color).toBe("اسود");
    expect(r.date).toBe("11/08/2026");
    expect(r.notes).toBe("بجوار المسجد");
    expect(r.bank).toBe("الراجحي");
  });

  it("العمود الفاضي بيتخطّى مايوقفش الباقي", () => {
    const r = tashyeekShareRow({ "رقم اللوحة": "ابح1234", "نوع السيارة": "", "الحي": "الواحة" });
    expect(r.type).toBe("");
    expect(r.dist).toBe("الواحة");
    expect(r.plate).toBe("ابح1234");
  });

  it("صف فاضي مايكسرش", () => {
    expect(() => tashyeekShareRow({})).not.toThrow();
    expect(tashyeekShareRow({}).plate).toBe("");
  });
});
