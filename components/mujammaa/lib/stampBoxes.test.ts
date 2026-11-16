import { beforeEach, describe, expect, it } from "vitest";
import { BOXES_KEY, joinNotes, loadBoxes, saveBoxes } from "./stampBoxes";
import { AUTO_STREET_MAX_ACCURACY_M, DistrictResolver, STREET_REUSE_M, fillDistricts, fillStreets } from "./autoDistrict";
import type { PlateEntry } from "./plateEntry";
import { SessionStamp } from "./sessionStamp";

/**
 * 🧾 مربعات المجمّع (١٨ أكتوبر ٢٠٢٦) — المالك: «اسم المنطقه دة خليه اسم الحي ويظهر في عمود لوحده لو هو حاطهه
 * لو مش حاطه اسم الحي اللي هو بيسجل فيه يتاخد تلقائي من الجي بي اس».
 */
describe("joinNotes — الجراج + ملاحظة كوهير الاتنين", () => {
  it("المكتوب في المربع الأول وبعده اللي اتقال — من غير تكرار ولا فواصل فاضية", () => {
    expect(joinNotes("اول جراج يمين", "مركونه")).toBe("اول جراج يمين · مركونه");
    expect(joinNotes("اول جراج يمين", undefined)).toBe("اول جراج يمين");
    expect(joinNotes(undefined, "مركونه")).toBe("مركونه");
    expect(joinNotes("مركونه", "مركونه")).toBe("مركونه");
    expect(joinNotes("  ", "")).toBeUndefined();
  });
});

describe("loadBoxes / saveBoxes — المكتوب يفضل لو البرنامج اتقفل", () => {
  beforeEach(() => localStorage.clear());
  it("بيتحفظ ويرجع — وفاضي لو مافيش", () => {
    expect(loadBoxes()).toEqual({ district: "", recorder: "", garage: "", street: "" });
    saveBoxes({ district: "النرجس", recorder: "عاصم", garage: "", street: "" });
    expect(JSON.parse(localStorage.getItem(BOXES_KEY)!)).toMatchObject({ district: "النرجس" });
    expect(loadBoxes()).toEqual({ district: "النرجس", recorder: "عاصم", garage: "", street: "" });
  });
  it("قيمة بايظة ⇒ فاضي", () => {
    localStorage.setItem(BOXES_KEY, "{not json");
    expect(loadBoxes()).toEqual({ district: "", recorder: "", garage: "", street: "" });
  });
});

const T0 = 1_760_800_000_000;
const e = (id: string, lat: number | null, extra: Partial<PlateEntry> = {}) =>
  ({
    id,
    review: { plate: id },
    pin: lat === null ? null : { lat, lng: 46.7, accuracy: 8, at: T0, ageMs: 0, stale: false },
    match: { kind: "none" },
    capturedAt: T0 + Number(id.replace(/\D/g, "")) * 1000,
    source: "batch",
    ...extra,
  }) as unknown as PlateEntry;

describe("DistrictResolver — اسم الحي من الموقع (طلب واحد لكل ~٢٢٠م)", () => {
  it("المكان القريب بياخد نفس الحي من غير طلب جديد — والبعيد طلب جديد", async () => {
    const calls: Array<[number, number]> = [];
    const r = new DistrictResolver(async (lat, lng) => {
      calls.push([lat, lng]);
      return { street: "شارع", district: lat < 24.71 ? "النرجس" : "الياسمين" };
    }, { minGapMs: 0 });
    expect(await r.resolve(24.7001, 46.7001)).toBe("النرجس");
    expect(await r.resolve(24.7004, 46.7003)).toBe("النرجس");   // نفس الخانة
    expect(calls.length).toBe(1);
    expect(await r.resolve(24.72, 46.7)).toBe("الياسمين");
    expect(calls.length).toBe(2);
  });

  it("«غير معروف»/فشل ⇒ فاضي ومابيتخزّنش (المكان يستاهل محاولة تانية)", async () => {
    let n = 0;
    const r = new DistrictResolver(async () => {
      n++;
      if (n === 1) throw new Error("offline");
      return { street: "", district: "غير معروف" };
    }, { minGapMs: 0 });
    expect(await r.resolve(24.7, 46.7)).toBe("");
    expect(await r.resolve(24.7, 46.7)).toBe("");
    expect(n).toBe(2);
  });
});

