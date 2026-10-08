import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dayKeyOf, recordDays, dayLabel, entriesOfDay, toggleSel, toggleAll, withoutSelected, editorDeleteIds } from "@/lib/recordsSelection";

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

describe("🔴 الحفظ بيمسح اللي اتشال من المسوّدة بس (مراجعة ٨ أكتوبر)", () => {
  // الأحدث الأول زي getAllFieldCheckEntries — a1/a2 نفس اللوحة ونفس اللينك في نفس اليوم، a3 نفسها من يوم تاني
  const live = [{ id: "a1" }, { id: "a2" }, { id: "b" }, { id: "a3" }];
  const base = new Set(live.map((e) => e.id));
  it("🔴 شال العلامة من نسخة مكررة عشان تفضل ⇒ ماتتمسحش (ولا نسخة يوم تاني)", () => {
    const draft = [{ id: "a2" }, { id: "a3" }];      // اتحدد a1 وb بس
    expect(editorDeleteIds(live, draft, base)).toEqual(["a1", "b"]);
  });
  it("🔴 لوحة اتسجلت والنافذة مفتوحة (تصدير تلقائي/استرجاع) ⇒ ماتتمسحش ومابتتعدّش", () => {
    const now = [{ id: "n1" }, ...live];               // n1 وصلت بعد ما المحرّر اتفتح
    expect(editorDeleteIds(now, live, base)).toEqual([]);
    expect(editorDeleteIds(now, [{ id: "a2" }], base)).toEqual(["a1", "b", "a3"]);
  });
  it("من غير لقطة ⇒ اللي مش في المسوّدة (الحساب القديم)", () => {
    const now = [{ id: "n1" }, ...live];
    const draft = [{ id: "a2" }];
    expect(editorDeleteIds(now, draft, null)).toEqual(now.filter((e) => e.id !== "a2").map((e) => e.id));
  });
});

describe("🔴 التوصيل في «إظهار وتعديل اللوحات» — للكل (المالك: «انشر للكل» ٨ أكتوبر ٢٠٢٦)", () => {
  it("🔴 الحفظ: لقطة وقت الفتح + مفيش توسيع لإخوات المكرر — للكل", () => {
    const s = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(s).toMatch(/function openPlatesEditor\(\) \{[\s\S]{0,1000}peBaseIdsRef\.current = new Set\(fieldEntries\.map\(\(e\) => e\.id\)\);/);
    const save = s.slice(s.indexOf("async function savePlatesEditor()"), s.indexOf("function buildFieldRows()"));
    expect(save).toMatch(/const removedIds = editorDeleteIds\(fieldEntries, draftFieldEntries, peBaseIdsRef\.current\);/);
    expect(save).toMatch(/await deleteFieldCheckEntries\(removedIds\);/);
    expect(save).not.toMatch(/withHiddenDuplicates|isSuper/);
    // عدّاد «هيتمسح N لوحة» من نفس الحساب
    expect(s).toMatch(/const peRemovedN = useMemo\([\s\S]{0,300}editorDeleteIds\(fieldEntries, draftFieldEntries, peBaseIdsRef\.current\)/);
  });
  it("🔴 «عملت تعديلات؟» مابتتحسبش والنافذة مقفولة (مراجعة: كانت بتقارن ١٦ ألف سجل مع كل لوحة جديدة)", () => {
    const s = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(s).toMatch(/const platesEditorDirty = useMemo\(\(\) => \{\n    if \(!platesEditorOpen\) return false;/);
    expect(s).toMatch(/\}, \[platesEditorOpen, draftFieldEntries, fieldEntries\]\);/);
  });
  it("🔴 اليوم اللي اتمسح كله (بالسلة) ⇒ القايمة ترجع لكل الأيام — والتحميل مع التمرير بيرجع يشتغل", () => {
    const s = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(s).toMatch(/const peDayEff = peDay && peDays\.some\(\(d\) => d\.key === peDay\) \? peDay : "";/);
    expect(s).toMatch(/return peDayEff \? entriesOfDay\(cat, peDayEff\) : cat;/);
    expect(s).toMatch(/<select value=\{peDayEff\}/);
    expect(s).toMatch(/\}, \[peShown, platesEditorOpen, peSearch, draftFieldEntries\.length, peDay\]\);/);
  });
});

describe("🔴 التوصيل في «إظهار وتعديل اللوحات» — الشريط للكل", () => {
  const src = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  const editor = src.slice(src.indexOf("{/* ── نافذة «إظهار وتعديل اللوحات»"), src.indexOf("function AutoExportToggle"));
  it("🔴 فلتر اليوم في قايمة المحرّر (`entriesOfDay`) — وبيتمسح لما المحرّر يتفتح", () => {
    expect(src).toMatch(/const peEntries = useMemo\([\s\S]{0,400}entriesOfDay\(/);
    expect(src).toMatch(/function openPlatesEditor\(\) \{[\s\S]{0,900}setPeSel\(new Set\(\)\);[\s\S]{0,200}setPeDay\(""\);/);
  });
  it("🔴 شريط التحديد (اليوم · حدد الكل · امسح المحدد) للكل — مش ورا `isSuper`", () => {
    expect(editor).toMatch(/<div data-records-bulk/);
    expect(editor).not.toMatch(/isSuper && \(\s*<div[^>]*data-records-bulk/);
    // أيام الشريحة محفوظة برّه الـJSX (useMemo) — مش بتتحسب على ١٦ ألف سجل مع كل حرف
    expect(src).toMatch(/const peDays = useMemo\([\s\S]{0,300}recordDays\(/);
    expect(editor).toMatch(/peDays\.map\(/);
    expect(editor).toMatch(/امسح المحدد/);
    expect(editor).toMatch(/حدد الكل/);
  });
  it("🔴 مربع تحديد قدام كل لوحة — للكل", () => {
    expect(editor).toMatch(/<td[^>]*>\s*<input type="checkbox" checked=\{peSel\.has\(e\.id\)\}/);
    expect(editor).toMatch(/<th[^>]*>تحديد<\/th>/);
    expect(editor).not.toMatch(/isSuper/);
  });
  it("🔴 المسح بيشيل من المسوّدة بس — والحفظ النهائي بتأكيد زي ما هو", () => {
    expect(src).toMatch(/function peDeleteSelected\(\) \{[\s\S]{0,400}withoutSelected\(/);
    expect(src).toMatch(/window\.confirm\(`هيتم تطبيق التعديلات على شيت السجلات\$\{delMsg\}\. موافق؟`\)/);
  });
  it("المسح لوحة لوحة (سلة كل صف) زي ما هو للكل", () => {
    expect(editor).toMatch(/onClick=\{\(\) => peDeleteEntry\(e\.id\)\} title="حذف اللوحة"/);
  });
});
