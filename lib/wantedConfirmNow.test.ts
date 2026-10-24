import { describe, expect, it } from "vitest";
import {
  CONFIRM_MIN_SEC,
  WANTED_CONFIRM_NOW_FOR_ALL,
  canConfirmNow,
  planConfirmWindow,
  sheetReadyAlerts,
} from "./wantedConfirmNow";

/**
 * ⚡ نافذة التأكيد الفورية (المالك ٢٤ أكتوبر ٢٠٢٦): «عايز حل صارم … نقلل الوقت المستغرق في المراجعة … بس طبعاً
 * مراجعة موثوقة». القاعدة **ماتغيّرتش**: الصفّارة بعد نافذتين **مختلفتين** سمعوا اللوحة بالحرف (`confirmWanted`).
 * اللي اتغيّر إن النافذة التانية بتتبعت **أول ما الأولى تلاقي اللوحة في الشيت** بدل ما تستنى دورها (١٫٥ث).
 */
describe("planConfirmWindow — نفس بداية النافذة الجاية بالظبط، ونهايتها دلوقتي", () => {
  const W = { from: 10, to: 15 };

  it("النافذة اللي لاقت اللوحة [١٠، ١٥] والقراية رجعت عند ١٥٫٦ ⇒ [١١٫٥، ١٥٫٦]", () => {
    expect(planConfirmWindow(W, 15.6, 15, 1.5, 5)).toEqual({ from: 11.5, to: 15.6 });
  });

  it("بدايتها = بداية النافذة الزاحفة الجاية (from + الخطوة) — فاللوحة جوّاها بنفس شرط النافذة اللي كانت هتأكّد", () => {
    const p = planConfirmWindow(W, 16.0, 15, 1.5, 5);
    expect(p?.from).toBe(W.from + 1.5);
  });

  it("النافذة الجاية العادية اتبعتت خلاص ⇒ لأ (هي اللي هتأكّد — مفيش طلب زيادة)", () => {
    expect(planConfirmWindow(W, 16.6, 16.5, 1.5, 5)).toBeNull();
  });

  it("الجاية العادية على وشك تتبعت (أقل من ٠٫٣ث) ⇒ لأ — مفيش لازمة لطلبين ورا بعض", () => {
    expect(planConfirmWindow(W, 16.3, 15, 1.5, 5)).toBeNull();
    expect(planConfirmWindow(W, 16.1, 15, 1.5, 5)).not.toBeNull();
  });

  it("نافذة قديمة (بعد ميعاد الجاية بكتير) ⇒ لأ", () => {
    expect(planConfirmWindow(W, 17.0, 15, 1.5, 5)).toBeNull();
  });

  it("أقصر من الحد الأدنى ⇒ لأ", () => {
    expect(planConfirmWindow({ from: 13, to: 14 }, 14.2, 14, 1.5, 5)).toBeNull();
    expect(CONFIRM_MIN_SEC).toBeGreaterThanOrEqual(2);
  });

  it("الساعة لسه ماعدّتش نهاية النافذة (مستحيل عملياً) ⇒ لأ", () => {
    expect(planConfirmWindow(W, 15, 15, 1.5, 5)).toBeNull();
  });
});

describe("canConfirmNow — للكل (المالك ٢٤ أكتوبر ٢٠٢٦: «يلا انشرها للكل»)", () => {
  it("المناديب والسوبر أدمن الاتنين", () => {
    expect(WANTED_CONFIRM_NOW_FOR_ALL).toBe(true);
    expect(canConfirmNow(true)).toBe(true);
    expect(canConfirmNow(false)).toBe(true);
  });
});

describe("sheetReadyAlerts — الشيت جهز بعد ما المندوب بدأ ⇒ اللوحات المؤكّدة اللي فاتت تصفّر", () => {
  const idx = new Map<string, Record<string, string>>([["حبك5813", { "رقم اللوحة": "حبك5813" }]]);
  const key = (p: string) => p;
  const now = 1_000_000;
  const start = now - 30_000;
  const row = (over: Partial<{ plate: string; provisional: boolean; mult: number; shownAt: number; match: Record<string, string> | null; edited?: { plate?: boolean } }> = {}) => ({
    plate: "حبك5813", provisional: false, mult: 2, shownAt: now - 5_000, match: null, ...over,
  });

  it("لوحة مؤكّدة (نافذتين) في الجلسة دي ومن غير «مطلوبة» ⇒ تصفّر", () => {
    expect(sheetReadyAlerts([row()], idx, key, start, now).map((h) => h.plate)).toEqual(["حبك5813"]);
  });

  it("مبدئية أو من نافذة واحدة ⇒ لأ (نفس قاعدة التأكيد)", () => {
    expect(sheetReadyAlerts([row({ provisional: true })], idx, key, start, now)).toEqual([]);
    expect(sheetReadyAlerts([row({ mult: 1 })], idx, key, start, now)).toEqual([]);
  });

  it("من جلسة فاتت (مسودّة) أو أقدم من دقيقة ⇒ لأ", () => {
    expect(sheetReadyAlerts([row({ shownAt: start - 1 })], idx, key, start, now)).toEqual([]);
    expect(sheetReadyAlerts([row({ shownAt: now - 61_000 })], idx, key, now - 120_000, now)).toEqual([]);
  });

  it("مش في الشيت، أو متعلّمة «مطلوبة» خلاص، أو المندوب صحّح لوحتها بإيده ⇒ لأ", () => {
    expect(sheetReadyAlerts([row({ plate: "دلم8219" })], idx, key, start, now)).toEqual([]);
    expect(sheetReadyAlerts([row({ match: { x: "1" } })], idx, key, start, now)).toEqual([]);
    expect(sheetReadyAlerts([row({ edited: { plate: true } })], idx, key, start, now)).toEqual([]);
  });

  it("نفس اللوحة في صفين ⇒ صفّارة واحدة", () => {
    expect(sheetReadyAlerts([row(), row()], idx, key, start, now)).toHaveLength(1);
  });
});
