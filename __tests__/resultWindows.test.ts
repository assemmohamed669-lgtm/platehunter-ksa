import { describe, it, expect } from "vitest";
import { groupResultsBySource } from "@/lib/resultWindows";
import type { MatchResult } from "@/lib/plateParser";

/**
 * لما المندوب يحطّ أكتر من ملف داتا، نتيجة كل ملف لازم تطلع في **نافذة لوحدها**
 * بعنوان «نتيجة فرز داتا ١ / ٢ …». الصف بيعرف ملفه من `srcIdx` اللي اتخزّن وقت
 * الفرز. النتايج القديمة المحفوظة قبل الميزة دي مالهاش srcIdx — لازم تفضل
 * شغّالة كنافذة واحدة زي الأول بالظبط.
 */
const mk = (plate: string, srcIdx?: number): MatchResult => ({
  referralRow: { "رقم اللوحة": plate },
  dataRow: { "رقم اللوحة": plate },
  status: "exact",
  ...(srcIdx === undefined ? {} : { srcIdx }),
}) as MatchResult;

describe("groupResultsBySource — نافذة نتيجة لكل ملف داتا", () => {
  it("ملف واحد → مجموعة واحدة بلا عنوان (نفس الشكل القديم)", () => {
    const g = groupResultsBySource([mk("ابح1234", 0), mk("ابح1235", 0)]);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBeNull();
    expect(g[0].items.map((x) => x.gi)).toEqual([0, 1]);
  });

  it("نتايج قديمة بلا srcIdx → مجموعة واحدة بلا عنوان", () => {
    const g = groupResultsBySource([mk("ابح1234"), mk("ابح1235")]);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBeNull();
    expect(g[0].items).toHaveLength(2);
  });

  it("قائمة فاضية → مجموعة واحدة فاضية (مافيش كراش)", () => {
    const g = groupResultsBySource([]);
    expect(g).toHaveLength(1);
    expect(g[0].items).toEqual([]);
  });

  it("ملفين → نافذتين بعناوين مرقّمة من ١", () => {
    const g = groupResultsBySource([mk("ا", 0), mk("ب", 1), mk("ج", 0)]);
    expect(g.map((x) => x.title)).toEqual(["نتيجة فرز داتا 1", "نتيجة فرز داتا 2"]);
    expect(g.map((x) => x.key)).toEqual([0, 1]);
  });

  it("الفهرس العام (gi) بيفضل مظبوط جوه كل نافذة", () => {
    const g = groupResultsBySource([mk("ا", 0), mk("ب", 1), mk("ج", 0), mk("د", 1)]);
    expect(g[0].items.map((x) => x.gi)).toEqual([0, 2]);
    expect(g[1].items.map((x) => x.gi)).toEqual([1, 3]);
  });

  it("النوافذ مرتّبة برقم الملف حتى لو الصفوف مخلوطة", () => {
    const g = groupResultsBySource([mk("ا", 2), mk("ب", 0), mk("ج", 1)]);
    expect(g.map((x) => x.key)).toEqual([0, 1, 2]);
    expect(g.map((x) => x.title)).toEqual(["نتيجة فرز داتا 1", "نتيجة فرز داتا 2", "نتيجة فرز داتا 3"]);
  });

  it("مافيش صف بيتكرر أو يضيع بين النوافذ", () => {
    const rows = [mk("ا", 0), mk("ب", 1), mk("ج", 0), mk("د", 1), mk("هـ", 2)];
    const g = groupResultsBySource(rows);
    const all = g.flatMap((x) => x.items.map((i) => i.gi)).sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4]);
  });

  it("الترتيب جوه النافذة زي ترتيب العرض (مهم لوضع «الأقرب»)", () => {
    // العرض ممكن يكون مرتّب بالمسافة — التجميع مايعيدش الترتيب.
    const g = groupResultsBySource([mk("ج", 0), mk("ا", 0), mk("ب", 0)]);
    expect(g[0].items.map((x) => x.r.referralRow["رقم اللوحة"])).toEqual(["ج", "ا", "ب"]);
  });

  it("ملف واحد بس رقمه مش صفر (مثلاً الداتا الأولى بلا تطابق) → نافذة معنونة", () => {
    const g = groupResultsBySource([mk("ا", 1), mk("ب", 1)]);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBe("نتيجة فرز داتا 2");
  });
});
