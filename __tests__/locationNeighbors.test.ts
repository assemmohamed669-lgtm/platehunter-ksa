import { describe, it, expect } from "vitest";
import { detectLocationColumn, neighborsInSameLocation } from "@/lib/locationNeighbors";

describe("detectLocationColumn", () => {
  it("يفضّل «اسم الموقع»", () => {
    expect(detectLocationColumn(["رقم اللوحة", "اسم الموقع", "الحي", "الشارع"])).toBe("اسم الموقع");
  });
  it("يمسك الشارع/العنوان لو مفيش «اسم الموقع»", () => {
    expect(detectLocationColumn(["رقم اللوحة", "الحي", "الشارع"])).toBe("الشارع");
    expect(detectLocationColumn(["رقم اللوحة", "العنوان"])).toBe("العنوان");
  });
  it("يرجع للحي لو مفيش شارع", () => {
    expect(detectLocationColumn(["رقم اللوحة", "الحي", "اللون"])).toBe("الحي");
    expect(detectLocationColumn(["plate", "district", "color"])).toBe("district");
  });
  it("مايختارش عمود GPS/الموقع كاسم موقع", () => {
    expect(detectLocationColumn(["رقم اللوحة", "GPS", "اللون"])).toBeNull();
    expect(detectLocationColumn(["رقم اللوحة", "الموقع", "اللون"])).toBeNull();
  });
});

describe("neighborsInSameLocation", () => {
  // ملف مرتّب: موقع «أ» (٨ سيارات) ثم موقع «ب» (٣ سيارات)
  const rows = [
    { "رقم اللوحة": "A1", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A2", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A3", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A4", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A5", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A6", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A7", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A8", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "B1", "الشارع": "شارع الملك" },
    { "رقم اللوحة": "B2", "الشارع": "شارع الملك" },
    { "رقم اللوحة": "B3", "الشارع": "شارع الملك" },
  ];

  it("٥ قبل و٥ بعد في نص الموقع (لو متاح)", () => {
    // A6 (index 5): قبله A1..A5 (٥)، بعده A7,A8 (٢ بس لحد حدود الموقع)
    const c = neighborsInSameLocation(rows, 5, "الشارع");
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A7", "A8"]);
    expect(c.isFirstInLocation).toBe(false);
    expect(c.isLastInLocation).toBe(false);
    expect(c.locationName).toBe("شارع النهضة");
  });

  it("أول سيارة في الموقع → مفيش قبلها + العلامة", () => {
    const c = neighborsInSameLocation(rows, 0, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.isFirstInLocation).toBe(true);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A2", "A3", "A4", "A5", "A6"]);
  });

  it("آخر سيارة في الموقع → مفيش بعدها + العلامة", () => {
    // A8 (index 7): آخر واحدة في «شارع النهضة»
    const c = neighborsInSameLocation(rows, 7, "الشارع");
    expect(c.after).toEqual([]);
    expect(c.isLastInLocation).toBe(true);
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A3", "A4", "A5", "A6", "A7"]);
  });

  it("مايعديش حدود الموقع (موقع مختلف مايتحسبش)", () => {
    // B1 (index 8): أول «شارع الملك» — مفيش قبله من نفس الموقع، بعده B2,B3
    const c = neighborsInSameLocation(rows, 8, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.isFirstInLocation).toBe(true);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["B2", "B3"]);
    expect(c.isLastInLocation).toBe(false);
  });

  it("سيارة وسط موقع صغير (سيارتين قبل بس)", () => {
    // A3 (index 2): قبله A1,A2 (٢)، بعده A4..A8 (٥)
    const c = neighborsInSameLocation(rows, 2, "الشارع");
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A1", "A2"]);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A4", "A5", "A6", "A7"].concat("A8").slice(0, 5));
    expect(c.after).toHaveLength(5);
  });

  it("index غير صالح → سياق فاضي", () => {
    const c = neighborsInSameLocation(rows, -1, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.after).toEqual([]);
  });
});
