import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  annotateEntry,
  buildExportRows,
  VEHICLE_TYPES,
  type PlateEntry,
} from "../plateEntry";
import { saveSession, loadSession } from "../sessionStore";

/** localStorage مبسّط — بيئة node مافيهاش واحد */
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
    source: "live",
    pin: null,
    match: { kind: "none", similarity: 0 },
    stage: "agreed",
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

describe("annotateEntry — حقول المندوب (نوع/حي/ملاحظة)", () => {
  it("بيحط الحقول بلا ما يلمس اللوحة ولا المرحلة", () => {
    const e = entry("ابح1234");
    const next = annotateEntry(e, {
      vehicleType: "ونيت",
      neighborhood: "العليا",
      note: "مركونة قدام المسجد",
    });
    expect(next.vehicleType).toBe("ونيت");
    expect(next.neighborhood).toBe("العليا");
    expect(next.note).toBe("مركونة قدام المسجد");
    // اللوحة والمرحلة زي ما هما — التعديل الوصفي مش تعديل لوحة
    expect(next.review).toEqual(e.review);
    expect(next.stage).toBe("agreed");
    // نسخة جديدة (immutable) — الأصل ما اتغيّرش
    expect(e.vehicleType).toBeUndefined();
  });

  it("قيمة فاضية أو مسافات بتمسح الحقل", () => {
    const e = annotateEntry(entry("ابح1234"), { neighborhood: "العليا" });
    const cleared = annotateEntry(e, { neighborhood: "   " });
    expect(cleared.neighborhood).toBeUndefined();
  });

  it("بيعدّل حقل واحد بس ويسيب الباقي", () => {
    const e = annotateEntry(entry("ابح1234"), { vehicleType: "ونيت", note: "n" });
    const next = annotateEntry(e, { note: "جديد" });
    expect(next.vehicleType).toBe("ونيت"); // ما اتلمسش
    expect(next.note).toBe("جديد");
  });

  it("الحقول بتتحفظ وترجع بعد إعادة الفتح (round-trip)", () => {
    const e = annotateEntry(entry("سصط5678"), {
      vehicleType: "شاص",
      neighborhood: "الربوة",
      note: "ملاحظة",
    });
    saveSession("live", [e]);
    const back = loadSession("live");
    expect(back).toHaveLength(1);
    expect(back[0].vehicleType).toBe("شاص");
    expect(back[0].neighborhood).toBe("الربوة");
    expect(back[0].note).toBe("ملاحظة");
  });

  it("بتتصدّر كأعمدة مستقلة في الإكسل", () => {
    const e = annotateEntry(entry("كلم9012"), {
      vehicleType: "دباب",
      neighborhood: "السلامة",
      note: "قدام الصيدلية",
    });
    const rows = buildExportRows([e], null);
    expect(rows[0]["نوع السيارة"]).toBe("دباب");
    expect(rows[0]["الحي"]).toBe("السلامة");
    expect(rows[0]["ملاحظة المندوب"]).toBe("قدام الصيدلية");
  });

  it("VEHICLE_TYPES فيها أنواع ومرتّبة", () => {
    expect(VEHICLE_TYPES.length).toBeGreaterThanOrEqual(5);
    expect(VEHICLE_TYPES).toContain("ونيت");
  });
});
