import { describe, it, expect } from "vitest";
import { showProvisional, confirmedWins, PROVISIONAL_MIN_CONF, PROVISIONAL_TTL_MS } from "../lib/provisionalRow";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «تظهر فوراً وتتأكّد بعدين»
 * ══════════════════════════════════════════════════════════════════════
 *  بعد ما الإجماع بقى شغّال (PR #269) التأخير طلع من ٤.١ث لـ**٦.٨ث** —
 *  لأن اللوحة بقت تستنى نافذة تانية تأكّدها. المالك طلب السرعة **بلا** خسارة
 *  دقة، فالحل: الصف يظهر من **القراءة الأولى** بعلامة مبدئية، والإجماع يأكّده
 *  أو يصحّحه لما ييجي.
 *
 *  🔴 والخطر الواضح: القراءة الخام فيها **الاختراع** كمان. فالمبدئي بيتعرض
 *  للقراءات **عالية الثقة** بس (نفس بوابة الظهور المنفرد)، وأي مبدئي ماحدش
 *  أكّده خلال `PROVISIONAL_TTL_MS` **بيتشال** — كان اختراع.
 */

describe("showProvisional — مين يستاهل يظهر فوراً", () => {
  it("قراءة مقبولة عالية الثقة تظهر", () => {
    expect(showProvisional({ accepted: true, blocked: false, conf: 0.99 })).toBe(true);
    expect(showProvisional({ accepted: true, blocked: false, conf: PROVISIONAL_MIN_CONF })).toBe(true);
  });

  it("🔴 المحجوبة كاختراع **ماتظهرش** مهما كانت ثقتها", () => {
    // من سجل المالك: حطو7727 بثقة ٦٤٪ · بدط8000 بـ٧١٪ — الاتنين اختراع
    expect(showProvisional({ accepted: true, blocked: true, conf: 0.93 })).toBe(false);
  });

  it("🔴 الثقة الواطية ماتظهرش — دي بوابة الاختراع", () => {
    // حدو2626 (٤٦٪) · رقم6404 (٣٣٪) من سجل المالك
    expect(showProvisional({ accepted: true, blocked: false, conf: 0.46 })).toBe(false);
    expect(showProvisional({ accepted: true, blocked: false, conf: 0.89 })).toBe(false);
  });

  it("المرفوضة من السيرفر ماتظهرش", () => {
    expect(showProvisional({ accepted: false, blocked: false, conf: 0.99 })).toBe(false);
  });
});

describe("confirmedWins — المؤكّد بيغلب المبدئي دايماً", () => {
  it("🔴 المؤكّد يكسب حتى لو المبدئي ثقته أعلى", () => {
    expect(confirmedWins(
      { provisional: false, mult: 1, conf: 0.90, atMs: 1000 },
      { provisional: true, mult: 1, conf: 0.99, atMs: 1000 },
    )).toBe(true);
  });

  it("المبدئي مايغلبش مؤكّد", () => {
    expect(confirmedWins(
      { provisional: true, mult: 1, conf: 0.99, atMs: 5000 },
      { provisional: false, mult: 1, conf: 0.90, atMs: 1000 },
    )).toBe(false);
  });

  it("مؤكّدين: الأكتر نوافذ يكسب، وبعدين الأعلى ثقة، وبعدين الأحدث", () => {
    const base = { provisional: false as const, conf: 0.9, atMs: 1000 };
    expect(confirmedWins({ ...base, mult: 3 }, { ...base, mult: 2 })).toBe(true);
    expect(confirmedWins({ ...base, mult: 2 }, { ...base, mult: 3 })).toBe(false);
    expect(confirmedWins({ ...base, mult: 2, conf: 0.99 }, { ...base, mult: 2, conf: 0.9 })).toBe(true);
    expect(confirmedWins({ ...base, mult: 2, atMs: 9000 }, { ...base, mult: 2, atMs: 1000 })).toBe(true);
  });

  it("مبدئيين: الأحدث يكسب (القراءة الأجدد شافت أكتر)", () => {
    const base = { provisional: true as const, mult: 1, conf: 0.95 };
    expect(confirmedWins({ ...base, atMs: 5000 }, { ...base, atMs: 1000 })).toBe(true);
  });

  it("مهلة المبدئي معقولة — أطول من دورة تأكيد كاملة", () => {
    expect(PROVISIONAL_TTL_MS).toBeGreaterThan(8000);
  });
});
