import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chunkTableRows, imagePlanText, GRID_PER_IMAGE, GRID_DUP_PALETTE, gridGroupColors } from "@/lib/plateImage";

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

/**
 * 🎨 كل مجموعة مكررة لونها مختلف تماماً — المالك (٨ أكتوبر ٢٠٢٦) على صورة حقيقية: «كاب300 و اسك1743 و بعع8728
 * واخدين نفس اللون وانا قولتلك قبل كدة المكرر كل لوحات مكررة تاخد لون مختلف عن لوحات مكررة تاني اللون يبقي
 * مختلف تماما». السبب: ٨ ألوان بتلف مع ١٤٩ لوحة. الحل: الألوان بتتوزّع **جوّه كل صورة** من ٢٠ لون مختلف ⇒
 * عمرها ما تتكرر في نفس الصورة (الصورة ٢٠ صف بالكتير). و«خلي الخط بولد علشان يبقي واضح».
 */
describe("🔴 ألوان المكرر في الصورة: مختلفة تماماً جوّه الصورة", () => {
  it("🔴 ٢٠ لون مختلفين", () => {
    expect(GRID_DUP_PALETTE.length).toBeGreaterThanOrEqual(GRID_PER_IMAGE);
    expect(new Set(GRID_DUP_PALETTE.map((c) => c.toLowerCase())).size).toBe(GRID_DUP_PALETTE.length);
  });
  it("🔴 كاب300 · أسك1743 · بعع8728 ⇒ ٣ ألوان مختلفة، ونفس اللوحة نفس اللون", () => {
    const c = gridGroupColors(["كاب0300", "كاب0300", null, "اسك1743", null, "بعع8728", "كاب0300"]);
    expect(c[0]).toBe(c[1]);
    expect(c[0]).toBe(c[6]);
    expect(new Set([c[0], c[3], c[5]]).size).toBe(3);
    expect(c[2]).toBeNull();
    expect(c[4]).toBeNull();
  });
  it("🔴 ٢٠ مجموعة في صورة واحدة ⇒ ٢٠ لون مختلف", () => {
    const groups = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(new Set(gridGroupColors(groups)).size).toBe(20);
  });
  it("🔴 التوصيل: الصفحة بتبعت مجموعات الصفوف، والزرار بيعدّيها، والرسم بيلوّن من جوّه الصورة", () => {
    const s = readFileSync(path.resolve(__dirname, "../app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
    const b = readFileSync(path.resolve(__dirname, "../components/ShareSortButton.tsx"), "utf8").replace(/\r\n/g, "\n");
    const im = readFileSync(path.resolve(__dirname, "../lib/plateImage.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(s).toMatch(/rowGroups: shareRowGroups\(src, tash\)/);
    expect(b).toMatch(/rowGroups: t\.rowGroups/);
    expect(im).toMatch(/o\.rowGroups \? gridGroupColors\(o\.rowGroups\.slice\(st, end\)\)/);
  });
  it("🔴 الخط عريض في كل الخانات (مش المكرر بس)", () => {
    const im = readFileSync(path.resolve(__dirname, "../lib/plateImage.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(im).toMatch(/const G_CELL_FONT = `bold /);
  });
});
