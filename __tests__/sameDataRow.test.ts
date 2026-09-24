import { describe, it, expect } from "vitest";
import { sameDataRow } from "@/lib/locationNeighbors";

/**
 * حارس «العربية الغلط» — «موقعها» بتحلّ الموضع من رقم متخزّن وقت الفرز، ولو
 * الرقم بقى قديم كانت بتعرض الصف اللي وقعت عليه **بلا تحقّق**.
 */
describe("sameDataRow — نفس صف الداتا بالقيم مش بالمرجع", () => {
  const row = { "رقم اللوحة": "أبج1234", "الموقع": "77", "الحي": "غربي جديد" };

  it("نسخة بنفس القيم (جاية من JSON بعد إعادة الفتح) = نفس الصف", () => {
    expect(sameDataRow(row, JSON.parse(JSON.stringify(row)))).toBe(true);
  });

  it("🔴 نفس اللوحة في موقع تاني = **مش** نفس الصف", () => {
    // ده بالظبط بلاغ المالك: نفس اللوحة مسجّلة في ٧٧ و٩٩ — لو اتقارنت باللوحة
    // وحدها الاتنين هيعدّوا، والمندوب يروح للموقع الغلط.
    expect(sameDataRow(row, { ...row, "الموقع": "99" })).toBe(false);
  });

  it("صف مختلف تماماً = مش نفس الصف", () => {
    expect(sameDataRow(row, { "رقم اللوحة": "دهـو5678", "الموقع": "12", "الحي": "شرقي" })).toBe(false);
  });

  it("مقارنة على الأعمدة المشتركة بس — عمود زيادة في ناحية مابيكسرش المطابقة", () => {
    expect(sameDataRow(row, { ...row, "عمود زيادة": "أي حاجة" })).toBe(true);
  });

  it("الفراغات الزيادة مابتفرقش", () => {
    expect(sameDataRow(row, { ...row, "الموقع": "  77  " })).toBe(true);
  });

  it("null/undefined = مش متأكد = مش نفس الصف", () => {
    expect(sameDataRow(null, row)).toBe(false);
    expect(sameDataRow(row, undefined)).toBe(false);
  });

  it("🔴 مفيش أعمدة مشتركة = مش نفس الصف (مش «تمام» بالغلط)", () => {
    expect(sameDataRow(row, { "عمود تاني خالص": "قيمة" })).toBe(false);
  });

  it("🔴 صفّين فاضيين مايعدّوش — لازم قيمة واحدة على الأقل تتقارن فعلاً", () => {
    expect(sameDataRow({ a: "", b: "" }, { a: "", b: "" })).toBe(false);
  });
});
