import { describe, it, expect } from "vitest";
import { buildRowSummaryText } from "@/lib/excel";
import { withLocationLink, buildSelectedShareText, pickMapsLink } from "@/lib/shareLocation";

/**
 * في نتيجة الفرز، المندوب بيدوس «نسخ» أو «واتساب» على لوحة (أو يحدّد كذا لوحة
 * ويشارك) — لازم **يطلع مع كل لوحة لينك موقعها** عشان لما يدوس عليه في واتساب
 * تفتح معاه خريطة السيارة على طول.
 *
 * اللي كان بيحصل قبل كده:
 *   • خلية GPS اللي في الداتا بصيغة «lat,lng» (مش رابط) كانت بتطلع نص خام
 *     «21.5,39.2» — مش قابلة للدوس.
 *   • مشاركة أكتر من لوحة كانت بتطبع القيم الخام من غير ما تحوّلها لرابط خالص.
 *   • ولو المندوب أخفى عمود GPS من «أعمدة النتيجة»، اللينك كان بيختفي تماماً.
 */

describe("withLocationLink — لينك الموقع مع كل لوحة", () => {
  it("خلية GPS بصيغة lat,lng بتتحوّل لرابط خرائط قابل للدوس", () => {
    const out = withLocationLink("🚗 ابح1234", "21.5433,39.1728");
    expect(out).toMatch(/📍 https?:\/\//);
    expect(out).toContain("21.5433");
    expect(out).toContain("39.1728");
  });

  it("رابط خرائط جاهز بيتحط زي ما هو", () => {
    const out = withLocationLink("🚗 ابح1234", "https://maps.app.goo.gl/abc123");
    expect(out).toContain("📍 https://maps.app.goo.gl/abc123");
  });

  it("رابط بترميز HTML مزدوج (&amp;amp;) بيتنضّف عشان يفتح صح", () => {
    const out = withLocationLink("🚗 ابح1234", "https://www.google.com/maps?q=21.5,39.2&amp;amp;z=17");
    expect(out).not.toContain("&amp;");
  });

  it("مفيش GPS → النص زي ما هو من غير سطر فاضي", () => {
    expect(withLocationLink("🚗 ابح1234", "")).toBe("🚗 ابح1234");
    expect(withLocationLink("🚗 ابح1234", null)).toBe("🚗 ابح1234");
    expect(withLocationLink("🚗 ابح1234", "مش موقع")).toBe("🚗 ابح1234");
  });

  it("اللينك مابيتكررش لو ظاهر في النص أصلاً (عمود GPS مش مخفي)", () => {
    const base = "🚗 ابح1234\nGPS: https://www.google.com/maps?q=21.5,39.2";
    const out = withLocationLink(base, "21.5,39.2");
    expect((out.match(/google\.com\/maps/g) ?? []).length).toBe(1);
  });

  it("بيشتغل حتى لو المندوب أخفى عمود GPS من أعمدة النتيجة", () => {
    // النص مافيهوش GPS خالص (العمود مخفي) — اللينك لازم يتضاف برضه
    const out = withLocationLink("🚗 ابح1234\nنوع السيارة: صالون", "21.5,39.2");
    expect(out).toMatch(/📍 https?:\/\//);
  });

  it("اللينك بيطلع آخر سطر عشان واتساب يعمله معاينة", () => {
    const out = withLocationLink("🚗 ابح1234\nالحي: الواحة", "21.5,39.2");
    expect(out.split("\n").pop()).toMatch(/^📍 https?:\/\//);
  });
});

describe("pickMapsLink — إيجاد الموقع الحقيقي في صف الداتا", () => {
  const HEADERS = ["رقم اللوحة", "اسم الموقع", "نوع السيارة", "GPS"];

  it("«اسم الموقع» (اسم حي مش إحداثيات) مابيتاخدش بالغلط", () => {
    const row = { "رقم اللوحة": "ابح1234", "اسم الموقع": "8واحه ليلي", "نوع السيارة": "صالون", "GPS": "21.5433,39.1728" };
    const link = pickMapsLink(row, HEADERS);
    expect(link).toMatch(/^https?:\/\//);
    expect(link).toContain("21.5433");
    expect(link).not.toContain("واحه");
  });

  it("عمود موقع بإحداثيات بس (بلا عمود GPS) بيشتغل", () => {
    const row = { "رقم اللوحة": "ابح1234", "الموقع": "21.5,39.2" };
    expect(pickMapsLink(row, ["رقم اللوحة", "الموقع"])).toMatch(/^https?:\/\//);
  });

  it("رابط واتساب/خرائط مختصر بيتاخد زي ما هو", () => {
    const row = { "رابط الموقع": "https://maps.app.goo.gl/P76X1dzzmyBVqASj9" };
    expect(pickMapsLink(row, ["رابط الموقع"])).toBe("https://maps.app.goo.gl/P76X1dzzmyBVqASj9");
  });

  it("مفيش أي عمود موقع → نص فاضي", () => {
    expect(pickMapsLink({ "رقم اللوحة": "ابح1234", "اللون": "ابيض" }, ["رقم اللوحة", "اللون"])).toBe("");
  });

  it("صف فاضي/ناقص مابيكسرش", () => {
    expect(pickMapsLink(null, HEADERS)).toBe("");
    expect(pickMapsLink({}, HEADERS)).toBe("");
    expect(pickMapsLink({ "GPS": "" }, null)).toBe("");
  });

  it("بيتخطّى عمود الموقع الفاضي ويكمّل على اللي بعده", () => {
    const row = { "اسم الموقع": "السامر", "GPS": "", "رابط": "21.6,39.3" };
    expect(pickMapsLink(row, ["اسم الموقع", "GPS", "رابط"])).toContain("21.6");
  });
});

describe("buildSelectedShareText — مشاركة أكتر من لوحة", () => {
  const rows = [
    { obj: { "رقم اللوحة": "ابح1234", "الحي": "الواحة" }, gps: "21.5,39.2" },
    { obj: { "رقم اللوحة": "دنر5678", "الحي": "السامر" }, gps: "https://maps.app.goo.gl/xyz" },
  ];

  it("كل لوحة معاها لينك موقعها", () => {
    const text = buildSelectedShareText(rows, buildRowSummaryText);
    expect(text).toContain("ابح1234");
    expect(text).toContain("دنر5678");
    expect((text.match(/📍/g) ?? []).length).toBe(2);
    expect(text).toContain("maps.app.goo.gl/xyz");
  });

  it("العنوان فيه العدد الصح والفواصل بين اللوحات", () => {
    const text = buildSelectedShareText(rows, buildRowSummaryText);
    expect(text).toContain("(2)");
    expect(text).toContain("──────────");
    expect(text).toMatch(/^\*السيارات المطلوبة للسحب \(2\)\*/);
  });

  it("لوحة من غير موقع بتطلع عادي من غير ما تكسر الباقي", () => {
    const text = buildSelectedShareText([rows[0], { obj: { "رقم اللوحة": "سسس9999" }, gps: "" }], buildRowSummaryText);
    expect((text.match(/📍/g) ?? []).length).toBe(1);
    expect(text).toContain("سسس9999");
  });

  it("قائمة فاضية → نص فاضي (مافيش رسالة بايظة)", () => {
    expect(buildSelectedShareText([], buildRowSummaryText)).toBe("");
  });
});
