import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chunkTableRows, imagePlanText, GRID_PER_IMAGE } from "@/lib/plateImage";

/**
 * 🖼️ صورة نتيجة الفرز بشكل جدول مرتب — المالك (٨ أكتوبر ٢٠٢٦) بعت صورة برنامج منافس: «شوف ازاي مرتب وواضح
 * غير عندنا وشايل لوحات كتير ... لما يبقي فيه لوحات مكررة في المطلوب اللي بيتشارك يتلونو بنفس اللون للوحه ولو
 * لوحه تاني مكررة تاخد لون تاني ... ويطلعو بنفس الترتيب اللي طالع في الفرز ... ولو لوحات كتير جدا ... يتقسمو
 * ل كذا صورة ويظهر للمندوب وهو بيشارك انهم هييجو علي مثلا 3 صور كل صورة فيها 20 لوحه بتفاصيلها».
 */
describe("🔴 التقسيم: ٢٠ لوحة في الصورة (وحدود الآيفون لسه حاكمة)", () => {
  it("🔴 ٥٧ لوحة ⇒ ٣ صور (٢٠ · ٢٠ · ١٧) بنفس الترتيب", () => {
    expect(GRID_PER_IMAGE).toBe(20);
    const starts = chunkTableRows(Array(57).fill(60), 100_000, GRID_PER_IMAGE);
    expect(starts).toEqual([0, 20, 40]);
  });
  it("٢٠ بالظبط ⇒ صورة واحدة · ٢١ ⇒ صورتين", () => {
    expect(chunkTableRows(Array(20).fill(60), 100_000, 20)).toEqual([0]);
    expect(chunkTableRows(Array(21).fill(60), 100_000, 20)).toEqual([0, 20]);
  });
  it("🔴 صفوف طويلة أوي (عنوان على كذا سطر) ⇒ الصورة بتتقسم قبل الـ٢٠ عشان الآيفون مايبيّضهاش", () => {
    expect(chunkTableRows(Array(20).fill(500), 3000, 20)).toEqual([0, 6, 12, 18]);
  });
  it("مفيش صفوف ⇒ صورة واحدة فاضية (زي الأول)", () => {
    expect(chunkTableRows([], 1000, 20)).toEqual([0]);
  });
});

describe("🔴 الرسالة قبل المشاركة: هييجوا على كام صورة", () => {
  it("🔴 كذا صورة", () => {
    expect(imagePlanText(57, [0, 20, 40])).toBe("57 لوحة ⇐ هيطلعوا في 3 صور — كل صورة فيها 20 لوحة بتفاصيلها (الأخيرة 17)");
    expect(imagePlanText(40, [0, 20])).toBe("40 لوحة ⇐ هيطلعوا في صورتين — كل صورة فيها 20 لوحة بتفاصيلها");
    expect(imagePlanText(240, Array.from({ length: 12 }, (_, i) => i * 20))).toBe("240 لوحة ⇐ هيطلعوا في 12 صورة — كل صورة فيها 20 لوحة بتفاصيلها");
  });
  it("صورة واحدة", () => {
    expect(imagePlanText(12, [0])).toBe("12 لوحة ⇐ هيطلعوا في صورة واحدة بتفاصيلها");
  });
  it("الآيفون قسّمها أصغر من ٢٠ ⇒ الرسالة بتقول العدد الحقيقي", () => {
    expect(imagePlanText(20, [0, 6, 12, 18])).toBe("20 لوحة ⇐ هيطلعوا في 4 صور — كل صورة فيها لحد 6 لوحة بتفاصيلها");
  });
});

describe("🔴 التوصيل — صفحة الفرز، السوبر أدمن الأول", () => {
  const sorting = readFileSync(path.resolve(__dirname, "../app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  const btn = readFileSync(path.resolve(__dirname, "../components/ShareSortButton.tsx"), "utf8").replace(/\r\n/g, "\n");
  const img = readFileSync(path.resolve(__dirname, "../lib/plateImage.ts"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 أزرار مشاركة الفرز التلاتة بتبعت الشكل الجديد للسوبر أدمن بس", () => {
    expect(sorting.match(/imageStyle=\{isSuper \? "grid" : undefined\}/g)?.length).toBe(3);
    expect(sorting).toMatch(/\.select\("role, is_super"\)/);
    expect(sorting).toMatch(/setIsSuper\(prof\?\.is_super === true\)/);
  });
  it("🔴 الزرار بيحسب عدد الصور قبل المشاركة ويعرضه تحت «إرسال كصورة»", () => {
    expect(btn).toMatch(/imagePlanText\(/);
    expect(btn).toMatch(/planTableImages\(/);
    expect(btn).toMatch(/style: imageStyle/);
  });
  it("🔴 الرسم: نفس التقسيم في العدّ والرسم (chunkTableRows) + شكل grid بعناوين بنفسجي", () => {
    expect(img).toMatch(/export function planTableImages\(/);
    expect(img.match(/chunkTableRows\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(img).toMatch(/GRID_HEAD_BG = "#6d28d9"/);
  });
  it("الشكل القديم زي ما هو لباقي الصفحات (من غير style)", () => {
    expect(img).toMatch(/opts\.style === "grid"/);
  });
});
