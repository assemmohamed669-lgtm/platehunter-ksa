import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildReferralIndex, matchChunkAgainstIndex } from "@/lib/plateParser";
import { recordsToRows, groupRecordsToRows, REC_PLATE_COL } from "@/lib/voiceOnlyRecords";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * ⚡ فرز «صوت فقط» كان بياخد **١٩ ثانية** عند المندوب، وصفحة الفرز الأساسية ٣ ثواني
 * بالكتير (المالك ٢ أكتوبر ٢٠٢٦).
 *
 * السبب: المكوّن كان بيعدّي كل صف (سجلاته + سجلات المجموعة + داتا المجموعة) على
 * **المطابقة التقريبية** — levenshtein بين كل صف ماطابقش وكل لوحات الإحالة اللي
 * بتبدأ بنفس الحرف. اتقاس على الكمبيوتر: ٣٠ ألف سجل + ١٠٠ ألف صف داتا مع إحالة
 * ٤ آلاف لوحة = **١٠.٧ ثانية** تقريبي مقابل **٤٠ مللي** تام، وكانت بتتعمل مرتين
 * (نتيجتي، وبعدين تاني لما سجلات المجموعة توصل).
 *
 * صفحة الفرز الأساسية **تام بس** من ١٣ سبتمبر (قرار المالك: المطلوب بتطابق تام
 * بس — exactMatchOnly.test.ts)، وده اللي كان المفروض هنا كمان: المكوّن مكتوب عليه
 * «محرّك المطابقة هو هو بتاع صفحة الفرز الأساسية».
 */

const L = "ابحدرسصطعقكلمنهوى";
function plate(i: number) {
  const a = L[i % L.length], b = L[Math.floor(i / L.length) % L.length], c = L[Math.floor(i / 289) % L.length];
  return `${a}${b}${c}${String(1000 + (i * 7919) % 9000)}`;
}

describe("المطابقة التامة بس — matchChunkAgainstIndex(…, 88, false)", () => {
  const index = buildReferralIndex([{ "رقم اللوحة": "ابح1234" }], "رقم اللوحة");
  const rows = [{ [REC_PLATE_COL]: "ابح1234" }, { [REC_PLATE_COL]: "ابحد1234" }];

  it("الافتراضي زي ما هو (التقريبي لسه موجود لأي حد تاني بيناديها)", () => {
    expect(matchChunkAgainstIndex(rows, REC_PLATE_COL, index).map((m) => m.status)).toEqual(["exact", "fuzzy"]);
  });

  it("🔴 false ⇒ تام بس: «ابحد1234» (٤ حروف بالغلط) مابتطلعش مطلوبة لـ«ابح1234»", () => {
    const got = matchChunkAgainstIndex(rows, REC_PLATE_COL, index, 88, false);
    expect(got.map((m) => m.status)).toEqual(["exact"]);
    expect(got[0].dataRow).toBe(rows[0]);
  });

  it("🔴 ٣٠ ألف سجل + ١٠٠ ألف صف داتا على إحالة ٤ آلاف لوحة: أقل من ثانية ونص (كان ~١٠ ثواني)", () => {
    const ref = Array.from({ length: 4000 }, (_, i) => ({ "رقم اللوحة": plate(i * 13 + 5) }));
    const recs = Array.from({ length: 130000 }, (_, i) => ({ [REC_PLATE_COL]: plate(i * 3 + 1), "الحي": "الملز" }));
    const idx = buildReferralIndex(ref, "رقم اللوحة");
    const t0 = performance.now();
    const got = matchChunkAgainstIndex(recs, REC_PLATE_COL, idx, 88, false);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((m) => m.status === "exact")).toBe(true);
  }, 60000);
});

describe("🔴 تبويب «فرز» (صوت فقط) — كل مطابقة فيه تام بس", () => {
  const SRC = readFileSync("components/VoiceOnlySort.tsx", "utf8").replace(/\r\n/g, "\n");

  it("كل نداء لـmatchChunkAgainstIndex بيقفل التقريبي صراحة (88, false)", () => {
    const calls = SRC.split("matchChunkAgainstIndex(").slice(1).map((c) => c.slice(0, c.indexOf(";")));
    expect(calls.length).toBe(4);   // فرز (نتيجتي + المجموعة) · لصق (نتيجتي + المجموعة)
    for (const c of calls) expect(c, c).toContain(", 88, false)");
  });
});

describe("تاريخ السجل — نفس الشكل بالظبط، من غير ما نبني منسّق جديد لكل سجل", () => {
  const isos = ["2026-10-02T08:05:09.000Z", "2026-01-31T23:59:59.000Z", "2025-07-04T12:00:00.000Z"];

  it("recordsToRows وgroupRecordsToRows بيطلّعوا نفس toLocaleString(\"ar-EG\")", () => {
    const entries = isos.map((iso, i) => ({ id: `e${i}`, plate: "ابح1234", checkedAt: iso, row: {} }) as unknown as FieldCheckEntry);
    expect(recordsToRows(entries).map((r) => r["التاريخ"])).toEqual(isos.map((iso) => new Date(iso).toLocaleString("ar-EG")));
    const group = groupRecordsToRows(isos.map((iso) => ({ plate: "ابح1234", method: null, maps_link: null, checked_at: iso, agent_id: "x" })), "me", {});
    expect(group.map((r) => r["التاريخ"])).toEqual(isos.map((iso) => new Date(iso).toLocaleString("ar-EG")));
  });

  it("تاريخ بايظ مايوقعش الفرز (زي toLocaleString بالظبط)", () => {
    const bad = { id: "b", plate: "ابح1234", checkedAt: "مش تاريخ", row: {} } as unknown as FieldCheckEntry;
    expect(recordsToRows([bad])[0]["التاريخ"]).toBe(new Date("مش تاريخ").toLocaleString("ar-EG"));
  });

  it("🔴 مافيش toLocaleString لكل سجل — منسّق واحد بيتعاد استخدامه", () => {
    const code = readFileSync("lib/voiceOnlyRecords.ts", "utf8");
    expect(code).not.toMatch(/new Date\([^)]*\)\.toLocaleString\("ar-EG"\)/);
    expect(code).toMatch(/new Intl\.DateTimeFormat\("ar-EG"/);
  });
});
