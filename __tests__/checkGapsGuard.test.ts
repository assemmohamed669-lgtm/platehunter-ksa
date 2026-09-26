/**
 * تلات ثغرات كانت بتبلع لوحة **مطلوبة بتطابق تام** في صفحة التشييك — من غير
 * صفّارة ولا صف ولا أي أثر يخلّي المندوب يشك.
 *
 * حارس على الملف نفسه: أي رجوع لأي واحدة فيهم بيفشل هنا.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("app/(app)/instant-check/page.tsx", "utf8").replace(/\r\n/g, "\n");
const noComments = (t: string) => t.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

function body(name: string): string {
  const i = SRC.indexOf(`function ${name}(`);
  expect(i, `مالقيتش ${name}`).toBeGreaterThan(-1);
  const end = SRC.indexOf("\n  }\n", i);
  expect(end, `القصّ بايظ في ${name}`).toBeGreaterThan(i);
  return SRC.slice(i, end);
}

describe("١) الفهرس هو الحكم — مش عمود الملف الأساسي", () => {
  it("searchInCheck بيخرج على حجم الفهرس بس", () => {
    // كان: `if (!checkPlateCol || checkIndex.size === 0)`. الفهرس مبني من
    // الملف الأساسي **وكل الملفات الإضافية**؛ فلو الأساسي مالوش عمود لوحة
    // واضح بس الإضافي فيه لوحات، الشرط القديم كان بيرجّع null ⇒ صفر بحث
    // وصفر صفّارات، والمربع مكتوب عليه عدد اللوحات عادي.
    expect(noComments(SRC)).not.toContain("if (!checkPlateCol || checkIndex.size === 0)");
    expect(SRC).toContain("if (checkIndex.size === 0) return null;");
  });
});

describe("٢) «drop-twin» مايشيلش صف لوحة مطلوبة", () => {
  it("بيسأل الفهرس قبل ما يمسح الصف الموجود", () => {
    // تجاوز wantedExact بيحمي اللوحة **الواردة** بس؛ الفرع ده بيمسح صف
    // **موجود** — فكان بيشيل لوحة مطلوبة من الشاشة ومن التصدير.
    const fn = noComments(body("addOnePttRow"));
    const drop = fn.indexOf("pttRowIdsRef.current.delete(v.id)");
    expect(drop, "مالقيتش فرع drop-twin").toBeGreaterThan(-1);
    const guard = fn.lastIndexOf("checkIndex.has(", drop);
    expect(guard, "مافيش سؤال للفهرس قبل المسح").toBeGreaterThan(-1);
    expect(fn.slice(guard, drop)).toContain("break");
  });

  it("والتجاوز بتاع اللوحة الواردة لسه موجود", () => {
    expect(SRC).toContain("const wantedExact = checkIndex.has(");
    expect(SRC).toContain("if (mult !== undefined && !wantedExact)");
  });
});

describe("٣) مسح الصف بينضّف خريطة «اتشاف قريب»", () => {
  it("deletePttRow بيشيله من الخريطة", () => {
    // من غير كده: يمسح الصف ويقول اللوحة تاني خلال ٦ث ⇒ تتبلع في صمت.
    expect(body("deletePttRow")).toContain("seenPttRef.current.delete(k)");
  });

  it("وشيل المعرّف من الريف لسه **أول** حاجة (سباق رد الطيّار)", () => {
    const fn = body("deletePttRow");
    const refDel = fn.indexOf("pttRowIdsRef.current.delete(id)");
    const seenDel = fn.indexOf("seenPttRef.current.delete(k)");
    expect(refDel).toBeGreaterThan(-1);
    expect(refDel).toBeLessThan(seenDel);
  });
});
