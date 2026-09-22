import { describe, it, expect } from "vitest";
import {
  trialEntryId,
  carDetails,
  buildTrialFieldRow,
  exportableTrialRows,
  savedIds,
} from "@/lib/trialRecords";

/**
 * طلبات المالك (٢٢ سبتمبر ٢٠٢٦) على صفحة «التسجيل الجديد (تجربة)»:
 * اللوحة المطابقة تجيب **نوع السيارة وتبع أي شركة ورقم الشاص**، والتصدير
 * يروح **لصفحة السجلات** مش لملف إكسل، وبعد التأكيد **اللي اتصدّر بس**
 * يتمسح.
 */

const SHEET = {
  "رقم اللوحة": "دطس2177",
  "طراز المركبة": "هيلوكس",
  "البنك": "الراجحي",
  "رقم الهيكل": "MR0FZ29G1L1234567",
};
const COLS = { brandCol: "طراز المركبة", typeCol: null, bankCol: "البنك" };

const ROW = {
  id: "دطس2177-9000",
  plate: "دطس2177",
  type: "ونيت",
  note: null as string | null,
  match: SHEET as Record<string, string> | null,
  lat: 25.3, lng: 55.4, gpsAccuracy: 8,
  shownAt: 1_700_000_000_000,
  tier: "green" as const,
  conf: 1,
};

describe("سجلات صفحة التجربة", () => {
  it("المعرّف ثابت من الصف — مية ضغطة = سجل واحد", () => {
    expect(trialEntryId(ROW.id)).toBe("fc-trial-دطس2177-9000");
    expect(trialEntryId(ROW.id)).toBe(trialEntryId(ROW.id));
  });

  it("بيطلّع نوع السيارة والشركة والشاص من صف الشيت", () => {
    expect(carDetails(SHEET, COLS)).toEqual({
      car: "هيلوكس",
      company: "الراجحي",
      chassis: "MR0FZ29G1L1234567",
    });
  });

  it("لوحة بلا مطابقة ⇒ كله فاضي، مش قيم مخترعة", () => {
    expect(carDetails(null, COLS)).toEqual({ car: null, company: null, chassis: null });
  });

  it("الشاص من فهرس منفصل لو مش في صف الشيت", () => {
    const بلا = { ...SHEET } as Record<string, string>;
    delete بلا["رقم الهيكل"];
    expect(carDetails(بلا, COLS, "JT1234567890").chassis).toBe("JT1234567890");
  });

  it("🔴 صف السجل بيشيل كل حاجة — والفاضي مابيتكتبش", () => {
    const r = buildTrialFieldRow(ROW, { car: "هيلوكس", company: "الراجحي", chassis: "MR0" }, "شهادة.pdf");
    expect(r["رقم اللوحة"]).toBe("دطس2177");
    expect(r["نوع السيارة"]).toBe("هيلوكس");
    expect(r["الشركة"]).toBe("الراجحي");
    expect(r["رقم الهيكل"]).toBe("MR0");
    expect(r["الشهادة"]).toBe("شهادة.pdf");
    expect(r["مطلوبة"]).toBe("نعم");
    expect("ملاحظة المندوب" in r).toBe(false);   // الملاحظة فاضية
  });

  it("🔴 «مفيش تصدير بلا موقع» — اللي بلا GPS بيفضل مكانه", () => {
    const بلا = { ...ROW, id: "x", lat: null, lng: null };
    expect(exportableTrialRows([ROW, بلا]).map((r) => r.id)).toEqual([ROW.id]);
  });

  it("🔴 اللي اتكتب بس هو اللي يتمسح", () => {
    const ids = ["a", "b", "c"];
    const res = [
      { status: "fulfilled" }, { status: "rejected" }, { status: "fulfilled" },
    ] as PromiseSettledResult<void>[];
    expect(savedIds(ids, res)).toEqual(["a", "c"]);
  });

  it("كله فشل ⇒ مافيش حاجة تتمسح", () => {
    const res = [{ status: "rejected" }, { status: "rejected" }] as PromiseSettledResult<void>[];
    expect(savedIds(["a", "b"], res)).toEqual([]);
  });
});
