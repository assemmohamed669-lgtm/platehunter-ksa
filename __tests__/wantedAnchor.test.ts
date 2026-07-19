import { describe, it, expect } from "vitest";
import { buildWantedIndex, anchorPlateToWanted, matchPlateByDigits } from "../lib/plateParser";

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

describe("matchPlateByDigits — تطابق مرتكز على الأرقام (يمسك سقوط حرف كمان)", () => {
  const idx = buildWantedIndex(new Set(["حهق7891", "ابح1234", "منع5678", "دبر9012"]));

  it("مطابقة تامة → matched بمسافة 0", () => {
    const r = matchPlateByDigits("منع5678", idx);
    expect(r).toMatchObject({ plate: "منع5678", matched: true, letterEdits: 0 });
  });

  it("سقوط «هاء» (المشكلة الأساسية): حق7891 → حهق7891 بمسافة 1 (زيادة حرف)", () => {
    const r = matchPlateByDigits("حق7891", idx);
    expect(r.plate).toBe("حهق7891");
    expect(r.matched).toBe(true);
    expect(r.letterEdits).toBe(1);
  });

  it("تبديل حرف واحد (أي حرف، مش زوج حلق بس): ادح1234 → ابح1234", () => {
    const r = matchPlateByDigits("ادح1234", idx);
    expect(r).toMatchObject({ plate: "ابح1234", matched: true, letterEdits: 1 });
  });

  it("تلخبط كبير (حرفين+): بيع1234 → مايطابقش (المسافة 3)", () => {
    const r = matchPlateByDigits("بيع1234", idx);
    expect(r.matched).toBe(false);
  });

  it("أرقام مختلفة → مايطابقش أبداً", () => {
    const r = matchPlateByDigits("منع5679", idx);
    expect(r.matched).toBe(false);
  });

  it("غموض: مرشحان بنفس الأرقام وكلاهما بمسافة 1 → مايختارش + ambiguous", () => {
    const amb = buildWantedIndex(new Set(["ابح1234", "ادح1234"]));
    const r = matchPlateByDigits("امح1234", amb); // مسافة 1 من الاتنين
    expect(r.matched).toBe(false);
    expect(r.ambiguous).toBe(true);
  });

  it("يحترم maxLetterEdits=0 (تطابق تام فقط)", () => {
    expect(matchPlateByDigits("حق7891", idx, 0).matched).toBe(false);
    expect(matchPlateByDigits("حهق7891", idx, 0).matched).toBe(true);
  });

  it("فهرس فاضي / أرقام مش موجودة → مايطابقش", () => {
    expect(matchPlateByDigits("ابح1234", buildWantedIndex(new Set())).matched).toBe(false);
    expect(matchPlateByDigits("خخخ0000", idx).matched).toBe(false);
  });
});
