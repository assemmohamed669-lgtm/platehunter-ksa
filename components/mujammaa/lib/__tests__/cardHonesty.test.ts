/**
 * ══════════════════════════════════════════════════════════════════════
 *  صدق الكارت — الشريحة تقول الحقيقة عن اللوحة المعروضة
 * ══════════════════════════════════════════════════════════════════════
 *
 *  🔴 **البقّان اللي المالك شافهم بعينه (٢١ أغسطس ٢٠٢٦).**
 *
 *  **بق ١ — الكارت بيقول «شكلها غلط» على لوحة صح.** صورة من جهازه:
 *
 *      د ب ر 2521   [شكلها غلط]
 *        • **شكل سليم: ٣ حروف معتمدة + ٤ أرقام**
 *        • ملاحظة: د
 *        • موديلنا كسب
 *
 *  الملاحظة بتقول «شكل سليم» والشريحة بتقول «شكلها غلط» — **على نفس
 *  الكارت**. السبب: `stageOf` كانت بتدمج سببين في كلمة واحدة:
 *
 *      if (!shapeOk || uncertain) return "shaky";   // «شكلها غلط»
 *
 *  و`uncertain` معناها «المحلّل حشّى الناقص» — مش «الشكل غلط». وفي كل
 *  الحالات اللي في صورته الشاهد سمع **شظية** (`0000` · `د` · `٥`)، المحلّل
 *  حشّاها، الراية اترفعت، وبعدين **موديلنا كسب بلوحة كاملة** — والراية
 *  فضلت. فالشريحة بتوصف نصّ **مش معروض**.
 *
 *  **بق ٢ — الكارت بيفضل «بتتراجع…» للأبد.** لما المراجعة تتخطّى (اللوحة
 *  اتقسمت بين رسالتين · الطابور ملآن · مافيش توقيت)، السبب بيتعدّ في
 *  التقرير — **بس الكارت مايعرفش**، فبيفضل «بتتراجع…» وهو مش بيتراجع.
 *
 *  ⚠️ **والراية نفسها لازم تفضل موجودة.** موجودة عشان تمنع رقم مخترع يطلع
 *  «مؤكّدة ✓». مقيس على ٢٠٠ مقطع بلا لوحة: «تمانية واحد» → `0081` ·
 *  «يوم أربعة سبعة» → `يوم0047`. فالإصلاح **ضيّق**: تتطفي بس لما اللوحة
 *  المعروضة جاية من موديلنا **كاملة وبلا حشو**.
 */
import { describe, it, expect } from "vitest";
import {
  stageOf,
  stageLabel,
  stageTitle,
  paddingStillApplies,
  judgeSkipLabel,
} from "../plateEntry";

describe("stageOf — سببين مختلفين، مش كلمة واحدة", () => {
  it("🔴 الشكل الغلط ⇒ shaky", () => {
    expect(stageOf({ agreed: true, shapeOk: false })).toBe("shaky");
  });

  it("⭐ الحشو ⇒ padded — **مش** shaky", () => {
    // ده اللي كان بيطلع «شكلها غلط» على لوحة شكلها سليم
    expect(stageOf({ agreed: true, shapeOk: true, uncertain: true })).toBe("padded");
  });

  it("الاتنين مع بعض ⇒ الشكل يغلب (أقطع)", () => {
    expect(stageOf({ agreed: true, shapeOk: false, uncertain: true })).toBe("shaky");
  });

  it("سليمة ومتفق عليها ⇒ agreed", () => {
    expect(stageOf({ agreed: true, shapeOk: true })).toBe("agreed");
  });

  it("سليمة ومختلف عليها ⇒ conflict", () => {
    expect(stageOf({ agreed: false, shapeOk: true })).toBe("conflict");
  });

  it("تعديل المندوب يغلب كل حاجة", () => {
    expect(stageOf({ agreed: false, shapeOk: false, uncertain: true, manuallyEdited: true }))
      .toBe("edited");
  });
});

describe("stageLabel — كل حالة باسمها الصح", () => {
  it("🔴 padded مابيقولش «شكلها غلط»", () => {
    const label = stageLabel("padded");
    expect(label).not.toContain("شكلها غلط");
    expect(label).toMatch(/حشو|ناقص/);
  });

  it("shaky لسه «شكلها غلط»", () => {
    expect(stageLabel("shaky")).toContain("شكلها غلط");
  });

  it("⭐ unreviewed مابيقولش «بتتراجع» — دي كانت بتكدب", () => {
    const label = stageLabel("unreviewed");
    expect(label).not.toContain("بتتراجع");
    expect(label.length).toBeGreaterThan(3);
  });

  it("heard لسه «بتتراجع…» — دي صح وقتها", () => {
    expect(stageLabel("heard")).toContain("بتتراجع");
  });

  it("🔴 conflict مابيقولش «راجعها» الآمرة — دي كانت بتبان غلط للمالك", () => {
    // conflict = المحرّكان اختلفوا وأخدنا الأقوى — غالباً صح، مش غلط.
    // «راجعها» كانت بتوحي إنها غلط لازم يصلّحها. بقت «نظرة» — تلميح هادي.
    const label = stageLabel("conflict");
    expect(label).toContain("نظرة");
    // مايكونش فيه أي إيحاء بالخطأ
    expect(label).not.toContain("غلط");
  });
});

