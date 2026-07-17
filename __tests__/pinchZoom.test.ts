import { describe, it, expect } from "vitest";
import { pinchZoomTarget } from "@/components/usePinchZoom";

const MAX = 6; // ZOOM_LEVELS.length - 1

describe("pinchZoomTarget", () => {
  it("مفيش تغيير (scale=1) → نفس المستوى", () => {
    expect(pinchZoomTarget(3, 1, MAX)).toBe(3);
  });
  it("تباعد الإصبعين (scale>1) → يكبّر", () => {
    expect(pinchZoomTarget(3, 1.2, MAX)).toBe(4);
    expect(pinchZoomTarget(3, 1.5, MAX)).toBe(5); // ~2.2 steps → 2
  });
  it("تقارب الإصبعين (scale<1) → يصغّر", () => {
    expect(pinchZoomTarget(3, 1 / 1.2, MAX)).toBe(2);
    expect(pinchZoomTarget(3, 0.5, MAX)).toBe(0); // ~-3.8 → -4 → clamp 0? 3-4=-1→0
  });
  it("مايتعداش الحد الأقصى", () => {
    expect(pinchZoomTarget(5, 3, MAX)).toBe(MAX);
  });
  it("مايقلّش عن صفر", () => {
    expect(pinchZoomTarget(1, 0.2, MAX)).toBe(0);
  });
  it("scale غير صالح → نفس المستوى", () => {
    expect(pinchZoomTarget(2, 0, MAX)).toBe(2);
    expect(pinchZoomTarget(2, -1, MAX)).toBe(2);
    expect(pinchZoomTarget(2, Infinity, MAX)).toBe(2);
  });
});
