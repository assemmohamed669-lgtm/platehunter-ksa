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
    neighborhood: "النرجس",
    recorderName: "عاصم",
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
    // 🔴 مراجعة ١٨ أكتوبر: المعرّف من اللوحة نفسها بس — نفس اللوحات من جدول مسترجَع (من غير مقطع)
    // أو من «اعرض لوحاته» = نفس السجل (كان بيتكرّر)
    expect(mujammaaRecordOf(entry(), { uid: "u1", clipKey: "restored" }).id).toBe(a.id);
    expect(a.id.startsWith(MUJAMMAA_RECORD_PREFIX)).toBe(true);
    expect(a.id).toContain("u1");
    expect(a.method).toBe(MUJAMMAA_RECORD_METHOD);
    expect(MUJAMMAA_RECORD_METHOD).toBe("متشيكة بالصوت");
    expect(isMujammaaRecord(a)).toBe(true);
    expect(isMujammaaRecord({ id: "fc-trial-u1-1-2" })).toBe(false);
    expect(isMujammaaRecord({ id: "fc-ptt-9" })).toBe(false);
  });

  it("اللوحة والموقع ووقت النطق والحقول اللي المندوب قالها", () => {
    const r = mujammaaRecordOf(entry(), { uid: "u1", clipKey: "c9" });
    expect(r.agentId).toBe("u1");
    expect(r.plate).toBe("ابح1234");
    expect(r.lat).toBe(24.7123456);
    expect(r.lng).toBe(46.6754321);
    expect(r.mapsLink).toContain("24.7123456");
    expect(r.checkedAt).toBe(new Date(T + 5000).toISOString());
    // اللوحة في `plate` بس — نسخة في الصف كانت بتفضل قديمة بعد التصحيح والفرز بيطابق عليها
    expect(r.row["رقم اللوحة"]).toBeUndefined();
    expect(r.row["النوع"]).toBe("ونيت");                  // عمود النوع بتاع السجلات (TYPE_KEY)
    expect(r.row["ملاحظة المندوب"]).toBe("مصدومة");        // بيتقري كملاحظات (/ملاح/)
    // 🏘️ المالك (١٨ أكتوبر): «اسم الحي … يظهر في عمود لوحده»
    expect(r.row["اسم الحي"]).toBe("النرجس");
    expect(r.row["اسم الحي - الشارع"]).toBeUndefined();
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
    expect(r.row["رقم اللوحة"]).toBeUndefined();           // لوحة الشيت مابتتنسخش
  });

  it("🔴 ملاحظات/نوع ملف التشييك مابيغطّوش كلام المندوب (السجلات بتقرا أول عمود ملاحظات)", () => {
    const sheet = { plateColumn: "رقم اللوحة", headers: ["رقم اللوحة", "ملاحظات البنك", "النوع", "البنك"] } as unknown as BankSheet;
    const e = entry({
      match: { kind: "exact", similarity: 100, row: { "رقم اللوحة": "ابح1234", "ملاحظات البنك": "متأخر ٣ أقساط", النوع: "سيدان", البنك: "الأهلي" } },
    } as Partial<PlateEntry>);
    const r = mujammaaRecordOf(e, { uid: "u1", clipKey: "c9", sheet });
    expect(Object.keys(r.row).find((k) => /ملاح/.test(k))).toBe("ملاحظة المندوب");
    expect(r.row["ملاحظات البنك"]).toBeUndefined();
    expect(r.row["النوع"]).toBe("ونيت");
    expect(r.row["البنك"]).toBe("الأهلي");
    // ومن غير كلام من المندوب ⇒ نوع/ملاحظة الشيت مايتحطّوش كأنه هو اللي قالهم
    const r2 = mujammaaRecordOf({ ...e, vehicleType: undefined, note: undefined } as PlateEntry, { uid: "u1", clipKey: "c9", sheet });
    expect(r2.row["النوع"]).toBeUndefined();
    expect(Object.keys(r2.row).some((k) => /ملاح/.test(k))).toBe(false);
  });

  it("من غير موقع ⇒ من غير إحداثيات (مابنخترعش)، والحقول الفاضية مابتتكتبش", () => {
    const r = mujammaaRecordOf(entry({ pin: null, vehicleType: undefined, note: "  ", neighborhood: undefined, recorderName: undefined }), {
      uid: "u1",
      clipKey: "c9",
    });
    expect(r.lat).toBeUndefined();
    expect(r.lng).toBeUndefined();
    expect(r.mapsLink).toBeUndefined();
    expect(Object.keys(r.row)).toEqual(["الحالة"]);
  });

  it("لوحة متصحّحة بإيد المندوب = مؤكّدة؛ محتاجة مراجعة = «محتاجة نظرة»", () => {
    const review = { ...entry().review, status: "review" } as PlateEntry["review"];
    expect(mujammaaRecordOf(entry({ review }), { uid: "u", clipKey: "c" }).row["الحالة"]).toBe("محتاجة نظرة");
  });
});

describe("saveMujammaaRecords — الحفظ والرفع", () => {
  it("بيحفظ لوحة لوحة (مش كلهم مع بعض — الآيفون، #306)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    const two = [entry({}, "ابح1234"), { ...entry({}, "حطس5678"), id: "p2" } as PlateEntry];
    const res = await saveMujammaaRecords(two, { uid: "u1", clipKey: "c" }, { save: slow, upload: vi.fn() });
    expect(maxInFlight).toBe(1);
    expect(res.savedEntryIds).toHaveLength(2);
  });

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

describe("🧾 مربعات المجمّع في السجل (١٨ أكتوبر ٢٠٢٦)", () => {
  it("«اسم المسجّل» من المربع (لحظة النطق) — ولو المربع فاضي ماينزلش (العمود مايظهرش)", () => {
    expect(mujammaaRecordOf(entry(), { uid: "u1", clipKey: "c" }).row["اسم المسجّل"]).toBe("عاصم");
    const none = mujammaaRecordOf(entry({ recorderName: undefined }), { uid: "u1", clipKey: "c" });
    expect("اسم المسجّل" in none.row).toBe(false);
  });

  it("«اسم أو رقم الجراج» في الملاحظات — مع اللي اتقال للعربية", () => {
    const r = mujammaaRecordOf(entry({ note: "اول جراج يمين · مركونه" }), { uid: "u1", clipKey: "c" });
    expect(r.row["ملاحظة المندوب"]).toBe("اول جراج يمين · مركونه");
  });

  it("الحي التلقائي من الموقع بينزل في نفس العمود", () => {
    const r = mujammaaRecordOf(entry({ neighborhood: "الياسمين", neighborhoodAuto: true }), { uid: "u1", clipKey: "c" });
    expect(r.row["اسم الحي"]).toBe("الياسمين");
  });
});
