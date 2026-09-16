import { describe, it, expect, beforeEach, vi } from "vitest";
import { gpsOffFromStored, loadGpsOff, saveGpsOff, GPS_OFF_KEY } from "@/lib/gpsCapture";

/**
 * زرار «تسجيل الموقع» في التشييك: لما المندوب **يفعّله** (يقفل الموقع) السيارة
 * تتسجّل من غير موقع؛ ولما **يقفله** يرجع الموقع عادي.
 *
 * الإعداد بيتخزّن على الجهاز عشان يفضل بعد ما يقفل التطبيق — لو رجع مفتوح
 * لوحده، المندوب هيلاقي مواقع اتسجّلت وهو فاكرها مقفولة.
 */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as unknown as Storage;
}

describe("تفضيل تسجيل الموقع", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()); });

  it("الافتراضي = الموقع شغّال (مافيش قيمة متخزّنة)", () => {
    expect(gpsOffFromStored(null)).toBe(false);
    expect(loadGpsOff()).toBe(false);
  });

  it("«1» معناها الموقع مقفول", () => {
    expect(gpsOffFromStored("1")).toBe(true);
  });

  it("أي قيمة تانية بتترجم «شغّال» — مانقفلش الموقع بالغلط", () => {
    for (const v of ["0", "", "true", "off", "yes", "١"]) {
      expect(gpsOffFromStored(v)).toBe(false);
    }
  });

  it("بيفضل محفوظ بعد ما يتقفل ويتفتح", () => {
    saveGpsOff(true);
    expect(localStorage.getItem(GPS_OFF_KEY)).toBe("1");
    expect(loadGpsOff()).toBe(true);
    saveGpsOff(false);
    expect(loadGpsOff()).toBe(false);
  });

  it("لو التخزين مرفوض مايكسرش التشييك — بيرجع الافتراضي", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage);
    expect(loadGpsOff()).toBe(false);
    expect(() => saveGpsOff(true)).not.toThrow();
  });
});
