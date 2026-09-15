import { describe, it, expect } from "vitest";
import { collapseSameMinuteDuplicates, sameMinuteDuplicateIds, dedupeSameMinuteRows } from "@/lib/fieldCheck";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * لوحة واحدة طلعت **٨ مرات** في ٧٦ ثانية بنفس الـGPS بالظبط — محرك الصوت
 * بيعيد إرسال نفس النطق وحارس الـ٦ ثواني بيسمح بعد ما يعدّي. طلب المالك:
 * «لو لوحة مكررة بتطابق حروف وأرقام بالظبط بنفس الوقت والتاريخ متطلعش غير مرة».
 *
 * القاعدة: نفس اللوحة (بعد التطبيع) + نفس **الدقيقة** ⇒ صف واحد.
 * ⚠️ اللي **مايتجمّعش**: دقيقة مختلفة (تشييك حقيقي تاني)، أو لوحة مختلفة.
 */
const e = (id: string, plate: string, checkedAt: string, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry =>
  ({ id, plate, row: {}, method: "صوت", checkedAt, ...extra });

describe("collapseSameMinuteDuplicates", () => {
  it("يجمّع نفس اللوحة في نفس الدقيقة في صف واحد", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:41.000Z"),
      e("3", "رري3706", "2026-09-10T08:15:59.000Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("1"); // الأول بيفضل — هو اللي اتربط بيه أي تعديل
  });

  it("مايجمّعش لوحتين مختلفتين في نفس الدقيقة", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "اسر2244", "2026-09-10T08:15:05.000Z"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("مايجمّعش نفس اللوحة في دقيقة مختلفة — ده تشييك حقيقي تاني", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "رري3706", "2026-09-10T08:15:59.000Z"),
      e("2", "رري3706", "2026-09-10T08:16:01.000Z"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("بيعتبر «ر ر ي 3706» و«رري3706» نفس اللوحة", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "ر ر ي 3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:20.000Z"),
    ]);
    expect(out).toHaveLength(1);
  });

  it("بيفضّل الصف اللي فيه GPS على الصف الفاضي حتى لو جه بعده", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:20.000Z", { lat: 24.7, lng: 46.6 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBe(24.7);
    expect(out[0].id).toBe("1"); // المعرّف بتاع الأول بيفضل عشان التعديلات ماتضيعش
  });

  it("بيحافظ على الترتيب الأصلي", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "اسر2244", "2026-09-10T08:14:00.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("3", "رري3706", "2026-09-10T08:15:30.000Z"),
      e("4", "دوا8403", "2026-09-10T08:16:00.000Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["1", "2", "4"]);
  });

  it("بيسيب الصفوف اللي توقيتها باظ زي ما هي بدل ما يرميها", () => {
    const out = collapseSameMinuteDuplicates([
      e("1", "رري3706", "مش تاريخ"),
      e("2", "رري3706", "مش تاريخ"),
    ]);
    expect(out).toHaveLength(2);
  });
});

/**
 * فخ لازم يتقفل: لو جمّعنا ٨ صفوف في واحد والمندوب مسحه، السبعة الباقيين
 * في قاعدة البيانات هيبان منهم واحد تاني ⇒ «مسحته ورجع». فالمسح لازم يشيل
 * كل إخوات الصف مش الظاهر بس.
 */
describe("sameMinuteDuplicateIds", () => {
  it("بيرجّع كل معرّفات المجموعة تحت معرّف الصف الظاهر", () => {
    const g = sameMinuteDuplicateIds([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:41.000Z"),
      e("3", "رري3706", "2026-09-10T08:15:59.000Z"),
    ]);
    expect(g.get("1")).toEqual(["1", "2", "3"]);
  });

  it("مابيحطّش مدخل للصفوف اللي مالهاش تكرار", () => {
    const g = sameMinuteDuplicateIds([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "اسر2244", "2026-09-10T08:15:05.000Z"),
    ]);
    expect(g.size).toBe(0);
  });

  it("بيفصل المجموعات لما الدقيقة تختلف", () => {
    const g = sameMinuteDuplicateIds([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:40.000Z"),
      e("3", "رري3706", "2026-09-10T08:16:10.000Z"),
    ]);
    expect(g.get("1")).toEqual(["1", "2"]);
    expect(g.has("3")).toBe(false);
  });
});

/**
 * سجلات المجموعة شكل صفوفها مختلف (جاية من السيرفر)، فمحتاجين نفس القاعدة
 * بشكل عام. الفرق المهم: **مندوبين مختلفين** ممكن يشيّكوا نفس اللوحة في نفس
 * الدقيقة بشكل شرعي ⇒ مايتجمّعوش.
 */
describe("dedupeSameMinuteRows", () => {
  const r = (id: string, plate: string, at: string, owner: string) => ({ id, plate, at, owner });
  const get = (x: { plate: string; at: string; owner: string }) => ({ plate: x.plate, at: x.at, owner: x.owner });

  it("يجمّع تكرار نفس المندوب في نفس الدقيقة", () => {
    const out = dedupeSameMinuteRows(
      [r("1", "رري3706", "2026-09-10T08:15:03Z", "a"), r("2", "رري3706", "2026-09-10T08:15:40Z", "a")], get);
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });

  it("مايجمّعش مندوبين مختلفين شيّكوا نفس اللوحة", () => {
    const out = dedupeSameMinuteRows(
      [r("1", "رري3706", "2026-09-10T08:15:03Z", "a"), r("2", "رري3706", "2026-09-10T08:15:40Z", "b")], get);
    expect(out).toHaveLength(2);
  });

  it("بيسيب الصف لو التوقيت باظ", () => {
    const out = dedupeSameMinuteRows(
      [r("1", "رري3706", "x", "a"), r("2", "رري3706", "x", "a")], get);
    expect(out).toHaveLength(2);
  });
});
