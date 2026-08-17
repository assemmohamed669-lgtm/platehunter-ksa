// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { pickMapsLink } from "@/lib/shareLocation";

/**
 * المندوب بيلصق شغله اليومي في ملف الداتا بإيده، ورابط الخريطة بيقع في عمود
 * غير «الموقع» (شيت التفريغ بيحطه في عمود بلا عنوان). النتيجة: السيارة تطلع
 * في الفرز **بلا خريطة** رغم إن الرابط موجود في الصف قدام عينك.
 *
 * فالبحث بقى: الأعمدة اللي اسمها موقع الأول (الأدق)، وبعدين **أي عمود فيه
 * رابط خرائط**. ومابنقبلش أي رابط — رابط بنك أو موقع شركة مايتحسبش موقع.
 */
describe("لينك الخريطة في أي عمود", () => {
  it("العمود المسمّى بيتقرا زي ما كان", () => {
    expect(pickMapsLink({ "الموقع": "https://maps.app.goo.gl/AAA" }, ["الموقع"]))
      .toContain("maps.app.goo.gl/AAA");
  });

  it("رابط خرائط في عمود بلا عنوان بيتلقط", () => {
    const row = { "رقم اللوحة": "ابج1234", "عمود E": "https://goo.gl/maps/BBB", "الموقع": "" };
    expect(pickMapsLink(row, ["رقم اللوحة", "عمود E", "الموقع"])).toContain("goo.gl/maps/BBB");
  });

  it("ولو وقع في «نوع السيارة» غلط برضه بيتلقط", () => {
    const row = { "رقم اللوحة": "ابج1234", "نوع السيارة": "https://maps.app.goo.gl/CCC" };
    expect(pickMapsLink(row, ["رقم اللوحة", "نوع السيارة"])).toContain("maps.app.goo.gl/CCC");
  });

  it("العمود المسمّى له الأولوية لو الاتنين موجودين", () => {
    const row = { "الموقع": "https://maps.app.goo.gl/RIGHT", "عمود E": "https://goo.gl/maps/OTHER" };
    expect(pickMapsLink(row, ["الموقع", "عمود E"])).toContain("RIGHT");
  });

  it("رابط مش خرائط مايتحسبش موقع", () => {
    const row = { "البنك": "https://alrajhibank.com.sa/offer", "الموقع": "" };
    expect(pickMapsLink(row, ["البنك", "الموقع"])).toBe("");
  });

  it("إحداثيات مكتوبة في عمود بلا عنوان بتتقرا", () => {
    const row = { "عمود F": "24.7136,46.6753" };
    expect(pickMapsLink(row, ["عمود F"])).toContain("24.7136");
  });

  it("صف مافيهوش موقع خالص → فاضي", () => {
    expect(pickMapsLink({ "رقم اللوحة": "ابج1234", "الحي": "الصفا" }, ["رقم اللوحة", "الحي"])).toBe("");
  });
});
