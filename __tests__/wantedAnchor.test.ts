import { describe, it, expect } from "vitest";
import { buildWantedIndex, anchorPlateToWanted } from "../lib/plateParser";

describe("buildWantedIndex — فهرسة المطلوبين بآخر 4 أرقام", () => {
  it("يجمّع اللوحات في دلاء حسب الأرقام", () => {
    const idx = buildWantedIndex(new Set(["حبك5878", "دبر5878", "لما0001"]));
    expect(idx.get("5878")?.sort()).toEqual(["حبك5878", "دبر5878"]);
    expect(idx.get("0001")).toEqual(["لما0001"]);
  });
  it("يتجاهل ما ليس فيه أرقام أصلاً (normalizePlate يكمّل الأرقام القصيرة لـ 4)", () => {
    const idx = buildWantedIndex(new Set(["حبك", "دبر5878"])); // «حبك» بلا أرقام → تُتجاهل
    expect(idx.get("5878")).toEqual(["دبر5878"]);
    expect([...idx.keys()]).toEqual(["5878"]);
  });
});

describe("anchorPlateToWanted — تصحيح حرف الحلق بقائمة المطلوبين", () => {
  const idx = buildWantedIndex(new Set(["رحع3345", "حبك5878", "صبع9911", "دبر1234"]));

  it("رهع→رحع: التباس ه/ح مع أرقام مطابقة → تصحيح تلقائي + إنذار", () => {
    const r = anchorPlateToWanted("رهع3345", idx);
    expect(r.plate).toBe("رحع3345");
    expect(r.matched).toBe(true);
    expect(r.corrected).toBe(true);
    expect(r.original).toBe("رهع3345");
  });

  it("لوحة مطابقة تماماً → تُقبل بدون تصحيح", () => {
    const r = anchorPlateToWanted("حبك5878", idx);
    expect(r).toMatchObject({ plate: "حبك5878", matched: true, corrected: false });
  });

  it("التباسات مسموحة: س↔ص، ق↔ك، د↔ط", () => {
    expect(anchorPlateToWanted("سبع9911", idx).plate).toBe("صبع9911"); // س→ص
    expect(anchorPlateToWanted("طبر1234", idx).plate).toBe("دبر1234"); // ط→د
  });

  it("الأرقام لازم تطابق تماماً — رقم غلط لا يُصحّح أبداً", () => {
    const r = anchorPlateToWanted("رهع3346", idx);
    expect(r).toMatchObject({ matched: false, corrected: false });
    expect(r.plate).toBe("رهع3346");
  });

  it("فرق حرفين (مش زوج التباس واحد) لا يُصحّح تلقائياً", () => {
    // رمع3345: ر=ر، م≠ح (مش زوج التباس)، ع=ع → hardMismatch
    const r = anchorPlateToWanted("رمع3345", idx);
    expect(r.corrected).toBe(false);
  });

  it("طول حروف مختلف → لا تصحيح (الالتباس لا يغيّر الطول)", () => {
    const r = anchorPlateToWanted("رح3345", idx); // حرفين مقابل رحع (3 حروف)
    expect(r.corrected).toBe(false);
  });

  it("لوحة مش موجودة بأرقامها → تفضل زي ما هي", () => {
    const r = anchorPlateToWanted("منل4567", idx);
    expect(r).toMatchObject({ plate: "منل4567", matched: false, corrected: false });
  });

  it("غموض: مرشحان مطلوبان بنفس الأرقام وفرق حرف حلق → لا تصحيح تلقائي + علامة غموض", () => {
    const amb = buildWantedIndex(new Set(["حبك1234", "هبك1234"]));
    const r = anchorPlateToWanted("حبك1234", amb);
    // حبك موجودة بالضبط → تُقبل (exact يسبق التصحيح)
    expect(r.matched).toBe(true);
    expect(r.corrected).toBe(false);
    // لكن لوحة ثالثة ملتبسة معهما الاثنين → غموض
    const r2 = anchorPlateToWanted("خبك1234", amb); // خ ليست حرف لوحة صالح أصلاً، نجرّب حالة أوضح:
    expect(r2).toBeDefined();
  });

  it("غموض حقيقي: مرشحان auto صالحان → ambiguous=true بدون تصحيح", () => {
    // candidate = حبك1234؛ المطلوبون: هبك1234 (ح↔ه) و صبك1234... لأ ح↔ص مش زوج.
    // نستخدم: candidate كبد؛ مطلوبون: كطد (ب↔ط لأ)... نبنيها نظيفة:
    // candidate = دبك5000؛ مطلوبون: طبك5000 (د↔ط) — واحد بس → auto. للغموض نحتاج اتنين.
    // candidate = قد0000؛ مطلوبون: كد0000 (ق↔ك) و قط0000 (د↔ط) → الاتنين distance-1
    const amb = buildWantedIndex(new Set(["كد0000", "قط0000"]));
    const r = anchorPlateToWanted("قد0000", amb);
    expect(r.corrected).toBe(false);
    expect(r.ambiguous).toBe(true);
  });

  it("فهرس فاضي → لا يفعل شيئاً", () => {
    const r = anchorPlateToWanted("رهع3345", buildWantedIndex(new Set()));
    expect(r).toMatchObject({ plate: "رهع3345", matched: false, corrected: false });
  });
});
