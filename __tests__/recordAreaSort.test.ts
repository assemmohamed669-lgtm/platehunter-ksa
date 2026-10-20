import { describe, it, expect, beforeEach } from "vitest";
import { recordAreaRow, withRecordAreaColumn, addColumnOnce } from "@/lib/recordArea";
import { recordRowForSort, voiceSortTable } from "@/lib/voiceSortColumns";
import { buildExportRows } from "@/lib/exportColumns";
import type { MergedResultColumn } from "@/lib/resultColumns";

/**
 * 📍 حي المندوب في نتيجة الفرز والمشاركة — المالك (٢٠ أكتوبر ٢٠٢٦): بعد «املأ الحي والشارع» الحي ظهر في السجلات،
 * «بس لما بيفرز مش بيطلعو في نتيجه الفرز عايزه لما يفرز يطلعو في نتيجه الفرز وكمان لما يشارك يطلعو معاه في المشاركه».
 *
 * السبب: حي المندوب ليه ٣ أسامي حسب المصدر (Voice PRO «اسم الحي - الشارع» · التشييك «الحي-الشارع» · المجمّع «اسم الحي»)،
 * ونتيجة الفرز بتاخد عمود واحد لـ«العنوان» — فعمود من ملف التشييك (عنوان صاحب العربية عند البنك) كان بياخد مكانه،
 * و«تخصيص» الأعمدة اتعمل قبل ما العمود يبقى موجود أصلاً ⇒ مش في الشاشة ولا في المشاركة.
 */
const VOICE = "fc-trial-a1-1760000000000-r1";
const CAM = "fc-cam-h1";
const MJ = "fc-mj-u1-p1";

describe("🔴 حي المندوب عمود واحد «الحي-الشارع»", () => {
  it("Voice PRO: «اسم الحي - الشارع» ⇐ «الحي-الشارع» والاسم القديم بيتشال (مايبقاش عمودين)", () => {
    expect(recordAreaRow({ id: VOICE, row: { "النوع": "ج", "اسم الحي - الشارع": "شارع ٣٠ - النسيم" } }))
      .toEqual({ "النوع": "ج", "الحي-الشارع": "شارع ٣٠ - النسيم" });
  });
  it("التشييك: زي ما هو", () => {
    expect(recordAreaRow({ id: CAM, row: { "الحي-الشارع": "طريق الملك - العليا", "المدينة": "الرياض" } }))
      .toEqual({ "الحي-الشارع": "طريق الملك - العليا", "المدينة": "الرياض" });
  });
  it("المجمّع: «اسم الحي» (كلام المندوب) ⇐ «الحي-الشارع»", () => {
    expect(recordAreaRow({ id: MJ, row: { "اسم الحي": "العليا", "الحالة": "مؤكّدة" } }))
      .toEqual({ "الحي-الشارع": "العليا", "الحالة": "مؤكّدة" });
  });
  it("عمود «اسم الحي» في سجل مش من المجمّع = عنوان البنك ⇒ مايتلمسش", () => {
    expect(recordAreaRow({ id: CAM, row: { "اسم الحي": "الملز" } })).toEqual({ "اسم الحي": "الملز" });
  });
  it("من غير حي ⇒ مفيش عمود", () => {
    expect(recordAreaRow({ id: VOICE, row: { "النوع": "ج" } })).toEqual({ "النوع": "ج" });
  });
  it("سجل زميل (من غير معرّف) ⇒ بالأسامي العادية", () => {
    expect(recordAreaRow({ row: { "اسم الحي - الشارع": "ش - ح" } })).toEqual({ "الحي-الشارع": "ش - ح" });
  });
  it("مابيغيّرش الصف الأصلي", () => {
    const row = { "اسم الحي - الشارع": "ش - ح" };
    recordAreaRow({ id: VOICE, row });
    expect(row).toEqual({ "اسم الحي - الشارع": "ش - ح" });
  });
});

const col = (o: Partial<MergedResultColumn> & { key: string; label: string; sourceCol: string }): MergedResultColumn =>
  ({ id: o.key, source: "data", sourceCols: [o.sourceCol], ...o });

describe("🔴 عمود «العنوان» في نتيجة السجلات = حي المندوب الأول", () => {
  it("مفيش عمود عنوان ⇒ بيتضاف بعد نوع السيارة", () => {
    const out = withRecordAreaColumn([
      col({ key: "type", label: "نوع السيارة", sourceCol: "نوع السيارة" }),
      col({ key: "brand", label: "الماركة", sourceCol: "الشركة" }),
    ]);
    expect(out.map((c) => c.label)).toEqual(["نوع السيارة", "العنوان", "الماركة"]);
    expect(out[1]).toMatchObject({ key: "address", source: "data", sourceCols: ["الحي-الشارع"] });
  });
  it("عمود عنوان من ملف التشييك (عنوان البنك) ⇒ حي المندوب الأول وبعده بتاع الملف", () => {
    const out = withRecordAreaColumn([
      col({ key: "type", label: "نوع السيارة", sourceCol: "النوع" }),
      col({ key: "address", label: "العنوان", sourceCol: "العنوان", dupCols: ["العنوان_1"] }),
    ]);
    expect(out.map((c) => c.label)).toEqual(["نوع السيارة", "العنوان"]);
    expect(out[1].sourceCols).toEqual(["الحي-الشارع", "العنوان"]);
    expect(out[1].dupCols).toBeUndefined();
  });
  it("مفيش نوع ⇒ أول عمود", () => {
    expect(withRecordAreaColumn([col({ key: "brand", label: "الماركة", sourceCol: "الشركة" })]).map((c) => c.label))
      .toEqual(["العنوان", "الماركة"]);
  });
});

