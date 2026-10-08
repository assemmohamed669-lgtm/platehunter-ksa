import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dayKeyOf, recordDays, dayLabel, entriesOfDay, toggleSel, toggleAll, withoutSelected } from "@/lib/recordsSelection";

/**
 * 🗑️ مسح السجلات: لوحة لوحة · كذا لوحة مع بعض · باليوم — المالك (٨ أكتوبر ٢٠٢٦): «في صفحه السجلات لما المندوب
 * يحب يعمل تعديل فيها او يمسح يبقي فيه ميزة انه يمسح سيارة ب سيارة او يحدد كذا سيارة ويمسحهم مرة واحده مع
 * بعض او يمسح بالتاريخ يعني يحدد اليوم ... تتحدد كلها لما يختار اليوم ويقدر يشيل من التحديد بتاع اليوم دة
 * سيارات مش عايز يمسحها ويسيب اللي متحدد هو اللي يتمسح».
 */
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const E = (id: string, checkedAt: string) => ({ id, plate: "ابح" + id.padStart(4, "0"), checkedAt });
const entries = [
  E("1", at(2026, 10, 8, 9)), E("2", at(2026, 10, 8, 23, 59)), E("3", at(2026, 10, 7, 0, 5)),
  E("4", at(2026, 10, 7, 18)), E("5", at(2026, 10, 7, 12)), E("6", at(2026, 9, 30)),
];

describe("🔴 اليوم من تاريخ السجل (بتوقيت الجهاز)", () => {
  it("🔴 مفتاح اليوم المحلي — آخر دقيقة في اليوم وأول دقيقة في اليوم اللي بعده يومين مختلفين", () => {
    expect(dayKeyOf(at(2026, 10, 8, 23, 59))).toBe("2026-10-08");
    expect(dayKeyOf(at(2026, 10, 9, 0, 1))).toBe("2026-10-09");
    expect(dayKeyOf("مش تاريخ")).toBe("");
    expect(dayKeyOf("")).toBe("");
  });
  it("🔴 أيام السجلات — الأحدث الأول وعدد كل يوم", () => {
    expect(recordDays(entries)).toEqual([
      { key: "2026-10-08", count: 2 }, { key: "2026-10-07", count: 3 }, { key: "2026-09-30", count: 1 },
    ]);
  });
  it("اسم اليوم: اليوم + التاريخ بنفس شكل جدول السجلات — و«النهارده»/«امبارح»", () => {
    expect(dayLabel("2026-10-07")).toBe("الأربعاء 07-10-2026");
    expect(dayLabel("2026-10-08", "2026-10-08")).toBe("النهارده · الخميس 08-10-2026");
    expect(dayLabel("2026-10-07", "2026-10-08")).toBe("امبارح · الأربعاء 07-10-2026");
    expect(dayLabel("2026-09-30", "2026-10-08")).toBe("الأربعاء 30-09-2026");
  });
  it("🔴 لوحات يوم معيّن بس", () => {
    expect(entriesOfDay(entries, "2026-10-07").map((e) => e.id)).toEqual(["3", "4", "5"]);
    expect(entriesOfDay(entries, "2026-01-01")).toEqual([]);
  });
});

describe("🔴 التحديد والمسح", () => {
  it("🔴 لوحة لوحة: تحديد وشيل التحديد", () => {
    const a = toggleSel(new Set(), "1");
    expect([...a]).toEqual(["1"]);
    expect([...toggleSel(a, "1")]).toEqual([]);
  });
  it("🔴 «حدد الكل»: لو كلهم متحددين ⇒ يشيلهم، غير كده يحددهم كلهم (ويسيب تحديد اللي برّه)", () => {
    const ids = ["3", "4", "5"];
    expect([...toggleAll(new Set(["4"]), ids)].sort()).toEqual(["3", "4", "5"]);
    expect([...toggleAll(new Set(["3", "4", "5", "9"]), ids)]).toEqual(["9"]);
  });
  it("🔴 اختار يوم ⇒ كله يتحدد، يشيل التحديد من لوحة ⇒ الباقي بس اللي يتمسح", () => {
    let sel = new Set(entriesOfDay(entries, "2026-10-07").map((e) => e.id));
    sel = toggleSel(sel, "4");                       // مش عايز يمسح دي
    const after = withoutSelected(entries, sel);
    expect(after.map((e) => e.id)).toEqual(["1", "2", "4", "6"]);
  });
  it("مفيش تحديد ⇒ ولا لوحة تتمسح (نفس المصفوفة)", () => {
    expect(withoutSelected(entries, new Set())).toBe(entries);
  });
});

describe("🔴 التوصيل في «إظهار وتعديل اللوحات» — السوبر أدمن الأول", () => {
  const src = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  const editor = src.slice(src.indexOf("{/* ── نافذة «إظهار وتعديل اللوحات»"), src.indexOf("function AutoExportToggle"));
  it("🔴 فلتر اليوم في قايمة المحرّر (`entriesOfDay`) — وبيتمسح لما المحرّر يتفتح", () => {
    expect(src).toMatch(/const peEntries = useMemo\([\s\S]{0,400}entriesOfDay\(/);
    expect(src).toMatch(/function openPlatesEditor\(\) \{[\s\S]{0,900}setPeSel\(new Set\(\)\);[\s\S]{0,200}setPeDay\(""\);/);
  });
  it("🔴 شريط التحديد (اليوم · حدد الكل · امسح المحدد) ورا `isSuper`", () => {
    expect(editor).toMatch(/\{isSuper && \(\s*<div[^>]*data-records-bulk/);
    // أيام الشريحة محفوظة برّه الـJSX (useMemo) — مش بتتحسب على ١٦ ألف سجل مع كل حرف
    expect(src).toMatch(/const peDays = useMemo\([\s\S]{0,300}recordDays\(/);
    expect(editor).toMatch(/peDays\.map\(/);
    expect(editor).toMatch(/امسح المحدد/);
    expect(editor).toMatch(/حدد الكل/);
  });
  it("🔴 مربع تحديد قدام كل لوحة — للسوبر أدمن بس", () => {
    expect(editor).toMatch(/\{isSuper && \(\s*<td[^>]*>\s*<input type="checkbox" checked=\{peSel\.has\(e\.id\)\}/);
    expect(editor).toMatch(/\{isSuper && <th/);
  });
  it("🔴 المسح بيشيل من المسوّدة بس — والحفظ النهائي بتأكيد زي ما هو", () => {
    expect(src).toMatch(/function peDeleteSelected\(\) \{[\s\S]{0,400}withoutSelected\(/);
    expect(src).toMatch(/window\.confirm\(`هيتم تطبيق التعديلات على شيت السجلات\$\{delMsg\}\. موافق؟`\)/);
  });
  it("المسح لوحة لوحة (سلة كل صف) زي ما هو للكل", () => {
    expect(editor).toMatch(/onClick=\{\(\) => peDeleteEntry\(e\.id\)\} title="حذف اللوحة"/);
  });
});
