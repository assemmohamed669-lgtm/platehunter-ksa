// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  sheetFingerprint, platesOf, matchPreviousUpload, describeMatch,
  recordUpload, getUploadHistory, clearUploadHistory, mergeHistories, type UploadRecord,
} from "@/lib/uploadHistory";

/**
 * المندوب ممكن ينسى إنه رفع الشيت ويرجع تاني يوم يرفعه تاني. لازم البرنامج
 * يفكّره — على أساس **اللوحات اللي جوّه** أول حاجة (ده الدليل الحقيقي)،
 * وبعدين اسم الملف.
 *
 * تحذير بس مش منع: المندوب قال قبل كده إن التكرار شغله وهو أدرى بيه.
 */
const PCOL = "رقم اللوحة";
const sheet = (plates: string[]) => plates.map((p) => ({ [PCOL]: p, "الحى": "80 الصفا" }));

describe("بصمة الشيت", () => {
  it("نفس اللوحات بترتيب مختلف = نفس البصمة", () => {
    expect(sheetFingerprint(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL))
      .toBe(sheetFingerprint(sheet(["د ه و 5678", "ا ب ج 1234"]), PCOL));
  });

  it("فرق في المسافات أو الألف مابيغيّرش البصمة", () => {
    expect(sheetFingerprint(sheet(["أ ب ج 1234"]), PCOL))
      .toBe(sheetFingerprint(sheet(["ابج1234"]), PCOL));
  });

  it("لوحة مختلفة = بصمة مختلفة", () => {
    expect(sheetFingerprint(sheet(["ا ب ج 1234"]), PCOL))
      .not.toBe(sheetFingerprint(sheet(["ا ب ج 1235"]), PCOL));
  });

  it("التكرار جوّه الشيت مابيأثرش على البصمة", () => {
    expect(sheetFingerprint(sheet(["ا ب ج 1234", "ا ب ج 1234"]), PCOL))
      .toBe(sheetFingerprint(sheet(["ا ب ج 1234"]), PCOL));
  });

  it("شيت فاضي بصمته فاضية — مايتحسبش مرفوع قبل كده", () => {
    expect(sheetFingerprint([], PCOL)).toBe("");
    expect(platesOf([], PCOL)).toEqual([]);
  });
});

describe("مطابقة الشيت باللي اترفع قبل كده", () => {
  const prev = (over: Partial<UploadRecord> = {}): UploadRecord => ({
    fingerprint: sheetFingerprint(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL),
    plates: platesOf(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL),
    fileName: "تفريغ الصفا.xlsx", rowCount: 2, uploadedAt: "2026-08-10T09:00:00.000Z",
    dataFileName: "داتا.xlsx", insertedAfter: "80 الصفا", ...over,
  });

  it("نفس الشيت بالظبط → تطابق تام", () => {
    const m = matchPreviousUpload(sheet(["د ه و 5678", "ا ب ج 1234"]), PCOL, "أي اسم.xlsx", [prev()]);
    expect(m?.kind).toBe("same");
    expect(m?.overlapPercent).toBe(100);
  });

  it("نفس اللوحات حتى لو الاسم اتغيّر", () => {
    expect(matchPreviousUpload(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL, "اسم تاني.xlsx", [prev()])?.kind).toBe("same");
  });

  it("معظم اللوحات مرفوعة → تحذير جزئي", () => {
    const now = sheet(["ا ب ج 1234", "د ه و 5678", "ز ح ط 9999"]);
    const m = matchPreviousUpload(now, PCOL, "جديد.xlsx", [prev()]);
    expect(m?.kind).toBe("overlap");
    expect(m?.overlapPercent).toBe(67);
    expect(m?.newPlates).toBe(1);
  });

  it("لوحة واحدة مشتركة بس → مافيش تحذير (شغل عادي)", () => {
    const now = sheet(["ا ب ج 1234", "ن1", "ن2", "ن3", "ن4", "ن5", "ن6", "ن7", "ن8", "ن9"]);
    expect(matchPreviousUpload(now, PCOL, "جديد.xlsx", [prev()])).toBeNull();
  });

  it("شيت جديد خالص → مافيش تحذير", () => {
    expect(matchPreviousUpload(sheet(["س ص ع 1111"]), PCOL, "جديد.xlsx", [prev()])).toBeNull();
  });

  it("نفس اسم الملف حتى لو اللوحات مختلفة → تنبيه بالاسم", () => {
    const m = matchPreviousUpload(sheet(["س ص ع 1111"]), PCOL, "تفريغ الصفا.xlsx", [prev()]);
    expect(m?.kind).toBe("name");
  });

  it("الاسم بيتقارن من غير حساسية للمسافات والامتداد", () => {
    expect(matchPreviousUpload(sheet(["س ص ع 1111"]), PCOL, "  تفريغ الصفا .XLSX ", [prev()])?.kind).toBe("name");
  });

  it("مافيش رفعات سابقة → مافيش تحذير", () => {
    expect(matchPreviousUpload(sheet(["ا ب ج 1234"]), PCOL, "أي.xlsx", [])).toBeNull();
  });

  it("بيرجّع أقوى تطابق لو فيه أكتر من رفعة", () => {
    const other = prev({ fingerprint: "xx", plates: ["زيزي1"], fileName: "حاجة.xlsx" });
    expect(matchPreviousUpload(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL, "أي.xlsx", [other, prev()])?.kind).toBe("same");
  });

  it("الرسالة بتقول التاريخ والاسم", () => {
    const m = matchPreviousUpload(sheet(["ا ب ج 1234", "د ه و 5678"]), PCOL, "أي.xlsx", [prev()])!;
    const txt = describeMatch(m);
    expect(txt).toContain("تفريغ الصفا.xlsx");
    expect(txt).toMatch(/2026/);
  });
});

