import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  locksFromStored, isLockedAt, toggleLockAt, removeLockAt,
  loadExtraDataLocks, saveExtraDataLocks, EXTRA_DATA_LOCKS_KEY,
} from "@/lib/dataLocks";

/**
 * قفل لكل مربع داتا إضافي — زي قفل مربع الداتا الأساسي بالظبط: وهو مقفول
 * المندوب مايقدرش يمسح الإكسيل اللي جوّاه ولا يشيل المربع، ولازم يفتح القفل
 * الأول.
 *
 * الأقفال **بمواقع** مش بمعرّفات، لأن المربعات بتتشال بالموقع — فلو مربع اتشال
 * لازم القفل بتاعه يتشال معاه وإلا الأقفال تتزحلق على المربعات الغلط.
 */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, get length() { return m.size; },
  } as unknown as Storage;
}

describe("أقفال مربعات الداتا الإضافية", () => {
  beforeEach(() => { vi.stubGlobal("localStorage", fakeStorage()); });

  it("الافتراضي مفتوح — مانقفلش على المندوب بالغلط", () => {
    expect(locksFromStored(null)).toEqual([]);
    expect(isLockedAt([], 0)).toBe(false);
    expect(isLockedAt([true], 5)).toBe(false);
  });

  it("قيمة متخزّنة باظت = الكل مفتوح", () => {
    expect(locksFromStored("مش JSON")).toEqual([]);
    expect(locksFromStored('{"a":1}')).toEqual([]);
    expect(locksFromStored('[true,"x",null]')).toEqual([true, false, false]);
  });

  it("القفل بيتبدّل ومكانه بيتحجز لو بعيد", () => {
    expect(toggleLockAt([], 2)).toEqual([false, false, true]);
    expect(toggleLockAt([true, false], 0)).toEqual([false, false]);
  });

  it("شيل مربع بيشيل قفله — الباقي مايتزحلقش", () => {
    // المربعات: [مفتوح، مقفول، مفتوح] — نشيل الأول
    expect(removeLockAt([false, true, false], 0)).toEqual([true, false]);
    expect(removeLockAt([false, true, false], 1)).toEqual([false, false]);
  });

  it("بيفضل محفوظ بعد القفل والفتح", () => {
    saveExtraDataLocks([false, true]);
    expect(localStorage.getItem(EXTRA_DATA_LOCKS_KEY)).toBe("[false,true]");
    expect(loadExtraDataLocks()).toEqual([false, true]);
  });

  it("التخزين مرفوض مايكسرش الصفحة — الكل مفتوح", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage);
    expect(loadExtraDataLocks()).toEqual([]);
    expect(() => saveExtraDataLocks([true])).not.toThrow();
  });
});
