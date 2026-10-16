import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveSession, loadSession, clearSession } from "../sessionStore";
import type { PlateEntry } from "../plateEntry";

/** localStorage مبسّط — بيئة الاختبار node مافيهاش واحد */
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

function entry(plate: string): PlateEntry {
  return {
    id: `id-${plate}`,
    capturedAt: 1_700_000_000_000,
    source: "batch",
    pin: null,
    match: { kind: "none", similarity: 0 },
    review: {
      order: 1,
      letters: [...plate.replace(/\d/g, "")],
      digits: plate.replace(/\D/g, ""),
      plate,
      display: plate,
      heardPlate: plate,
      heardLetters: [],
      raw: "",
      flags: [],
      alternatives: [],
      confidence: 99,
      status: "solid",
      notes: [],
      corrections: [],
      needsAudioReview: false,
    },
  };
}

describe("sessionStore — حفظ واسترجاع", () => {
  it("بيحفظ ويرجّع اللوحات", () => {
    saveSession("batch", [entry("ابح1234"), entry("سصط5678")]);
    const back = loadSession("batch");
    expect(back).toHaveLength(2);
    expect(back[0].review.plate).toBe("ابح1234");
  });

  /**
   * الباج ده كان **فقدان بيانات حقيقي**: الصفحة بتفضّي الجدول أول ما
   * تضغط تسجيل، والحفظ التلقائي كان بيمسح المحفوظ ساعتها — فاللوحات
   * المسترجَعة كانت بتضيع نهائياً قبل ما ييجي أي بديل.
   */
  it("قائمة فاضية ما تمسحش المحفوظ", () => {
    saveSession("batch", [entry("ابح1234")]);
    saveSession("batch", []); // زي ما بيحصل أول ما تضغط تسجيل
    expect(loadSession("batch")).toHaveLength(1);
  });

  it("المسح الصريح بيمسح فعلاً", () => {
    saveSession("batch", [entry("ابح1234")]);
    clearSession("batch");
    expect(loadSession("batch")).toEqual([]);
  });

  it("الصفحتين منفصلتين", () => {
    saveSession("batch", [entry("ابح1234")]);
    saveSession("live", [entry("سصط5678"), entry("كلم9012")]);
    expect(loadSession("batch")).toHaveLength(1);
    expect(loadSession("live")).toHaveLength(2);
  });

  it("بيانات تالفة ما تكسرش الصفحة", () => {
    localStorage.setItem("plate-voice-lab:session:batch", "{مش JSON}");
    expect(loadSession("batch")).toEqual([]);
  });

  it("عناصر مكسورة بتتشال والباقي بيرجع", () => {
    localStorage.setItem(
      "plate-voice-lab:session:batch",
      JSON.stringify({
        version: 1,
        savedAt: 1,
        entries: [entry("ابح1234"), { id: "x" }, null],
      })
    );
    expect(loadSession("batch")).toHaveLength(1);
  });

  it("مافيش محفوظ = قائمة فاضية", () => {
    expect(loadSession("live")).toEqual([]);
  });
});