describe("تخزين ذاكرة الرفع", () => {
  beforeEach(async () => { await clearUploadHistory(); });

  it("بيفتكر الرفعة بعد إعادة فتح البرنامج", async () => {
    await recordUpload({
      fingerprint: "f1", plates: ["ابج1234"], fileName: "تفريغ.xlsx", rowCount: 1,
      uploadedAt: "2026-08-15T00:00:00.000Z", dataFileName: "د.xlsx", insertedAfter: "80 الصفا",
    });
    const h = await getUploadHistory();
    expect(h).toHaveLength(1);
    expect(h[0].fileName).toBe("تفريغ.xlsx");
  });

  // التحذير بيقول «اترفع قبل كده يوم X» — فالمفيد هو **أول** مرة اترفع،
  // مش آخر مرة. لو اترفع تاني بالغلط، أول تاريخ هو اللي يفكّر المندوب.
  it("رفع نفس الشيت تاني مابيكرّرش السجل وبيحافظ على أول تاريخ", async () => {
    const rec = { fingerprint: "f1", plates: ["ابج1234"], fileName: "تفريغ.xlsx", rowCount: 1,
      uploadedAt: "2026-08-15T00:00:00.000Z", dataFileName: "د.xlsx", insertedAfter: "80 الصفا" };
    await recordUpload(rec);
    await recordUpload({ ...rec, uploadedAt: "2026-08-16T00:00:00.000Z" });
    const h = await getUploadHistory();
    expect(h).toHaveLength(1);
    expect(h[0].uploadedAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("الأحدث بيطلع الأول", async () => {
    await recordUpload({ fingerprint: "a", plates: [], fileName: "قديم.xlsx", rowCount: 0,
      uploadedAt: "2026-08-01T00:00:00.000Z", dataFileName: "د", insertedAfter: "" });
    await recordUpload({ fingerprint: "b", plates: [], fileName: "جديد.xlsx", rowCount: 0,
      uploadedAt: "2026-08-14T00:00:00.000Z", dataFileName: "د", insertedAfter: "" });
    expect((await getUploadHistory())[0].fileName).toBe("جديد.xlsx");
  });
});

/**
 * الذاكرة متشاركة بين كل الأدمنز والأجهزة عبر Supabase. المندوب ممكن يرفع
 * من تليفون وزميله يحاول يرفع نفس الشيت من تليفون تاني — لازم يعرف.
 *
 * الدمج لازم يفضل شغال والنت قاطع: اللي على الجهاز بيتحسب برضه.
 */
describe("دمج ذاكرة الجهاز مع السحابة", () => {
  const r = (fp: string, at: string, over: Partial<UploadRecord> = {}): UploadRecord => ({
    fingerprint: fp, plates: ["ابج1234"], fileName: `${fp}.xlsx`, rowCount: 1,
    uploadedAt: at, dataFileName: "د.xlsx", insertedAfter: "", ...over,
  });

  it("بيجمع الاتنين من غير تكرار", () => {
    const out = mergeHistories([r("a", "2026-08-01T00:00:00.000Z")], [r("b", "2026-08-02T00:00:00.000Z")]);
    expect(out.map((x) => x.fingerprint).sort()).toEqual(["a", "b"]);
  });

  it("نفس الشيت في الاتنين → سجل واحد بأقدم تاريخ", () => {
    const out = mergeHistories(
      [r("a", "2026-08-10T00:00:00.000Z")],
      [r("a", "2026-08-03T00:00:00.000Z", { fileName: "الأصلي.xlsx" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].uploadedAt).toBe("2026-08-03T00:00:00.000Z");
    expect(out[0].fileName).toBe("الأصلي.xlsx");
  });

  it("بيفضّل السجل اللي فيه لوحات لو التاني فاضي", () => {
    const out = mergeHistories(
      [r("a", "2026-08-01T00:00:00.000Z", { plates: [] })],
      [r("a", "2026-08-05T00:00:00.000Z", { plates: ["ابج1234", "دهو5678"] })],
    );
    expect(out[0].plates).toHaveLength(2);
    expect(out[0].uploadedAt).toBe("2026-08-01T00:00:00.000Z");   // أقدم تاريخ برضه
  });

  it("السحابة فاضية (النت قاطع) → اللي على الجهاز زي ما هو", () => {
    expect(mergeHistories([r("a", "2026-08-01T00:00:00.000Z")], [])).toHaveLength(1);
  });

  it("الأحدث الأول", () => {
    const out = mergeHistories([r("a", "2026-08-01T00:00:00.000Z")], [r("b", "2026-08-09T00:00:00.000Z")]);
    expect(out[0].fingerprint).toBe("b");
  });

  it("اسم اللي رفع بيتحفظ عشان نعرف مين", () => {
    const out = mergeHistories([], [r("a", "2026-08-01T00:00:00.000Z", { uploadedByName: "أحمد" })]);
    expect(out[0].uploadedByName).toBe("أحمد");
  });
});
