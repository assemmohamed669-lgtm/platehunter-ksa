/**
 * 🧮➡️📋 «داتا التسجيلات» — لوحات المجمّع بتتصدّر لسجلات قناص (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «هنعمل تاب جديد في صفحه السجلات هنسميه داتا التسجيلات هيتحفظ هناك لما المندوب
 * يصدر اللوحات اللي اتفرغت واول ما تتصدر وتتحفظ تلقائي تتمسح واهم حاجه يقدر يعمل تعديل او
 * يمسح لوحات منهم قبل ما يصدر — والتاب التاني … التشييك الفوري اللي بيتصدر من فويس برو …
 * سجل التشييك … كل واحد يظهر في التاب بتاعه».
 *
 * نفس شيت السجلات (field_check ⇐ field_checks) — فبتترفع للسيرفر وبتتطابق في الفرز وماتضيعش
 * زي أي سجل. اللي بيفرّقها **بادئة المعرّف** `fc-mj-` (بتتحفظ في local_id على السيرفر)، والطريقة
 * «متشيكة بالصوت» زي باقي سجلات الصوت عشان العدّادات والخريطة والنسخة الاحتياطية مايتلخبطوش.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MUJAMMAA_RECORD_METHOD,
  MUJAMMAA_RECORD_PREFIX,
  isMujammaaRecord,
  mujammaaRecordOf,
  saveMujammaaRecords,
} from "@/lib/mujammaaRecords";
import type { PlateEntry } from "@/components/mujammaa/lib/plateEntry";
import type { BankSheet } from "@/components/mujammaa/lib/bankSheet";

const T = 1_790_000_000_000;

function entry(over: Partial<PlateEntry> = {}, plate = "ابح1234"): PlateEntry {
  return {
    id: `plate-x-1-${plate}`,
    review: {
      plate,
      heardPlate: plate,
      letters: [...plate.slice(0, 3)],
      digits: plate.slice(3),
      confidence: 92,
      status: "solid",
      corrections: [],
      notes: [],
      raw: plate,
      order: 1,
      needsAudioReview: false,
    } as unknown as PlateEntry["review"],
    pin: { lat: 24.7123456, lng: 46.6754321, accuracy: 8.4, at: T + 5000, ageMs: 0, stale: false },
    match: { kind: "none", similarity: 0 },
    capturedAt: T + 5000,
    source: "batch",
    vehicleType: "ونيت",
    neighborhood: "النرجس - شارع ١٢",
    note: "مصدومة",
    ...over,
  } as PlateEntry;
}

const SHEET = {
  plateColumn: "رقم اللوحة",
  headers: ["رقم اللوحة", "البنك", "الطراز"],
} as unknown as BankSheet;

describe("mujammaaRecordOf — لوحة المجمّع ⇒ سجل في «داتا التسجيلات»", () => {
  it("المعرّف ببادئة المجمّع وثابت (التصدير مرتين مايكرّرش)، والطريقة زي سجلات الصوت", () => {
    const a = mujammaaRecordOf(entry(), { uid: "u1", clipKey: "c9" });
    const b = mujammaaRecordOf(entry(), { uid: "u1", clipKey: "c9" });
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith(MUJAMMAA_RECORD_PREFIX)).toBe(true);
    expect(a.id).toContain("u1");
    expect(a.method).toBe(MUJAMMAA_RECORD_METHOD);
    expect(MUJAMMAA_RECORD_METHOD).toBe("متشيكة بالصوت");
    expect(isMujammaaRecord(a)).toBe(true);
    expect(isMujammaaRecord({ id: "fc-trial-u1-1-2" })).toBe(false);
    expect(isMujammaaRecord({ id: "fc-ptt-9" })).toBe(false);
  });

  it("اللوحة والموقع ووقت النطق والحقول اللي المندوب قالها", () => {
    const r = mujammaaRecordOf(entry(), { uid: "u1", clipKey: "c9", recorder: "عاصم" });
    expect(r.agentId).toBe("u1");
    expect(r.plate).toBe("ابح1234");
    expect(r.lat).toBe(24.7123456);
    expect(r.lng).toBe(46.6754321);
    expect(r.mapsLink).toContain("24.7123456");
    expect(r.checkedAt).toBe(new Date(T + 5000).toISOString());
    expect(r.row["رقم اللوحة"]).toBe("ابح1234");
    expect(r.row["النوع"]).toBe("ونيت");                  // عمود النوع بتاع السجلات (TYPE_KEY)
    expect(r.row["ملاحظة المندوب"]).toBe("مصدومة");        // بيتقري كملاحظات (/ملاح/)
    expect(r.row["اسم الحي - الشارع"]).toBe("النرجس - شارع ١٢");
    expect(r.row["الحالة"]).toBe("مؤكّدة");
    expect(r.row["دقة الموقع (م)"]).toBe("8");
    expect(r.row["اسم المسجّل"]).toBe("عاصم");
    expect(r.row["مطلوبة"]).toBeUndefined();
    expect(r.synced).toBeFalsy();
  });

  it("مطلوبة ⇒ «مطلوبة: نعم» + أعمدة ملف التشييك جنبها (زي سجلات التشييك)", () => {
    const e = entry({
      match: { kind: "exact", similarity: 100, row: { "رقم اللوحة": "ا ب ح 1234", البنك: "الراجحي", الطراز: "كامري" } },
    } as Partial<PlateEntry>);
    const r = mujammaaRecordOf(e, { uid: "u1", clipKey: "c9", sheet: SHEET });
    expect(r.row["مطلوبة"]).toBe("نعم");
    expect(r.row["البنك"]).toBe("الراجحي");
    expect(r.row["الطراز"]).toBe("كامري");
    expect(r.row["رقم اللوحة"]).toBe("ابح1234");           // لوحتنا مش اللي في الشيت
  });

  it("من غير موقع ⇒ من غير إحداثيات (مابنخترعش)، والحقول الفاضية مابتتكتبش", () => {
    const r = mujammaaRecordOf(entry({ pin: null, vehicleType: undefined, note: "  ", neighborhood: undefined }), {
      uid: "u1",
      clipKey: "c9",
    });
    expect(r.lat).toBeUndefined();
    expect(r.lng).toBeUndefined();
    expect(r.mapsLink).toBeUndefined();
    expect(Object.keys(r.row).sort()).toEqual(["الحالة", "رقم اللوحة"].sort());
  });

  it("لوحة متصحّحة بإيد المندوب = مؤكّدة؛ محتاجة مراجعة = «محتاجة نظرة»", () => {
    const review = { ...entry().review, status: "review" } as PlateEntry["review"];
    expect(mujammaaRecordOf(entry({ review }), { uid: "u", clipKey: "c" }).row["الحالة"]).toBe("محتاجة نظرة");
  });
});

describe("saveMujammaaRecords — الحفظ والرفع", () => {
  it("بيحفظ كل لوحة، والفاشلة بتفضل (allSettled — المندوب مايخسرش شغله)، وبيرفع للسيرفر مرة واحدة", async () => {
    const saved: string[] = [];
    const save = vi.fn(async (e: { id: string; plate: string }) => {
      if (e.plate === "حطس5678") throw new Error("disk full");
      saved.push(e.id);
    });
    const upload = vi.fn();
    const a = entry({}, "ابح1234");
    const b = { ...entry({}, "حطس5678"), id: "plate-x-2-حطس5678" } as PlateEntry;
    const res = await saveMujammaaRecords([a, b], { uid: "u1", clipKey: "c9" }, { save, upload });
    expect(res.savedEntryIds).toEqual([a.id]);
    expect(res.failed).toBe(1);
    expect(saved).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("من غير مستخدم ⇒ مابيحفظش حاجة (السجل لازم يبقى باسم صاحبه)", async () => {
    const save = vi.fn();
    await expect(saveMujammaaRecords([entry()], { uid: "", clipKey: "c" }, { save, upload: vi.fn() })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it("مافيش لوحات ⇒ مافيش رفع", async () => {
    const upload = vi.fn();
    const res = await saveMujammaaRecords([], { uid: "u1", clipKey: "c" }, { save: vi.fn(), upload });
    expect(res).toEqual({ savedEntryIds: [], failed: 0 });
    expect(upload).not.toHaveBeenCalled();
  });
});