describe("🎛️ «تخصيص»: العمود الجديد بيتضاف **مرة واحدة**، وبعدها اختيار المندوب", () => {
  let store: Record<string, string>;
  const st = { get: (k: string) => store[k] ?? null, set: (k: string, v: string) => { store[k] = v; } };
  beforeEach(() => { store = {}; });
  it("مش موجود ⇒ بعد «نوع السيارة»", () => {
    expect(addColumnOnce(["نوع السيارة", "الماركة"], "العنوان", "k", st)).toEqual(["نوع السيارة", "العنوان", "الماركة"]);
  });
  it("الترتيب فاضي (الافتراضي) ⇒ الافتراضي + العمود", () => {
    expect(addColumnOnce([], "العنوان", "k", st)).toEqual(["نوع السيارة", "العنوان", "الماركة"]);
  });
  it("مرة واحدة بس — لو المندوب شاله بعدها مايرجعش", () => {
    expect(addColumnOnce(["نوع السيارة"], "العنوان", "k", st)).toEqual(["نوع السيارة", "العنوان"]);
    expect(addColumnOnce(["نوع السيارة"], "العنوان", "k", st)).toBeNull();
  });
  it("موجود أصلاً ⇒ ولا تغيير", () => {
    expect(addColumnOnce(["العنوان", "نوع السيارة"], "العنوان", "k", st)).toBeNull();
  });
});

describe("🔴 «صوت فقط»: حي المندوب بيغلب أعمدة الملف — في الجدول والمشاركة", () => {
  const rec = (row: Record<string, string>) => recordRowForSort({
    "رقم اللوحة": "ابح1234", ...row, "الطريقة": "متشيكة بالصوت", "التاريخ": "١٩/١٠", "الموقع": "https://maps.google.com/?q=24.7,46.6",
  });
  it("أساسي: «الحي-الشارع» = حي المندوب مش عنوان البنك", () => {
    const r = rec({ "العنوان": "عمارة ٥ — عنوان العميل", "الحي-الشارع": "شارع ٣٠ - النسيم" });
    const t = buildExportRows([r]);
    expect(t.rows[0]["الحي-الشارع"]).toBe("شارع ٣٠ - النسيم");
  });
  it("تخصيص: العمود متاح باسمه", () => {
    const r = rec({ "الحي-الشارع": "شارع ٣٠ - النسيم" });
    const t = voiceSortTable([r], "custom", ["الحي-الشارع"]);
    expect(t.columns).toEqual(["رقم اللوحة", "الحي-الشارع"]);
  });
});

describe("🔌 التوصيل", () => {
  it("سجلات «صوت فقط» (بتاعتي والزمايل) بتعدّي على recordAreaRow", async () => {
    const { recordsToRows, groupRecordsToRows } = await import("@/lib/voiceOnlyRecords");
    const mine = recordsToRows([{ id: VOICE, plate: "ابح1234", row: { "اسم الحي - الشارع": "ش - ح" }, method: "متشيكة بالصوت", checkedAt: "2026-10-19T10:00:00Z" }]);
    expect(mine[0]["الحي-الشارع"]).toBe("ش - ح");
    expect("اسم الحي - الشارع" in mine[0]).toBe(false);
    const group = groupRecordsToRows([{ plate: "ابح1234", method: "x", maps_link: null, checked_at: null, agent_id: "o", extra: { "اسم الحي - الشارع": "ش - ح" } }], "me", {});
    expect(group[0]["الحي-الشارع"]).toBe("ش - ح");
  });
  it("صفحة الفرز: صفوف السجلات + سجلات الزمايل + عمود العنوان + «تخصيص» مرة واحدة", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(app)/sorting/page.tsx", "utf8");
    expect(src).toMatch(/const recRows = fieldEntries\.map\(\(e\) => recordAreaRow\(e\)\);/);
    expect(src).toMatch(/\.\.\.recordAreaRow\(\{ row: g\.extra \?\? \{\} \}\),/);
    expect(src).toMatch(/withRecordAreaColumn\(fixedRaw\)/);
    expect(src).toMatch(/addColumnOnce\(colOrder, RECORD_AREA_RESULT_LABEL, "ph:sorting:areaColAdded"\)/);
  });
  it("«صوت فقط»: «تخصيص» مرة واحدة", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/VoiceOnlySort.tsx", "utf8");
    expect(src).toMatch(/addColumnOnce\(colOrder, "الحي-الشارع", "ph:voiceSort:areaColAdded"\)/);
  });
});
