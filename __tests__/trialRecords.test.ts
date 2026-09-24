import { describe, it, expect } from "vitest";
import {
  trialEntryId,
  carDetails,
  buildTrialFieldRow,
  exportableTrialRows,
  savedIds,
  TRIAL_EXPORT_METHOD,
  sessionStamp,
  firstFailureReason,
  restoreDraftRows,
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
  const AGENT_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const AGENT_B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("المعرّف ثابت من الصف — مية ضغطة = سجل واحد", () => {
    expect(trialEntryId(ROW, AGENT_A)).toBe(trialEntryId(ROW, AGENT_A));
    expect(trialEntryId(ROW, AGENT_A)).toBe("fc-trial-" + AGENT_A + "-" + ROW.shownAt + "-" + ROW.id);
  });

  /**
   * 🔴 المالك (٢٤ سبتمبر): «اللوحات بتاع كل مندوب تروح لاسمه… مش عايز أي غلط حتى لو صغير».
   * السيرفر بيعرف السجل بـ`local_id` لوحده (unique على الجدول كله). المعرّف القديم كان
   * «اللوحة + زمنها جوّه التسجيل» ⇒ بيتكرّر: نفس العربية أول الجلسة (~٣.٥ث) يومين ورا بعض
   * كانت بتمسح سجل امبارح، ومندوبين على نفس العربية ⇒ التاني السيرفر بيرفضه في صمت.
   */
  it("🔴 نفس اللوحة ونفس الزمن في جلستين (يومين) ⇒ سجلين مختلفين (مايمسحش القديم)", () => {
    const today = { ...ROW, shownAt: ROW.shownAt + 86_400_000 };
    expect(trialEntryId(today, AGENT_A)).not.toBe(trialEntryId(ROW, AGENT_A));
  });
  it("🔴 مندوبين على نفس الصف بالظبط ⇒ معرّفين مختلفين (السيرفر مايرفضش التاني)", () => {
    expect(trialEntryId(ROW, AGENT_A)).not.toBe(trialEntryId(ROW, AGENT_B));
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

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⑦ الحي والشارع واسم المسجّل — بيتصدّروا مع اللوحة
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «المندوب لما يكتب فيهم اسم الحي واسم الشارع
 *  يتضاف عمود جديد في المربّع بتاع اللوحات… ولو شالهم من المربّعات
 *  ميتكتبش حاجة»، و«كل حاجة في المربّع تتصدّر للسجلات زي ما هي مينقصش
 *  منها».
 *
 *  🔴 فالقاعدة القديمة «الفاضي مابيتكتبش» بتنطبق عليهم بالظبط: مربّع فاضي
 *  ⇒ **مافيش مفتاح خالص** في السجل، مش مفتاح بقيمة فاضية — لأن العرض
 *  والتصدير في السجلات بيلفّوا على المفاتيح الموجودة.
 */
describe("buildTrialFieldRow — حقول الجلسة", () => {
  const base = {
    id: "1", plate: "أبح1234", type: null, note: null, match: null,
    lat: null, lng: null, gpsAccuracy: null, shownAt: 0,
    tier: "green" as const, conf: 1,
  };
  const noDetails = { car: null, company: null, chassis: null };

  it("مكتوبين ⇒ عمودين في السجل", () => {
    const out = buildTrialFieldRow(base, noDetails, null,
      { area: "النسيم - شارع ٣٠", recorder: "أحمد" });
    expect(out["اسم الحي - الشارع"]).toBe("النسيم - شارع ٣٠");
    expect(out["اسم المسجّل"]).toBe("أحمد");
  });

  it("🔴 فاضيين ⇒ **مافيش مفاتيح خالص**", () => {
    const out = buildTrialFieldRow(base, noDetails, null, { area: "", recorder: "  " });
    expect("اسم الحي - الشارع" in out).toBe(false);
    expect("اسم المسجّل" in out).toBe(false);
  });

  it("مافيش جلسة أصلاً ⇒ السلوك القديم بالحرف", () => {
    expect(buildTrialFieldRow(base, noDetails)).toEqual(
      buildTrialFieldRow(base, noDetails, null, {}));
  });

  it("واحد مكتوب والتاني لأ ⇒ المكتوب بس", () => {
    const out = buildTrialFieldRow(base, noDetails, null, { recorder: "سالم" });
    expect(out["اسم المسجّل"]).toBe("سالم");
    expect("اسم الحي - الشارع" in out).toBe(false);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 لوحات «الجديد» كانت **هتضيع من النسخة الاحتياطية**
 * ══════════════════════════════════════════════════════════════════════
 *  كانت بتتسجّل بـ`method: "تجربة الموديل الجديد"`، وده مالوش وجود عند:
 *    · صفحة النسخ الاحتياطي — بتاخد **صوت ويدوي بس** بالمطابقة الحرفية
 *      (`=== "متشيكة بالصوت"`)، فأي method تاني **مابيدخلش الباك أب خالص**
 *    · الخرائط — الأيقونة بـ`.includes("صوت")` ⇒ كانت هتظهر «يدوي»
 *
 *  والمالك قال «تشتغل تصدير وكل حاجة زيها زي صوتي بالظبط».
 *  ⇒ نفس الـmethod بالحرف. والتمييز في الداتا باقي: المعرّف `fc-trial-…`.
 */
describe("TRIAL_EXPORT_METHOD — زي صوتي بالحرف", () => {
  it("🔴 = «متشيكة بالصوت» — اللي النسخ الاحتياطي بيفلتر عليه", () => {
    expect(TRIAL_EXPORT_METHOD).toBe("متشيكة بالصوت");
  });

  it("الخرائط هتديله أيقونة الصوت", () => {
    expect(TRIAL_EXPORT_METHOD.includes("صوت")).toBe(true);
  });

  it("التمييز في الداتا باقي من المعرّف", () => {
    expect(trialEntryId({ id: "x-1", shownAt: 1 }, "agent-x")).toMatch(/^fc-trial-/);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 الحي والمسجّل **بيتختموا على اللوحة وقت ما اتقالت**
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): «لما بضيف الحي واسم الشارع وبضيف اسم
 *  المندوب بيتطبّق على كل اللوحات اللي موجودة. أنا عايزه يضيفه على اللوحات
 *  اللي بقولها وقت ما بحط اسم الشارع… ميضيفش على القديم لأني بغيّر دايماً
 *  في نفس الجلسة. ولما أغيّرهم يتاخد على اللوحات الجديدة… ولو شيلتهم
 *  ميتكتبش قدام اللوحة».
 *
 *  🔴 **كان غلط في التصميم**: الجدول والتصدير والإكسيل كانوا بيقروا **القيمة
 *  الحالية** للمربّع لكل الصفوف، فأي تغيير بيعيد كتابة اللوحات القديمة. ولأن
 *  المندوب بيلفّ شوارع كتير في الجلسة الواحدة، اللوحات كانت بتتسجّل **في شارع
 *  غلط** — وده بيتكتب في داتا المالك في صمت.
 *
 *  ⇒ القيمة بتتختم **على الصف لحظة ما يتعمل**، ومابتتغيّرش بعد كده.
 */
describe("sessionStamp — الختم لحظة النطق", () => {
  it("المكتوب بيتختم", () => {
    expect(sessionStamp("النسيم - ٣٠", "أحمد")).toEqual({ area: "النسيم - ٣٠", recorder: "أحمد" });
  });

  it("🔴 فاضي ⇒ `null` — «لو شيلتهم ميتكتبش قدام اللوحة»", () => {
    expect(sessionStamp("", "  ")).toEqual({ area: null, recorder: null });
  });

  it("المسافات حوالين الكلام بتتشال", () => {
    expect(sessionStamp("  الروضة ", " سالم ")).toEqual({ area: "الروضة", recorder: "سالم" });
  });
});

describe("🔴 التصدير بياخد ختم **اللوحة** مش المربّع الحالي", () => {
  const base = {
    id: "1", plate: "أبح1234", type: null, note: null, match: null,
    lat: null, lng: null, gpsAccuracy: null, shownAt: 0,
    tier: "green" as const, conf: 1,
  };
  const noDetails = { car: null, company: null, chassis: null };

  it("كل لوحة بحيّها — مش آخر حي اتكتب", () => {
    const a = buildTrialFieldRow(base, noDetails, null, { area: "النسيم" });
    const b = buildTrialFieldRow(base, noDetails, null, { area: "الروضة" });
    expect(a["اسم الحي - الشارع"]).toBe("النسيم");
    expect(b["اسم الحي - الشارع"]).toBe("الروضة");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 المسودّة اللي بتوصل **بعد** الشيت كانت بترجع من غير «مطلوبة»
 * ══════════════════════════════════════════════════════════════════════
 *  المسودّة بتتحفظ من غير صف الشيت (الحصّة)، وبيرجعلها من الفهرس. الإرجاع
 *  كان بيحصل **لما الفهرس يتغيّر بس** — فلو الشيت جه الأول (وده اللي بيحصل
 *  لما المندوب يرجع للصفحة والملف في الذاكرة) والمسودّة جت بعده، اللوحات
 *  المطلوبة كانت بترجع عادية. فالمسودّة لازم تترجّع **وهي بتوصل** كمان.
 */
describe("restoreDraftRows", () => {
  const key = (p: string) => p.replace(/\s+/g, "");
  const index = new Map<string, Record<string, string>>([["ابح1234", { "رقم اللوحة": "ا ب ح 1234" }]]);

  it("الشيت جاهز قبل المسودّة ⇒ «مطلوبة» بترجع", () => {
    const saved = [{ id: "1", plate: "ا ب ح 1234" }, { id: "2", plate: "س ص ط 5678" }];
    const out = restoreDraftRows(saved as never, index, key) as unknown as { match: unknown }[];
    expect(out[0].match).toEqual({ "رقم اللوحة": "ا ب ح 1234" });
    expect(out[1].match).toBeNull();
  });

  it("الشيت لسه ماجهزش ⇒ المسودّة زي ما هي (الإرجاع بيحصل لما الشيت ييجي)", () => {
    const saved = [{ id: "1", plate: "ا ب ح 1234" }];
    expect(restoreDraftRows(saved as never, new Map(), key)).toBe(saved);
  });

  it("مسودّة فاضية ⇒ فاضية", () => {
    expect(restoreDraftRows([], index, key)).toEqual([]);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «مانفعش يتحفظ» لازم تقول **ليه**
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٤ سبتمبر ٢٠٢٦): الرسالة كانت «مانفعش يتحفظ ولا سجل — جرّب
 *  تاني» بس، فمكانش فيه طريقة نعرف السبب من صورة الشاشة (اتصال ميت؟ مساحة
 *  خلصت؟). دلوقتي اسم الغلط بيتكتب في آخرها.
 */
describe("firstFailureReason", () => {
  const rej = (reason: unknown): PromiseSettledResult<unknown> => ({ status: "rejected", reason });
  const ok: PromiseSettledResult<unknown> = { status: "fulfilled", value: undefined };

  it("اسم الغلط (زي QuotaExceededError)", () => {
    expect(firstFailureReason([ok, rej(new DOMException("full", "QuotaExceededError"))])).toBe("QuotaExceededError");
  });

  it("الغلط العام بيرجّع رسالته لو اسمه «Error» بس", () => {
    expect(firstFailureReason([rej(new Error("Connection to Indexed Database server lost"))]))
      .toBe("Connection to Indexed Database server lost");
  });

  it("نص أو قيمة غريبة ⇒ نص قصير", () => {
    expect(firstFailureReason([rej("boom")])).toBe("boom");
    expect(firstFailureReason([rej(null)])).toBe("غير معروف");
  });

  it("مافيش فشل ⇒ null", () => {
    expect(firstFailureReason([ok, ok])).toBeNull();
    expect(firstFailureReason([])).toBeNull();
  });

  it("الرسالة الطويلة بتتقص (عشان تتقري على الموبايل)", () => {
    expect(firstFailureReason([rej(new Error("x".repeat(300)))])!.length).toBeLessThanOrEqual(80);
  });
});
