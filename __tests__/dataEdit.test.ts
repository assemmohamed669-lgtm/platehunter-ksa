import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  searchBatches, applyRowEdits, editorHeaders, notesColumnOf, editSummary, plateQueryKey,
  searchDataFile, saveDataEdits, exportDataFile, type RowBatch,
} from "@/lib/dataEdit";
import { saveUploadedFile, getUploadedFile } from "@/lib/idb";
import { importRowsToData, iterateRows, getDataMeta, clearData } from "@/lib/dataStore";

/**
 * ✏️ تعديل ملف الداتا من صفحة الفرز — المالك (١٤ أكتوبر ٢٠٢٦): «تحته كلمه تعديل … علامه بحث … تظهرلو السيارة … بكل
 * الاعمدة … قبل اللوحه دي 10 لوحات قبلها و10 لوحات بعدها … لو موجودة ومكررة 20 مرة … يظهرلو ال20 … لكن لو لوحه واحده
 * فقط يظهر انه موجود لوحه واحده … يحذف اللوحه دي تتحذف من الشيت نهائي … يضيف في عمود الملاحظات … يدوس حفظ ف يتحفظ».
 * قراراته: المكرر ⇒ كل المرات ببياناتها · المسح ⇒ الصف يتشال من الشيت كله · زرار تصدير.
 */
const H = ["رقم اللوحة", "الحي", "النوع", "GPS"];
const mk = (n: number, plate?: string, sheet = ""): Record<string, string> =>
  ({ "رقم اللوحة": plate ?? `ر ق ه ${String(1000 + n)}`, "الحي": `حي ${n}`, "النوع": "كامري", "GPS": "", ...(sheet ? {} : {}) });

function batchOf(rows: Record<string, string>[], opts: Partial<RowBatch> = {}): RowBatch {
  return { rows, locOf: (i) => `r:${i}`, rowNoStart: 1, sheet: "", plateCol: "رقم اللوحة", ...opts };
}

describe("🔴 البحث", () => {
  it("مرة واحدة ⇒ «موجودة مرة واحدة» + ١٠ قبلها و١٠ بعدها بالترتيب", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => mk(i));
    rows[25] = mk(25, "ي ه ل 76");
    const r = await searchBatches([batchOf(rows)], "يهل0076");
    expect(r.matches).toBe(1);
    expect(r.rows.length).toBe(21);
    expect(r.rows[10]).toMatchObject({ match: true, rowNo: 26, loc: "r:25" });
    expect(r.rows[0].rowNo).toBe(16);
    expect(r.rows[20].rowNo).toBe(36);
    expect(r.rows.filter((x) => x.match).length).toBe(1);
  });
  it("قرب أول الشيت/آخره ⇒ اللي موجود بس", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => mk(i));
    rows[2] = mk(2, "سبا7709");
    const r = await searchBatches([batchOf(rows)], "7709 ABS");      // إنجليزي بنكي = «س ب ا 7709»
    expect(r.matches).toBe(1);
    expect(r.rows.map((x) => x.rowNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("🔴 مكررة ⇒ كل المرات ببياناتها (من غير اللي قبل وبعد)", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => mk(i));
    for (const i of [3, 17, 33]) rows[i] = mk(i, "رقس4278");
    const r = await searchBatches([batchOf(rows)], "ر ق س 4278");
    expect(r.matches).toBe(3);
    expect(r.rows.map((x) => x.rowNo)).toEqual([4, 18, 34]);
    expect(r.rows.every((x) => x.match)).toBe(true);
  });
  it("عبر الدفعات (ملف كبير) — اللي قبل وبعد بيكمّلوا من الدفعة اللي جنبها", async () => {
    const a = Array.from({ length: 5 }, (_, i) => mk(i));
    const b = Array.from({ length: 5 }, (_, i) => mk(5 + i));
    b[0] = mk(5, "سحه6216");
    const r = await searchBatches([batchOf(a, { locOf: (i) => `c:1:${i}` }), batchOf(b, { rowNoStart: 6, locOf: (i) => `c:2:${i}` })], "سحه6216");
    expect(r.rows.map((x) => x.loc)).toEqual(["c:1:0", "c:1:1", "c:1:2", "c:1:3", "c:1:4", "c:2:0", "c:2:1", "c:2:2", "c:2:3", "c:2:4"]);
  });
  it("اللي قبل وبعد مابيعدّوش لورقة تانية", async () => {
    const s1 = Array.from({ length: 5 }, (_, i) => mk(i));
    const s2 = Array.from({ length: 5 }, (_, i) => mk(10 + i));
    s2[0] = mk(10, "ريك6830");
    const r = await searchBatches([batchOf(s1, { sheet: "أ" }), batchOf(s2, { sheet: "ب" })], "ريك6830");
    expect(r.rows.every((x) => x.sheet === "ب")).toBe(true);
  });
  it("مش موجودة ⇒ صفر · بحث فاضي ⇒ صفر", async () => {
    expect((await searchBatches([batchOf([mk(1)])], "زبر9999")).matches).toBe(0);
    expect((await searchBatches([batchOf([mk(1)])], "  ")).matches).toBe(0);
    expect(plateQueryKey("يهل76")).toBe(plateQueryKey("ي ه ل 0076"));
  });
});

