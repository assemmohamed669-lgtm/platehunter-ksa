import { describe, it, expect } from "vitest";
import { stampRowGps } from "@/lib/gpsBackfill";

type Row = { id: string; plate: string; lat: number | null; lng: number | null; gpsAccuracy: number | null };
const rows: Row[] = [
  { id: "a", plate: "ابح1234", lat: null, lng: null, gpsAccuracy: null },
  { id: "b", plate: "دهس5678", lat: 21.1, lng: 39.1, gpsAccuracy: 12 },
];

describe("stampRowGps — كل لوحة تاخد موقعها بالـid بتاعها", () => {
  it("يختم الصف صاحب الـid المطلوب بس", () => {
    const out = stampRowGps(rows, "a", { lat: 21.5, lng: 39.9, accuracy: 8 }) as Row[];
    expect(out[0]).toMatchObject({ id: "a", lat: 21.5, lng: 39.9, gpsAccuracy: 8 });
    expect(out[1]).toEqual(rows[1]); // الباقي ما يتلمسش
  });

  it("لوحة تانية تاخد موقعها هي — مش نفس موقع الأولى", () => {
    let out = stampRowGps(rows, "a", { lat: 21.5, lng: 39.9, accuracy: 8 }) as Row[];
    out = stampRowGps(out, "b", { lat: 24.7, lng: 46.7, accuracy: 10 }) as Row[];
    expect(out[0].lat).toBe(21.5);
    expect(out[1].lat).toBe(24.7); // موقع مختلف لكل لوحة
    expect(out[0].lat).not.toBe(out[1].lat);
  });

  it("id مش موجود → نفس المصفوفة (مفيش إعادة رسم)", () => {
    const out = stampRowGps(rows, "zzz", { lat: 1, lng: 2, accuracy: 3 });
    expect(out).toBe(rows);
  });

  it("فيكس غير صالح → نفس المصفوفة", () => {
    expect(stampRowGps(rows, "a", null)).toBe(rows);
    expect(stampRowGps(rows, "a", { lat: NaN, lng: 39, accuracy: 5 })).toBe(rows);
  });
});
