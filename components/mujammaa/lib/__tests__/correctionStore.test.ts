/**
 * تخزين التصحيحات — بتتجمّع عبر الجلسات، مش بتتمسح مع كل تسجيل.
 *
 * 🔴 الفرق الجوهري عن `saveSession`: اللوحات بتاعة الجلسة الحالية، لكن
 * **التصحيحات داتا تدريب**. كل تصحيح المندوب يعمله بيتضاف للي قبله، ومابيروحش
 * مع «تسجيل جديد» ولا مع قفل الصفحة.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveCorrections, loadCorrections, clearCorrections } from "../sessionStore";
import type { Correction } from "../corrections";

const C = (id: string, heard: string, corrected: string): Correction => ({
  id, heard, corrected, tMs: 1000, at: Date.now(),
});

/** نفس نمط `auth.test.ts` في المعمل — تخزين وهمي بدل بيئة jsdom كاملة */
let store: Record<string, string> = {};
beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  });
});

describe("تخزين التصحيحات", () => {
  it("يحفظ ويرجّع", () => {
    saveCorrections([C("1", "ابح1234", "ابح1284")]);
    expect(loadCorrections()).toHaveLength(1);
  });

  it("🔴 بيتراكم عبر الجلسات — تسجيل جديد مايمسحش القديم", () => {
    saveCorrections([C("1", "ابح1234", "ابح1284")]);
    saveCorrections([C("2", "دهر9090", "دهر9099")]);
    expect(loadCorrections()).toHaveLength(2);
  });

  it("نفس الصف اتصحّح تاني ⇒ الأحدث يستبدل القديم مش يتضاف", () => {
    saveCorrections([C("1", "ابح1234", "ابح1284")]);
    saveCorrections([C("1", "ابح1234", "ابح1289")]);
    const all = loadCorrections();
    expect(all).toHaveLength(1);
    expect(all[0].corrected).toBe("ابح1289");
  });

  it("قائمة فاضية مابتمسحش المحفوظ", () => {
    saveCorrections([C("1", "ابح1234", "ابح1284")]);
    saveCorrections([]);
    expect(loadCorrections()).toHaveLength(1);
  });

  it("المسح الصريح بس هو اللي بيمسح", () => {
    saveCorrections([C("1", "ابح1234", "ابح1284")]);
    clearCorrections();
    expect(loadCorrections()).toHaveLength(0);
  });

  it("تخزين مكسور مايكسرش الصفحة", () => {
    store["plate-lab:corrections"] = "{ليس JSON";
    expect(loadCorrections()).toEqual([]);
  });

  it("بيرمي الصفوف المكسورة بدل ما يرجّعها", () => {
    store["plate-lab:corrections"] = JSON.stringify({
      version: 1, savedAt: 1, rows: [{ id: "x" }, C("1", "ابح1234", "ابح1284")],
    });
    expect(loadCorrections()).toHaveLength(1);
  });
});