describe("🔴 التعديل في الصفوف", () => {
  it("خانات بتتغيّر + صفوف بتتشال من الشيت كله، والترتيب زي ما هو", () => {
    const rows = [mk(0), mk(1), mk(2), mk(3)];
    const out = applyRowEdits(rows, new Map([[1, { "الحي": "الصفاء" }], [3, { "ملاحظات": "اتسحبت" }]]), new Set([2]));
    expect(out.length).toBe(3);
    expect(out[1]["الحي"]).toBe("الصفاء");
    expect(out[2]["ملاحظات"]).toBe("اتسحبت");
    expect(out.map((r) => r["رقم اللوحة"])).toEqual([mk(0)["رقم اللوحة"], mk(1)["رقم اللوحة"], mk(3)["رقم اللوحة"]]);
    expect(rows[1]["الحي"]).toBe("حي 1");                         // الأصل ماتلمسش
  });
  it("عمود الملاحظات: الموجود بيتستخدم، ولو مش موجود بيتضاف في الآخر", () => {
    expect(notesColumnOf(["رقم اللوحة", "الملاحظات"])).toBe("الملاحظات");
    expect(notesColumnOf(H)).toBeNull();
    expect(editorHeaders(H)).toEqual({ headers: [...H, "ملاحظات"], virtualNotes: "ملاحظات" });
    expect(editorHeaders(["رقم اللوحة", "ملاحظة"]).virtualNotes).toBeNull();
  });
  it("رسالة التأكيد قبل الحفظ", () => {
    expect(editSummary({ cells: 3, rows: 2, deletes: 0 })).toEqual(["هيتعدّل ٣ خانة في ٢ صف."]);
    expect(editSummary({ cells: 0, rows: 0, deletes: 4 })).toEqual(["هيتمسح ٤ صف من الشيت نهائياً."]);
    expect(editSummary({ cells: 1, rows: 1, deletes: 1 }).length).toBe(2);
  });
});

