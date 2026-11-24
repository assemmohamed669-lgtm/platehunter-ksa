/**
 * 📤 مشاركة «سجل التشييك» لوحده و«داتا التسجيلات» لوحدها — كل بيانات المندوب في الشيت (المالك ٢٤ نوفمبر ٢٠٢٦):
 * «لما يشارك داتا السجلات الشيت مش بيبقي فيه اسم الشارع اللي هو كان كاتبه وقت ما كان بيسجل … يقدر يشارك سجل التشييك لوحده
 * ويبقي فيه كل البيانات اللي هو دخلها سواء ب ايده او عدل عليها او اتاخدت من الجي بي اس … وايضا يقدر يشارك داتا التسجيلات
 * لوحدها ويبقي فيها كل البيانات لكل سيارة».
 *
 * السبب: `buildFieldRows` بيبني أعمدة ثابتة (النوع · الملاحظات · الحي · أعمدة ملف التشييك المختارة) ⇒ «اسم الشارع»
 * (المجمّع + مربع الشارع في التشييك) و«اسم المسجّل» (Voice PRO) وبيانات العربية من Voice PRO كانوا محفوظين في السجل
 * وماكانوش بيطلعوا. «شيت السجلات» في الفرز (الاتنين مع بعض) بياخد كل مفاتيح السجل فكان بيطلّعهم.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWN_RECORD_KEYS, ownRecordColumns, recordDistrictOf } from "@/lib/recordsShareColumns";

const mj = (row: Record<string, string>) => ({ id: "fc-mj-1", row });
const vp = (row: Record<string, string>) => ({ id: "fc-trial-1", row });

describe("ownRecordColumns — الأعمدة اللي المندوب أو البرنامج كتبها في السجل", () => {
  it("«اسم الشارع» أول واحد (جنب الحي) — لو فيه سجل واحد بيه", () => {
    expect(OWN_RECORD_KEYS[0]).toBe("اسم الشارع");
    const cols = ownRecordColumns([mj({ "اسم الحي": "النسيم", "اسم الشارع": "الأمير سلطان" }), mj({ "اسم الحي": "الروابي" })], []);
    expect(cols).toEqual(["اسم الشارع"]);
  });

  it("Voice PRO: اسم المسجّل وبيانات العربية ومطلوبة", () => {
    const cols = ownRecordColumns([vp({ "نوع السيارة": "كامري", "الشركة": "تويوتا", "رقم الهيكل": "JT123", "الشهادة": "1234", "مطلوبة": "نعم", "اسم المسجّل": "احمد" })], []);
    expect(cols).toEqual(["اسم المسجّل", "نوع السيارة", "الشركة", "رقم الهيكل", "الشهادة", "مطلوبة"]);
  });

  it("المجمّع: دقة الموقع", () => {
    expect(ownRecordColumns([mj({ "دقة الموقع (م)": "12" })], [])).toEqual(["دقة الموقع (م)"]);
  });

  it("العمود الفاضي في كل السجلات مايطلعش (الشيت مايتلوّثش)", () => {
    expect(ownRecordColumns([vp({ "اسم الشارع": "  " }), vp({})], [])).toEqual([]);
  });

  it("لو هو أصلاً عمود مختار من ملف التشييك ⇒ مايتكرّرش", () => {
    expect(ownRecordColumns([vp({ "اسم الشارع": "العليا" })], ["اسم الشارع"])).toEqual([]);
  });

  it("أعمدة ملف البنك اللي المندوب ماختارهاش ⇒ مابتطلعش (اختياره بيفضل)", () => {
    expect(ownRecordColumns([vp({ "اسم العميل": "فلان", "رقم الحساب": "999" })], [])).toEqual([]);
  });
});

describe("recordDistrictOf — الحي لكل سجل من مصدره", () => {
  it("المجمّع ⇒ «اسم الحي»", () => {
    expect(recordDistrictOf(mj({ "اسم الحي": "النسيم" }))).toBe("النسيم");
  });
  it("Voice PRO ⇒ «اسم الحي - الشارع» · التشييك ⇒ «الحي-الشارع»", () => {
    expect(recordDistrictOf(vp({ "اسم الحي - الشارع": "العليا - التحلية" }))).toBe("العليا - التحلية");
    expect(recordDistrictOf({ id: "fc-1", row: { "الحي-الشارع": "الملز" } })).toBe("الملز");
  });
  it("«اسم الحي» في سجل مش من المجمّع = عنوان صاحب العربية من ملف البنك ⇒ مايتاخدش", () => {
    expect(recordDistrictOf({ id: "fc-1", row: { "اسم الحي": "عنوان البنك" } })).toBe("");
  });
});

describe("الاتنين مع بعض («شيت السجلات» في الفرز) — زي ما هو، وفيه كل حاجة", () => {
  it("سجل تشييك + سجل مجمّع ⇒ الشارع والمسجّل وبيانات العربية والحي كلهم في الشيت", async () => {
    const { buildRecordsTableFromCollapsed } = await import("@/lib/recordsSheet");
    const t = buildRecordsTableFromCollapsed([
      { id: "fc-mj-1", plate: "رلع7528", method: "متشيكة بالصوت", checkedAt: "2026-11-24T10:00:00Z", synced: true,
        row: { "اسم الحي": "النسيم", "اسم الشارع": "الأمير سلطان", "النوع": "ملاكي", "اسم المسجّل": "احمد" } },
      { id: "fc-trial-1", plate: "دمس5284", method: "متشيكة بالصوت", checkedAt: "2026-11-24T10:01:00Z", synced: true,
        row: { "اسم الحي - الشارع": "العليا - التحلية", "نوع السيارة": "كامري", "ملاحظة المندوب": "قدام البيت" } },
    ] as never, "احمد")!;
    for (const h of ["اسم الشارع", "اسم المسجّل", "نوع السيارة", "ملاحظة المندوب", "الحي-الشارع", "النوع"]) expect(t.headers).toContain(h);
    expect(t.rows[0]["اسم الشارع"]).toBe("الأمير سلطان");
    expect(t.rows[0]["الحي-الشارع"]).toBe("النسيم");
    expect(t.rows[1]["الحي-الشارع"]).toBe("العليا - التحلية");
  });
});

describe("صفحة السجلات — الشيت (مشاركة / فتح / تصدير)", () => {
  const P = readFileSync(path.join(process.cwd(), "app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("بيضيف أعمدة المندوب لكل سجل في التابين", () => {
    expect(P).toMatch(/const ownCols = ownRecordColumns\(tabEntries, dynCols\);/);
    expect(P).toMatch(/for \(const k of ownCols\) obj\[k\] = String\(e\.row\?\.\[k\] \?\? ""\);/);
  });
  it("«سجل التشييك» (أو الكل لو مفيش تابات): الحي لكل سجل من مصدره — سجل المجمّع مايطلعش فاضي", () => {
    expect(P).toMatch(/else obj\["الحي-الشارع"\] = recordDistrictOf\(e\);/);
  });
});
