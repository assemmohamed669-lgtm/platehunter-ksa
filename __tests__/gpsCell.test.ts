import { describe, it, expect } from "vitest";
import { gpsCellCoords, gpsCellToLink } from "@/lib/gps";

describe("gpsCellCoords", () => {
  it("إحداثيات صريحة بفاصلة", () => {
    expect(gpsCellCoords("24.7136,46.6753")).toEqual({ lat: 24.7136, lng: 46.6753 });
  });
  it("إحداثيات بمسافة بعد الفاصلة", () => {
    expect(gpsCellCoords("24.7136, 46.6753")).toEqual({ lat: 24.7136, lng: 46.6753 });
  });
  it("رابط q=lat,lng", () => {
    expect(gpsCellCoords("https://maps.google.com/?q=24.7136,46.6753")).toEqual({ lat: 24.7136, lng: 46.6753 });
  });
  it("رابط فيه /@lat,lng", () => {
    expect(gpsCellCoords("https://www.google.com/maps/@24.7136,46.6753,17z")).toEqual({ lat: 24.7136, lng: 46.6753 });
  });
  it("إحداثيات مضمّنة في نص", () => {
    expect(gpsCellCoords("الموقع: 24.7136 46.6753 تقريباً")).toEqual({ lat: 24.7136, lng: 46.6753 });
  });
  it("نص بدون إحداثيات → null", () => {
    expect(gpsCellCoords("غير معروف")).toBeNull();
    expect(gpsCellCoords("")).toBeNull();
  });
});

describe("gpsCellToLink", () => {
  it("إحداثيات → رابط خرائط نظيف", () => {
    expect(gpsCellToLink("24.7136,46.6753")).toBe("https://www.google.com/maps?q=24.7136,46.6753");
  });
  it("رابط q= → رابط خرائط نظيف بالإحداثيات", () => {
    expect(gpsCellToLink("https://maps.google.com/?q=24.7136,46.6753")).toBe("https://www.google.com/maps?q=24.7136,46.6753");
  });
  it("رابط /@lat,lng → رابط نظيف", () => {
    expect(gpsCellToLink("https://www.google.com/maps/@24.7136,46.6753,17z")).toBe("https://www.google.com/maps?q=24.7136,46.6753");
  });
  it("رابط مختصر بدون إحداثيات → يتفتح زي ما هو", () => {
    expect(gpsCellToLink("https://maps.app.goo.gl/AbCdEf123")).toBe("https://maps.app.goo.gl/AbCdEf123");
  });
  it("رابط directions بـ& مشفّرة مزدوجة (&amp;amp;destination=) → رابط نظيف بالإحداثيات", () => {
    expect(
      gpsCellToLink("https://www.google.com/maps/dir/?api=1&amp;amp;destination=21.594202,39.194509"),
    ).toBe("https://www.google.com/maps?q=21.594202,39.194509");
  });
  it("رابط مختصر بـ&amp; مشفّرة → يفكّ الترميز فيفتح صح", () => {
    expect(gpsCellToLink("https://maps.app.goo.gl/x?a=1&amp;b=2")).toBe("https://maps.app.goo.gl/x?a=1&b=2");
  });
  it("فاضي / نص عادي → لا رابط", () => {
    expect(gpsCellToLink("")).toBe("");
    expect(gpsCellToLink("مكان غير محدد")).toBe("");
  });
});