describe("🔴 الحفظ في شيت الداتا اللي جوّه البرنامج", () => {
  beforeEach(async () => { await clearData("data"); });

  it("ملف صغير: التعديل والمسح بيتحفظوا، وعمود الملاحظات بيتضاف", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => mk(i));
    rows[12] = mk(12, "رقه9312");
    await saveUploadedFile({ key: "local:data", agentId: "local", slot: "data", fileName: "داتا.xlsx", headers: H, rows, uploadedAt: "2026-10-14T10:00:00Z" });
    const ref = { kind: "small" as const, slot: "data" };
    const s = await searchDataFile(ref, "رقه9312");
    expect(s.matches).toBe(1);
    const hit = s.rows.find((x) => x.match)!;
    const before = s.rows[0];
    const res = await saveDataEdits(ref, { edits: { [hit.loc]: { "ملاحظات": "اتسحبت", "GPS": "https://maps.google.com/?q=24.7,46.6" } }, deletes: [before.loc] }, s.stamp);
    expect(res).toEqual({ cells: 2, deleted: 1 });
    const rec = (await getUploadedFile("local", "data"))!;
    expect(rec.rows.length).toBe(29);
    expect(rec.headers).toContain("ملاحظات");
    const edited = rec.rows.find((r) => r["رقم اللوحة"] === "رقه9312")!;
    expect(edited["ملاحظات"]).toBe("اتسحبت");
    expect(edited["GPS"]).toContain("maps.google.com");
    expect(rec.rows.some((r) => r["رقم اللوحة"] === before.row["رقم اللوحة"])).toBe(false);
  });

  it("🔴 ملف كبير (على دفعات): التعديل والمسح في الدفعة الصح، وعدد الصفوف بيتظبط", async () => {
    const rows = Array.from({ length: 7000 }, (_, i) => mk(i));
    rows[4500] = mk(4500, "سبص5725");
    await importRowsToData(rows, H, { slot: "data", fileName: "داتا كبيرة.xlsx" });
    const ref = { kind: "large" as const, slot: "data", store: "data" };
    const s = await searchDataFile(ref, "سبص5725");
    expect(s.matches).toBe(1);
    expect(s.rows.find((x) => x.match)!.rowNo).toBe(4501);
    const hit = s.rows.find((x) => x.match)!;
    const after = s.rows[s.rows.length - 1];
    await saveDataEdits(ref, { edits: { [hit.loc]: { "الحي": "الشرفية" } }, deletes: [after.loc] }, s.stamp);
    const all: Record<string, string>[] = [];
    await iterateRows((b) => { all.push(...b); }, { slot: "data" });
    expect(all.length).toBe(6999);
    expect(all.find((r) => r["رقم اللوحة"] === "سبص5725")!["الحي"]).toBe("الشرفية");
    expect(all.some((r) => r["رقم اللوحة"] === after.row["رقم اللوحة"])).toBe(false);
    expect((await getDataMeta("data"))!.rowCount).toBe(6999);
  });

  it("🔒 الملف اتغيّر بعد البحث (اترفع ملف تاني) ⇒ مابيحفظش على صفوف غلط", async () => {
    await saveUploadedFile({ key: "local:data", agentId: "local", slot: "data", fileName: "a.xlsx", headers: H, rows: [mk(0, "رقه9312")], uploadedAt: "2026-10-14T10:00:00Z" });
    const ref = { kind: "small" as const, slot: "data" };
    const s = await searchDataFile(ref, "رقه9312");
    await saveUploadedFile({ key: "local:data", agentId: "local", slot: "data", fileName: "b.xlsx", headers: H, rows: [mk(5), mk(6)], uploadedAt: "2026-10-14T11:00:00Z" });
    await expect(saveDataEdits(ref, { edits: { [s.rows[0].loc]: { "الحي": "x" } }, deletes: [] }, s.stamp)).rejects.toThrow(/اتغيّر/);
  });
});

describe("🔴 تصدير الشيت بعد التعديل", () => {
  it("ملف صغير ⇒ إكسيل", async () => {
    await saveUploadedFile({ key: "local:data", agentId: "local", slot: "data", fileName: "داتا.xlsx", headers: H, rows: [mk(0), mk(1)], uploadedAt: "2026-10-14T10:00:00Z" });
    const out = await exportDataFile({ kind: "small", slot: "data" });
    expect(out.ext).toBe("xlsx");
    expect(out.name).toMatch(/^داتا-معدّل-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
  it("ملف ضخم ⇒ CSV على دفعات (من غير ما يحمّل الملف كله في الذاكرة) وفيه التعديلات", async () => {
    await clearData("data");
    await importRowsToData([mk(0, "رقه9312"), mk(1)], H, { slot: "data", fileName: "داتا كبيرة.xlsx" });
    const out = await exportDataFile({ kind: "large", slot: "data", store: "data" }, { csvAbove: 1 });
    expect(out.ext).toBe("csv");
    // BOM في أول الملف = الإكسيل يقرا العربي صح (`text()` بيشيله وهو بيقرا، فبنشوف البايتات)
    expect([...new Uint8Array(await out.blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await out.blob.text();
    expect(text.split("\r\n")[0]).toBe("رقم اللوحة,الحي,النوع,GPS");
    expect(text).toContain("رقه9312");
  });
});
