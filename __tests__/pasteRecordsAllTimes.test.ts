import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { groupRecordsByPlate } from "@/lib/recordResultDedupe";

/**
 * 📋 «لصق نصي» — المالك (٧ أكتوبر ٢٠٢٦): «مندوب عندو في السجلات سيارة كان مشيكها كذا مرة علي ايام مختلفه
 * لما بيحطها في لصق نصي ويفرز ... بيظهرلو لوحه واحده ... خليها يظهر السيارة لو مكررة ... لان ممكن اماكنها
 * تبقي مختلفه ف المندوب يعرف بالظبط يحصلها في اي مكان».
 * ⇒ في ويندو سجلات اللصق: كل مرة بتطلع (مش الأحدث بس — #244)، نفس العربية تحت بعض والأحدث فوق.
 */
type R = { plate: string; date: string; where: string };
const group = (rows: R[]) => groupRecordsByPlate(rows, (r) => r.plate, (r) => r.date);

describe("🔴 كل مرة اتسجلت فيها العربية", () => {
  it("🔴 نفس العربية في ٣ أيام ⇒ ٣ صفوف — الأحدث فوق", () => {
    const out = group([
      { plate: "حبك1234", date: "01-10-2026 10:00", where: "النسيم" },
      { plate: "حبك1234", date: "05-10-2026 18:30", where: "الملز" },
      { plate: "حبك1234", date: "03-10-2026 09:15", where: "العليا" },
    ]);
    expect(out.map((r) => r.where)).toEqual(["الملز", "العليا", "النسيم"]);
  });
  it("🔴 كل عربية مراتها تحت بعض (بترتيب أول ظهور) · فروق الكتابة نفس العربية", () => {
    const out = group([
      { plate: "دهو5678", date: "02-10-2026 10:00", where: "أ" },
      { plate: "ا ب ح 1234", date: "01-10-2026 10:00", where: "ب" },
      { plate: "دهو 5678", date: "04-10-2026 10:00", where: "ج" },
      { plate: "أبح1234", date: "03-10-2026 10:00", where: "د" },
    ]);
    expect(out.map((r) => r.where)).toEqual(["ج", "أ", "د", "ب"]);
  });
  it("الصف اللي مالوش لوحة بيفضل زي ما هو", () => {
    expect(group([{ plate: "", date: "", where: "x" }])).toHaveLength(1);
  });
});

describe("🔴 الداتا كمان: كل صف فيه اللوحة بيطلع (المالك: «لو موجوده في الداتا ولو موجوده في السجلات كله»)", () => {
  it("🔴 اللوحة في ٣ صفوف داتا ⇒ ٣ نتايج", async () => {
    const { matchTokensAgainstRows } = await import("@/lib/plateParser");
    const rows = [{ "رقم اللوحة": "ا ب ح 1234", "الحي": "النسيم" }, { "رقم اللوحة": "د ه و 5678", "الحي": "x" },
      { "رقم اللوحة": "ابح1234", "الحي": "الملز" }, { "رقم اللوحة": "أ ب ح 1234", "الحي": "العليا" }];
    const m = matchTokensAgainstRows(["ابح1234"], rows, "رقم اللوحة", 88, false);
    expect(m.map((x) => x.row["الحي"])).toEqual(["النسيم", "الملز", "العليا"]);
  });
});

describe("🔴 التوصيل", () => {
  const p = readFileSync("app/(app)/sorting/page.tsx", "utf8");
  const paste = p.slice(p.indexOf("async function runPasteSort()"), p.indexOf("// ── WhatsApp ──"));
  it("🔴 اللصق مابقاش بيسيب الأحدث بس — كل المرات", () => {
    expect(paste).toMatch(/const recordRows = groupRecordsByPlate\(/);
    expect(paste).not.toMatch(/dedupeRecordsByPlate\(/);
  });
  it("🔴 نفس العربية بلون واحد في ويندو السجلات + العنوان بعدد المرات", () => {
    expect(p).toMatch(/const pasteRecordColorMap = useMemo\(/);
    expect(p).toMatch(/pasteRecordColorMap\.map\.get\(/);
    expect(p).toMatch(/لوحة سبق تشييكها \(\$\{pasteRecordResults\.length\} مرة\)/);
  });
  it("الفرز العادي زي ما هو (الأحدث بس)", () => {
    expect(p).toMatch(/function dedupeTashyeek\(/);
  });
});