describe("fillDistricts — اللي كتبه المندوب يكسب، والباقي من موقع اللوحة", () => {
  const resolver = () =>
    new DistrictResolver(async (lat) => ({ street: "", district: lat < 24.71 ? "النرجس" : "الياسمين" }), { minGapMs: 0 });

  it("الفاضي بس بيتملى — والمكتوب مابيتلمسش", async () => {
    const list = [e("p1", 24.7), e("p2", 24.72), e("p3", 24.7, { neighborhood: "حي كتبه المندوب" })];
    const out = await fillDistricts(list, resolver());
    expect(out.map((x) => x.neighborhood)).toEqual(["النرجس", "الياسمين", "حي كتبه المندوب"]);
    expect(out[0].neighborhoodAuto).toBe(true);
    expect(out[2].neighborhoodAuto).toBeFalsy();
  });

  it("لوحة من غير موقع ⇒ حي العربية اللي قبلها (ولو أول واحدة ⇒ اللي بعدها) — مايسيبش خانات فاضية", async () => {
    const list = [e("p1", null), e("p2", 24.7), e("p3", null), e("p4", 24.72)];
    const out = await fillDistricts(list, resolver());
    expect(out.map((x) => x.neighborhood)).toEqual(["النرجس", "النرجس", "النرجس", "الياسمين"]);
  });

  it("مافيش ولا موقع ⇒ زي ما هي (مابنخترعش)", async () => {
    const list = [e("p1", null), e("p2", null)];
    const out = await fillDistricts(list, resolver());
    expect(out.every((x) => !x.neighborhood)).toBe(true);
  });

  it("حد أقصى للوقت — اللي ماخلصش بيفضل فاضي ومابيوقّفش حاجة", async () => {
    const slow = new DistrictResolver(() => new Promise((res) => setTimeout(() => res({ street: "", district: "بطيء" }), 200)), { minGapMs: 0 });
    const out = await fillDistricts([e("p1", 24.7), e("p2", 24.72)], slow, { timeoutMs: 50 });
    expect(out.every((x) => !x.neighborhood)).toBe(true);
  });
});

/**
 * 🧹 «لما يشيل ميتكتبش» (١٦ نوفمبر ٢٠٢٦) — المالك: «لما يشيل ميتكتبش وياخد اسم الحي واسم الشارع من الجي بي اس نفسه».
 * لوحة من غير موقع بعد ما المندوب **مسح** المربع كانت بتاخد الحي اللي **كان مكتوب** من اللوحة اللي قبلها.
 * دلوقتي الاحتياطي من لوحات حيّها **من الـGPS** بس.
 */
describe("fillDistricts — الاحتياطي من الـGPS بس (مش من اللي المندوب كتبه ومسحه)", () => {
  const resolver = () =>
    new DistrictResolver(async (lat) => ({ street: "", district: lat < 24.71 ? "النرجس" : "الياسمين" }), { minGapMs: 0 });

  it("كتب ⇒ مسح ⇒ لوحة من غير موقع ⇒ حي أقرب لوحة من الـGPS، مش المكتوب", async () => {
    const list = [e("p1", 24.72, { neighborhood: "حي كتبه المندوب" }), e("p2", null), e("p3", 24.7)];
    const out = await fillDistricts(list, resolver());
    expect(out.map((x) => x.neighborhood)).toEqual(["حي كتبه المندوب", "النرجس", "النرجس"]);
    expect(out[1].neighborhoodAuto).toBe(true);
  });

  it("مافيش ولا لوحة حيّها من الـGPS ⇒ فاضي (مابنمدّش المكتوب)", async () => {
    const list = [e("p1", null, { neighborhood: "حي كتبه المندوب" }), e("p2", null)];
    const out = await fillDistricts(list, resolver());
    expect(out[1].neighborhood).toBeUndefined();
  });
});

/**
 * 🛣️ «اسم الشارع» من الـGPS (١٦ نوفمبر ٢٠٢٦) — المربع فاضي لحظة النطق ⇒ شارع موقع اللوحة نفسها. نفس قواعد Voice PRO
 * (`lib/autoArea.ts`): دقة ≤٣٥م بس (أضعف ⇒ الشارع بيطلع غلط) و«مايسيبش خانات فاضية» ⇒ شارع أقرب لوحة من الـGPS.
 */
