import { describe, it, expect } from "vitest";
import { mergeCountMaps } from "@/lib/plateParser";

const m = (obj: Record<string, Record<string, number>>) => {
  const map = new Map<string, Map<string, number>>();
  for (const [k, inner] of Object.entries(obj)) map.set(k, new Map(Object.entries(inner)));
  return map;
};

describe("mergeCountMaps — دمج تعلّم محلي + مشترك", () => {
  it("بيجمع العدّات لنفس (heard→corrected)", () => {
    const out = mergeCountMaps(m({ "ص": { "س": 2 } }), m({ "ص": { "س": 3 } }));
    expect(out.get("ص")!.get("س")).toBe(5);
  });

  it("بيوحّد المفاتيح المختلفة من الخريطتين", () => {
    const out = mergeCountMaps(m({ "ص": { "س": 1 } }), m({ "ق": { "ك": 4 } }));
    expect(out.get("ص")!.get("س")).toBe(1);
    expect(out.get("ق")!.get("ك")).toBe(4);
  });

  it("بيدمج تصحيحات مختلفة لنفس الحرف", () => {
    const out = mergeCountMaps(m({ "ص": { "س": 2 } }), m({ "ص": { "ط": 1 } }));
    expect(out.get("ص")!.get("س")).toBe(2);
    expect(out.get("ص")!.get("ط")).toBe(1);
  });

  it("مابيعدّلش المدخلات (نقية)", () => {
    const a = m({ "ص": { "س": 2 } });
    const b = m({ "ص": { "س": 3 } });
    mergeCountMaps(a, b);
    expect(a.get("ص")!.get("س")).toBe(2);
    expect(b.get("ص")!.get("س")).toBe(3);
  });

  it("خريطة فاضية → نسخة من التانية", () => {
    const out = mergeCountMaps(new Map(), m({ "ص": { "س": 2 } }));
    expect(out.get("ص")!.get("س")).toBe(2);
  });
});
