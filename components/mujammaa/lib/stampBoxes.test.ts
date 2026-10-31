import { beforeEach, describe, expect, it } from "vitest";
import { BOXES_KEY, joinNotes, loadBoxes, saveBoxes } from "./stampBoxes";
import { DistrictResolver, fillDistricts } from "./autoDistrict";
import type { PlateEntry } from "./plateEntry";

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