describe("fillStreets — اسم الشارع من موقع اللوحة لو المربع فاضي", () => {
  const streetAt = (lat: number) => (lat < 24.7005 ? "طريق الملك فهد" : lat < 24.71 ? "شارع العليا" : "شارع التحلية");
  const make = (calls?: number[]) =>
    new DistrictResolver(async (lat) => {
      calls?.push(lat);
      return { street: streetAt(lat), district: "النرجس" };
    }, { minGapMs: 0 });

  it("الفاضي بس بيتملى من موقعه — والمكتوب مابيتلمسش", async () => {
    const list = [e("p1", 24.7), e("p2", 24.708), e("p3", 24.72, { streetName: "شارع كتبه المندوب" })];
    const out = await fillStreets(list, make());
    expect(out.map((x) => x.streetName)).toEqual(["طريق الملك فهد", "شارع العليا", "شارع كتبه المندوب"]);
    expect(out[0].streetNameAuto).toBe(true);
    expect(out[2].streetNameAuto).toBeFalsy();
  });

  it("لوحات قريبة من بعض (أقل من ٢٥م) ⇒ طلب واحد", async () => {
    const calls: number[] = [];
    const out = await fillStreets([e("p1", 24.7), e("p2", 24.70005), e("p3", 24.7001)], make(calls));
    expect(out.map((x) => x.streetName)).toEqual(["طريق الملك فهد", "طريق الملك فهد", "طريق الملك فهد"]);
    expect(calls.length).toBe(1);
    expect(STREET_REUSE_M).toBe(25);
  });

  it("دقة أوحش من ٣٥م أو من غير موقع ⇒ شارع أقرب لوحة من الـGPS (قبلها، وإلا بعدها)", async () => {
    const weak = e("p2", 24.72);
    (weak.pin as { accuracy: number }).accuracy = 60;
    const list = [e("p1", 24.7), weak, e("p3", null), e("p4", 24.708)];
    const out = await fillStreets(list, make());
    expect(out.map((x) => x.streetName)).toEqual(["طريق الملك فهد", "طريق الملك فهد", "طريق الملك فهد", "شارع العليا"]);
    expect(AUTO_STREET_MAX_ACCURACY_M).toBe(35);
  });

  it("كتب الشارع ⇒ مسحه ⇒ اللوحة اللي من غير موقع مابتاخدش المكتوب", async () => {
    const list = [e("p1", null, { streetName: "شارع كتبه المندوب" }), e("p2", null), e("p3", 24.708)];
    const out = await fillStreets(list, make());
    expect(out.map((x) => x.streetName)).toEqual(["شارع كتبه المندوب", "شارع العليا", "شارع العليا"]);
  });

  it("مافيش ولا موقع ⇒ زي ما هي · «غير معروف» مابيتكتبش", async () => {
    const none = new DistrictResolver(async () => ({ street: "غير معروف", district: "" }), { minGapMs: 0 });
    const out = await fillStreets([e("p1", 24.7), e("p2", null)], none);
    expect(out.every((x) => !x.streetName)).toBe(true);
  });

  it("حد أقصى للوقت — اللي ماخلصش بيفضل فاضي (مابياخدش شارع لوحة بعيدة)", async () => {
    const slow = new DistrictResolver(() => new Promise((res) => setTimeout(() => res({ street: "بطيء", district: "" }), 200)), { minGapMs: 0 });
    const out = await fillStreets([e("p1", 24.7), e("p2", 24.72)], slow, { timeoutMs: 50 });
    expect(out.every((x) => !x.streetName)).toBe(true);
  });
});

/**
 * ✅ تأكيد المالك (١٦ نوفمبر ٢٠٢٦): «لما يكتب يطلع قدام اللوحات ولما يمسح ويكتب غيرة يطلع الجديد قدام اللوحات ولما يشيل
 * ميتكتبش». كل لوحة بتاخد اللي كان مكتوب **لحظة نطقها** — نفس الكود اللي الصفحة بتندهه (`typeInto` · «مسح» = `setX("")`).
 */
describe("المربعات بالوقت — كتب ⇒ غيّر ⇒ مسح", () => {
  for (const [label, type, clear, read] of [
    ["اسم الحي", "street", (s: SessionStamp, t: number) => s.setStreet("", t), (s: SessionStamp, t: number) => s.at(t).street],
    ["اسم الشارع", "streetName", (s: SessionStamp, t: number) => s.setStreetName("", t), (s: SessionStamp, t: number) => s.at(t).streetName],
  ] as const) {
    it(label, () => {
      const s = new SessionStamp({ startedAt: T0 });
      // كتب حرف حرف من ثانية ٢
      s.typeInto(type, "ا", 2000);
      s.typeInto(type, "الن", 2400);
      s.typeInto(type, "النرجس", 2900);
      expect(read(s, 1000)).toBeNull();          // لوحة قبل ما يكتب ⇒ فاضي (ياخد من الـGPS)
      expect(read(s, 5000)).toBe("النرجس");      // بعد ما كتب ⇒ المكتوب
      // مسح بإيده (حرف حرف لحد الفاضي) وكتب غيره بعد وقفة
      s.typeInto(type, "", 20000);
      s.typeInto(type, "الياسمين", 25000);
      expect(read(s, 10000)).toBe("النرجس");     // اللي قبل التغيير بتفضل زي ما هي
      expect(read(s, 30000)).toBe("الياسمين");   // بعد التغيير ⇒ الجديد
      // «مسح» ⇒ اللي بعده فاضي (ياخد من الـGPS)
      clear(s, 40000);
      expect(read(s, 45000)).toBeNull();
      expect(read(s, 35000)).toBe("الياسمين");
    });
  }
});
