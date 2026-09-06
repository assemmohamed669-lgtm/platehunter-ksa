import { describe, it, expect } from "vitest";
import { pickRowCoords } from "@/lib/shareLocation";

/**
 * مندوب اشتكى إن زر «الأقرب» مش ظاهر عنده في نتيجة الفرز (ومسح الكاش وجرّب).
 *
 * السبب: الزر كان مربوط بـ`findGpsColumn` اللي بتدوّر بـ**اسم العمود** بس
 * (`/GPS|رابط|موقع|خريطة/`). لو ملف المندوب حاطط الإحداثيات في عمود اسمه حاجة
 * تانية — أو في عمود بلا عنوان زي ما بيحصل في شيتات التفريغ — العمود مايتلاقاش
 * والزر مايظهرش خالص، رغم إن الموقع قدام عينه في الصف (المشاركة كانت بتلاقيه
 * لأن `pickMapsLink` بتدوّر في **أي عمود**).
 *
 * `pickRowCoords` بتحل ده: بتدوّر بالاسم الأول، وبعدين في أي عمود قيمته
 * إحداثيات صالحة — وبتتأكد من المدى عشان ماتفتكرش رقم عادي إحداثيات.
 */
describe("pickRowCoords — إحداثيات الصف مهما كان اسم العمود", () => {
  it("بتقراها من عمود اسمه GPS", () => {
    expect(pickRowCoords({ "رقم اللوحة": "ابح1234", GPS: "24.7136,46.6753" }, null))
      .toEqual({ lat: 24.7136, lng: 46.6753 });
  });

  it("🔴 الباج: عمود باسم غير متوقّع — لازم تتلاقى برضه", () => {
    expect(pickRowCoords({ "رقم اللوحة": "ابح1234", "نقطة الوقوف": "24.7136,46.6753" }, null))
      .toEqual({ lat: 24.7136, lng: 46.6753 });
  });

  it("🔴 الباج: عمود بلا عنوان (شيتات التفريغ) — لازم تتلاقى", () => {
    expect(pickRowCoords({ "رقم اللوحة": "ابح1234", "": "https://maps.google.com/?q=24.5,46.7" }, null))
      .toEqual({ lat: 24.5, lng: 46.7 });
  });

  it("بتقرا رابط خرائط فيه @lat,lng", () => {
    const row = { "الموقع": "https://www.google.com/maps/@21.3891,39.8579,15z" };
    expect(pickRowCoords(row, null)).toEqual({ lat: 21.3891, lng: 39.8579 });
  });

  it("العمود المسمّى له الأولوية على أي عمود تاني", () => {
    const row = { "ملاحظات": "24.0,46.0", GPS: "21.5,39.2" };
    expect(pickRowCoords(row, ["ملاحظات", "GPS"])).toEqual({ lat: 21.5, lng: 39.2 });
  });

  it("«اسم الموقع» (اسم حي مش إحداثيات) مايتحسبش", () => {
    expect(pickRowCoords({ "اسم الموقع": "٨ واحة ليلى" }, null)).toBeNull();
  });

  it("⚠️ رقم فيه فاصلة (سعر/عدّاد) مش إحداثيات — المدى بيرفضه", () => {
    expect(pickRowCoords({ "السعر": "12,345" }, null)).toBeNull();
    expect(pickRowCoords({ "قراءة العداد": "199,900" }, null)).toBeNull();
  });

  it("إحداثيات خارج المدى مرفوضة", () => {
    expect(pickRowCoords({ GPS: "999.123,888.456" }, null)).toBeNull();
  });

  it("صف فاضي أو بلا موقع → null", () => {
    expect(pickRowCoords({ "رقم اللوحة": "ابح1234", "اللون": "أبيض" }, null)).toBeNull();
    expect(pickRowCoords(null, null)).toBeNull();
    expect(pickRowCoords({}, null)).toBeNull();
  });

  it("بتحترم ترتيب الأعمدة الممرّر", () => {
    const row = { a: "", b: "24.7,46.6" };
    expect(pickRowCoords(row, ["a", "b"])).toEqual({ lat: 24.7, lng: 46.6 });
  });
});