describe("stageTitle — التلميح مايكدبش هو كمان", () => {
  it("🔴 padded مايقولش «شكلها مش ٣ حروف + ٤ أرقام»", () => {
    // ده كان تلميح **أي** حالة جديدة، لأن الافتراضي كان بيقوله
    expect(stageTitle("padded")).not.toContain("٣ حروف");
    expect(stageTitle("padded")).toMatch(/ناقص|كمّلناه/);
  });

  it("🔴 unreviewed مايقولش إنه بيراجع", () => {
    expect(stageTitle("unreviewed")).toMatch(/ماراجعهاش|الملاحظات/);
    expect(stageTitle("unreviewed")).not.toContain("لسه بيراجع");
  });

  it("shaky لسه بيقول سبب الشكل", () => {
    expect(stageTitle("shaky")).toContain("٣ حروف");
  });

  it("كل الحالات ليها تلميح مختلف — مافيش اتنين بنفس النص", () => {
    const stages = ["agreed", "heard", "conflict", "edited", "padded", "unreviewed", "shaky"] as const;
    const titles = stages.map((x) => stageTitle(x));
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("paddingStillApplies — الراية توصف اللي معروض", () => {
  it("مافيش حشو من الأصل ⇒ false", () => {
    expect(paddingStillApplies({
      finalPlate: "ابح1234", oursPlate: "ابح1234", parserPadded: false,
    })).toBe(false);
  });

  it("⭐ الحالة بالظبط: الشاهد شظية · موديلنا كسب بلوحة كاملة ⇒ الراية تتطفي", () => {
    // د ب ر 2521 — الشاهد سمع «د» بس، وموديلنا قرا اللوحة كاملة
    expect(paddingStillApplies({
      finalPlate: "دبر2521", oursPlate: "دبر2521", parserPadded: true,
    })).toBe(false);
  });

  it("🔴 المعروض **مش** قراءة موديلنا ⇒ الراية تفضل", () => {
    // النهائي جاي من الشظية المحشية — الحشو لسه في اللي معروض
    expect(paddingStillApplies({
      finalPlate: "دبب0000", oursPlate: "دبر2521", parserPadded: true,
    })).toBe(true);
  });

  it("🔴 موديلنا نفسه قراءته ناقصة ⇒ الراية تفضل", () => {
    // مايصحّش نطفّي الراية لو اللي كسب مش لوحة كاملة
    expect(paddingStillApplies({
      finalPlate: "دبر", oursPlate: "دبر", parserPadded: true,
    })).toBe(true);
  });

  it("🔴 مافيش قراءة من موديلنا خالص ⇒ الراية تفضل", () => {
    expect(paddingStillApplies({
      finalPlate: "دبب0000", oursPlate: null, parserPadded: true,
    })).toBe(true);
  });

  it("الأرقام أقل من ٤ ⇒ الراية تفضل", () => {
    expect(paddingStillApplies({
      finalPlate: "دبر252", oursPlate: "دبر252", parserPadded: true,
    })).toBe(true);
  });

  it("⚠️ بيطبّع قبل المقارنة — الفراغ والألف مايكسروش الإصلاح", () => {
    expect(paddingStillApplies({
      finalPlate: "أبح1234", oursPlate: "ابح 1234", parserPadded: true,
    })).toBe(false);
  });
});

describe("judgeSkipLabel — السبب بالعربي للمندوب", () => {
  it("⭐ اللوحة المقسومة بين رسالتين", () => {
    const s = judgeSkipLabel("carried_over");
    expect(s).toMatch(/رسالتين|اتقسمت|متصل/);
  });

  it("الطابور ملآن", () => {
    expect(judgeSkipLabel("busy")).toMatch(/مشغول|زحمة|طابور/);
  });

  it("رسالة فيها أكتر من لوحة", () => {
    expect(judgeSkipLabel("multi_plate_message")).toMatch(/لوحة|رسالة/);
  });

  it("سبب مجهول ⇒ نص مفيد فيه السبب الخام، مش فاضي", () => {
    const s = judgeSkipLabel("something_totally_new");
    expect(s.length).toBeGreaterThan(3);
    expect(s).toContain("something_totally_new");
  });

  it("كل الأسباب المعروفة ليها نص عربي — مافيش واحد بيرجع الكود الخام", () => {
    const known = [
      "not_configured", "no_timing", "stale_stream", "window_unproven",
      "busy", "queue_full", "no_audio", "prefix_too_large",
      "multi_plate_message", "carried_over", "split_too_long", "window_after_audio",
    ];
    for (const r of known) {
      expect(judgeSkipLabel(r), `السبب ${r}`).not.toContain(r);
    }
  });
});
