// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { buildTableFromAoa } from "@/lib/excel";

/**
 * شيت التفريغ اللي بيوصل للمندوب بيحط **رابط الخريطة في عمود بلا عنوان**.
 * والبنّاء كان بيرمي أي عمود بلا اسم — فالرابط كان بيختفي قبل ما يوصل لجدول
 * ربط الأعمدة في صفحة «رفع للداتا»، ومافيش حاجة تتربط بـ«الموقع». النتيجة:
 * كل السيارات اللي المندوب بيضيفها بتطلع في الفرز **بلا خريطة**.
 *
 * الرمي ده صح للفرز العادي (أعمدة فاضية من دمج خلايا)، فالسلوك الجديد
 * **اختياري** — صفحة رفع الداتا بس هي اللي بتطلبه.
 */
const SHEET = [
  ["اللوحة", "النوع", "", "الشارع"],
  ["ابج1234", "ونيت", "https://maps.app.goo.gl/AAA", "1الصفا"],
  ["دهو5678", "فان", "https://maps.app.goo.gl/BBB", "2الصفا"],
];

describe("الأعمدة اللي بلا عنوان", () => {
  it("بتترمي افتراضياً — السلوك القديم مالمستش", () => {
    const t = buildTableFromAoa(SHEET, "تشييك", ["تشييك"]);
    expect(t.headers).toEqual(["اللوحة", "النوع", "الشارع"]);
  });

  it("بتتحفظ باسم واضح لما نطلب كده", () => {
    const t = buildTableFromAoa(SHEET, "تشييك", ["تشييك"], { keepUnnamedColumns: true });
    expect(t.headers).toHaveLength(4);
    expect(t.headers[2]).toMatch(/عمود/);
  });

  it("والقيم بتوصل صح — الرابط مابيضيعش", () => {
    const t = buildTableFromAoa(SHEET, "تشييك", ["تشييك"], { keepUnnamedColumns: true });
    const col = t.headers[2];
    expect(t.rows[0][col]).toBe("https://maps.app.goo.gl/AAA");
    expect(t.rows[1][col]).toBe("https://maps.app.goo.gl/BBB");
  });

  it("العمود اللي بلا اسم وبلا داتا مابيتحفظش — مانزحمش الجدول", () => {
    const t = buildTableFromAoa(
      [["اللوحة", "", "الشارع"], ["ابج1234", "", "1الصفا"]],
      "ورقة", ["ورقة"], { keepUnnamedColumns: true },
    );
    expect(t.headers).toEqual(["اللوحة", "الشارع"]);
  });

  it("الأعمدة المسمّاة وترتيبها زي ما هي", () => {
    const t = buildTableFromAoa(SHEET, "تشييك", ["تشييك"], { keepUnnamedColumns: true });
    expect(t.headers[0]).toBe("اللوحة");
    expect(t.headers[1]).toBe("النوع");
    expect(t.headers[3]).toBe("الشارع");
    expect(t.rows[0]["اللوحة"]).toBe("ابج1234");
  });

  it("أكتر من عمود بلا اسم بياخدوا أسامي مختلفة", () => {
    const t = buildTableFromAoa(
      [["اللوحة", "", ""], ["ا1", "x", "y"]],
      "ورقة", ["ورقة"], { keepUnnamedColumns: true },
    );
    expect(new Set(t.headers).size).toBe(t.headers.length);
    expect(t.headers).toHaveLength(3);
  });
});
