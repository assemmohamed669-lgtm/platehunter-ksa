import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExportRows, buildDisplayRows } from "@/lib/exportColumns";
import { buildColoredSortExcel } from "@/lib/excel";

/**
 * 📋 دفعة تعديلات المالك (١ أكتوبر ٢٠٢٦) — المشاركة ونتيجة اللصق.
 *   ١) نافذة «لصق نصي»: من غير «الحالة» ولا «مطلوبة»، والعمود الفاضي يختفي.
 *   ٢) إكسيل اللصق ملوّن زي الفرز · خط أكبر وبولد في كل إكسيل نتيجة فرز · العمود
 *      الفاضي مايتشاركش — ماعدا «الملاحظات» و«نوع السيارة» دايماً.
 *   ٣) الإكسيل = كل اللي ظاهر للمندوب (الحي · المسجل …).
 *   ٤) ٣ أزرار مشاركة وتحت كل واحد مسحه: الداتا والسجلات · الداتا · السجلات.
 */

describe("بند ٢: العمود الفاضي مايتشاركش — ماعدا النوع والملاحظات", () => {
  it("🔴 الترتيب الأساسي: «نوع السيارة» و«ملاحظة» بيفضلوا حتى لو فاضيين", () => {
    const { columns } = buildExportRows([{ "رقم اللوحة": "ابج1234", "الحي": "الملز", "رقم الهيكل": "", "البنك": "" }]);
    expect(columns).toContain("نوع السيارة");
    expect(columns).toContain("ملاحظة");
    expect(columns).not.toContain("رقم الهيكل");
    expect(columns).not.toContain("البنك");
    expect(columns).not.toContain("الماركة");   // عمود ثابت بس فاضي ⇒ بيختفي
  });

  it("🔴 بالأعمدة زي ما هي: الفاضي بيختفي والنوع بيفضل حتى لو فاضي", () => {
    const { columns } = buildDisplayRows([
      { "رقم اللوحة": "ابج1234", "نوع السياره": "", "الحي": "الملز", "رقم الهيكل": "", "البنك": "" },
    ]);
    expect(columns).toEqual(["رقم اللوحة", "نوع السياره", "الحي", "ملاحظة"]);
  });

  it("🔴 مفيش عمود نوع خالص ⇒ «نوع السيارة» بيتضاف بعد اللوحة على طول", () => {
    const { columns, rows } = buildDisplayRows([{ "رقم اللوحة": "ابج1234", "الحي": "الملز", "ملاحظات": "قدام البيت" }]);
    expect(columns).toEqual(["رقم اللوحة", "نوع السيارة", "الحي", "ملاحظات"]);
    expect(rows[0]["نوع السيارة"]).toBe("");
  });
});

describe("بند ٢: إكسيل نتيجة الفرز — خط كبير وبولد، والمكرر بلون واضح", () => {
  async function sheetOf(rows: Record<string, unknown>[], colors: (string | null)[]) {
    const blob = await buildColoredSortExcel(rows, "نتائج الفرز", colors);
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    return wb.getWorksheet("نتائج الفرز")!;
  }
  const rows = [
    { "رقم اللوحة": "ابج1234", "الحي": "الملز" },
    { "رقم اللوحة": "ابج1234", "الحي": "العليا" },
    { "رقم اللوحة": "دهو5678", "الحي": "النسيم" },
  ];

  it("🔴 العناوين والبيانات بولد وخط أكبر من الافتراضي (١١)", async () => {
    const ws = await sheetOf(rows, ["#FEF9C3", "#FEF9C3", null]);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(1).getCell(1).font?.size).toBeGreaterThanOrEqual(14);
    expect(ws.getRow(2).getCell(2).font?.bold).toBe(true);
    expect(ws.getRow(2).getCell(2).font?.size).toBeGreaterThanOrEqual(13);
  });

  it("🔴 لون المكرر واضح — مش الدرجة الباهتة اللي على الشاشة", async () => {
    const ws = await sheetOf(rows, ["#FEF9C3", "#FEF9C3", null]);
    const fill = ws.getRow(2).getCell(1).fill as { fgColor?: { argb?: string } };
    expect(fill.fgColor?.argb).toBe("FFFDE047");
    expect(ws.getRow(3).getCell(1).fill?.type).toBe("pattern");
  });

  it("منسّق: حدود للخلايا والعناوين ثابتة فوق", async () => {
    const ws = await sheetOf(rows, [null, null, null]);
    expect(ws.getRow(2).getCell(1).border?.top?.style).toBe("thin");
    expect(ws.views?.[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
});

describe("توصيل الدفعة في الصفحات", () => {
  const code = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const sort = code("app", "(app)", "sorting", "page.tsx");
  const wanted = code("app", "(app)", "wanted", "page.tsx");
  const pasteBox = sort.slice(sort.indexOf("ويندو الداتا —"), sort.indexOf("<ShareSortButton title=\"نتائج اللصق\""));

  it("🔴 بند ١: نافذة اللصق من غير «الحالة» ولا شارة «مطلوبة»، وبأعمدة فيها بيانات بس", () => {
    expect(pasteBox.length).toBeGreaterThan(1000);
    expect(pasteBox).not.toMatch(/>الحالة</);
    expect(pasteBox).not.toMatch(/renderStatusCell\(pasteKey\)/);
    // الشارة جوّه خانة اللوحة (مش عنوان النافذة «… لوحة مطلوبة»)
    expect(pasteBox).not.toMatch(/text-brand leading-none[^>]*>\s*مطلوبة/);
    expect(pasteBox).toMatch(/pasteShownCols\.map/);
    expect(sort).toMatch(/const pasteShownCols = useMemo/);
  });

  it("🔴 بند ٢ و٣: مشاركة اللصق ملوّنة وبنفس الأعمدة الظاهرة", () => {
    const btn = sort.slice(sort.indexOf("<ShareSortButton title=\"نتائج اللصق\""));
    const tag = btn.slice(0, btn.indexOf("/>"));
    expect(tag).toMatch(/excelBlob=/);
    expect(tag).toMatch(/imageTable=/);
    expect(sort).toMatch(/for \(const col of pasteShownCols\)/);
  });

  it("🔴 بند ٤: الأزرار التلاتة وتحت كل واحد مسحه — بالترتيب", () => {
    const order = [
      "مشاركة الداتا والسجلات", "مسح كل الفرز",
      "مشاركة نتيجة الداتا", "مسح فرز الداتا",
      "مشاركة نتيجة فرز السجلات", "مسح فرز السجلات",
    ].map((s) => sort.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    for (let k = 1; k < order.length; k++) expect(order[k]).toBeGreaterThan(order[k - 1]);
  });

  it("🔴 بند ٤: الأزرار القديمة اتشالت (مشاركة كل نافذة · مشاركة الكل · مشاركة السجلات القديمة)", () => {
    expect(sort).not.toMatch(/label="مشاركة الكل"/);
    expect(sort).not.toMatch(/<ShareSortButton title=\{g\.title/);
    expect(sort).not.toMatch(/<ShareSortButton title="سيارات مطلوبة من ملف التشييك/);
  });

  it("🔴 بند ٢: صفحة المطلوب بتشيل العمود الفاضي من المشاركة (ماعدا النوع والملاحظات)", () => {
    expect(wanted).toMatch(/buildDisplayRows\(toExportRows\(/);
  });
});
