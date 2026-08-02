import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideJudgeAlertAction,
  canJudgeWriteAlert,
  type JudgeAlertAction,
} from "@/lib/plateFusion";

// ─────────────────────────────────────────────────────────────────────────────
// عيب ٣: كارت الإنذار بيتكتب فوقه **بالترتيب الغلط**
// =============================================================================
// في `requestSecondOpinion` تلات نداءات لـ`setPttAlert`. اتنين منهم محروسين
// بـ`a?.id === rowId` (`clear` و`repoint`)، والتالت — فرع **`fire`** — كان
// `setPttAlert({ ...baseRow, … })` **بلا أي حرس**. بسقف ١ للطلبات كان ده مستحيل
// يضرّ (رد واحد في المرة)؛ بعد ما السقف بقى ٢ + طابور ٢ بقى فيه ردّين في الهوا،
// فرد **متأخّر** للصف A يقدر يمسح كارت **أحدث** للصف B.
// وده قابل للوصول فعلاً: ٥ من ٢٤ زوج صفوف متتابعة في جلسة المالك بينهم
// ١٫٥٦–٢٫٣٩ث (أقل من دورته ٢٫٩٨ث) ⇒ الردّين بيتقاطعوا.
//
// الثابت اللي لازم يفضل قايم (وهو نفسه اللي `decideJudgeAlertAction` بيحميه):
//   ١. **صفّارة واحدة بالظبط** لكل نبضة نهايتها «مطلوبة» — لا صفر ولا اتنين.
//      الصفّارة مستقلة عن الكارت: هي حدث الصف نفسه، فمافيش ترتيب بيلغيها.
//   ٢. الكارت عمره ما يعرض حاجة تخالف `row.found` بتاع الصف اللي هو عليه.
// ─────────────────────────────────────────────────────────────────────────────

describe("canJudgeWriteAlert — الأحدث يكسب، والأقدم مايمسحش", () => {
  it("مافيش كارت مفتوح ⇒ اكتب", () => {
    expect(canJudgeWriteAlert(null, { rowId: "A", seq: 1 })).toBe(true);
  });

  it("الكارت على **نفس** الصف ⇒ اكتب (ترقيع لوحته)", () => {
    expect(canJudgeWriteAlert({ rowId: "A", seq: 7 }, { rowId: "A", seq: 7 })).toBe(true);
  });

  it("رد متأخّر لصف **أقدم** مايمسحش كارت صف أحدث — الباج نفسه", () => {
    expect(canJudgeWriteAlert({ rowId: "B", seq: 9 }, { rowId: "A", seq: 8 })).toBe(false);
  });

  it("رد لصف **أحدث** بيكسب الكارت (نفس سلوك النطق: الأحدث يفوز)", () => {
    expect(canJudgeWriteAlert({ rowId: "A", seq: 8 }, { rowId: "B", seq: 9 })).toBe(true);
  });

  it("تعادل التسلسل بين صفّين مختلفين = **ماتكتبش** (فشل مغلق)", () => {
    expect(canJudgeWriteAlert({ rowId: "B", seq: 5 }, { rowId: "A", seq: 5 })).toBe(false);
  });

  it("تسلسل بايظ = ماتكتبش على كارت صف تاني", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canJudgeWriteAlert({ rowId: "B", seq: NaN } as any, { rowId: "A", seq: 3 })).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canJudgeWriteAlert({ rowId: "B", seq: 3 }, { rowId: "A", seq: NaN } as any)).toBe(false);
    // بس صفّه هو دايماً مسموح — الترقيع لازم يوصل للكارت اللي عليه.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canJudgeWriteAlert({ rowId: "A", seq: NaN } as any, { rowId: "A", seq: NaN } as any))
      .toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ردّين في الهوا: محاكاة كاملة لآلة الحالة (الصفّارة + الكارت)
// =============================================================================
type Row = { id: string; seq: number; plate: string; found: boolean };

/** محاكي مصغّر لنفس الترتيب اللي في الصفحة: نطق ← ردّين بترتيب اختياري. */
function runSession(order: Array<"A" | "B">, rows: { A: Row; B: Row },
  patch: Record<"A" | "B", { nextPlate: string; nowFound: boolean }>) {
  let card: { rowId: string; seq: number; plate: string; found: boolean } | null = null;
  let sirens = 0;
  const acted: Record<string, JudgeAlertAction> = {};
  const rowState: Record<string, Row> = { A: { ...rows.A }, B: { ...rows.B } };

  // ── وقت النطق: كل صف مطلوب بيلفّ صفّارة ويفتح الكارت (الأحدث يكسب) ──
  for (const k of ["A", "B"] as const) {
    if (rowState[k].found) {
      sirens++;
      card = { rowId: rowState[k].id, seq: rowState[k].seq, plate: rowState[k].plate, found: true };
    }
  }

  // ── وقت الردود (بأي ترتيب) ──
  for (const k of order) {
    const r = rowState[k];
    const p = patch[k];
    const action = decideJudgeAlertAction({
      patched: true, prevPlate: r.plate, nextPlate: p.nextPlate,
      wasFound: r.found, nowFound: p.nowFound,
    });
    acted[k] = action;
    // الصف نفسه بيتحدّث دايماً (`setPttResults` بيمشي على `r.id`).
    rowState[k] = { ...r, plate: p.nextPlate, found: p.nowFound };
    if (action === "fire") {
      sirens++;                                   // حدث الصف — مستقل عن الكارت
      if (canJudgeWriteAlert(card, { rowId: r.id, seq: r.seq })) {
        card = { rowId: r.id, seq: r.seq, plate: p.nextPlate, found: true };
      }
    } else if (action === "clear") {
      if (card?.rowId === r.id) card = null;
    } else if (action === "repoint") {
      if (card?.rowId === r.id) card = { ...card, plate: p.nextPlate, found: true };
    }
  }
  return { card, sirens, acted, rowState };
}

const A: Row = { id: "A", seq: 8, plate: "دبر1234", found: false };
const B: Row = { id: "B", seq: 9, plate: "كهط5251", found: false };

describe("ردّين في الهوا — صفّارة واحدة لكل نبضة، والكارت مايكدبش", () => {
  it("A و B الاتنين قلبوا «مطلوبة»: صفّارتين (نبضتين) والكارت على **B** الأحدث", () => {
    for (const order of [["A", "B"], ["B", "A"]] as Array<Array<"A" | "B">>) {
      const r = runSession(order, { A, B }, {
        A: { nextPlate: "دبر1235", nowFound: true },
        B: { nextPlate: "كهط5252", nowFound: true },
      });
      expect(r.sirens, order.join(">")).toBe(2);          // نبضة = صفّارة، مرة واحدة
      expect(r.card?.rowId, order.join(">")).toBe("B");   // الأحدث يكسب دايماً
      expect(r.card?.plate, order.join(">")).toBe("كهط5252");
      // والكارت متسق مع صفّه.
      expect(r.card?.found).toBe(r.rowState.B.found);
      expect(r.card?.plate).toBe(r.rowState.B.plate);
    }
  });

  it("الباج: رد A المتأخّر كان بيمسح كارت B — دلوقتي لأ", () => {
    const r = runSession(["B", "A"], { A, B }, {
      A: { nextPlate: "دبر1235", nowFound: true },
      B: { nextPlate: "كهط5252", nowFound: true },
    });
    expect(r.card?.rowId).toBe("B");
    expect(r.card?.plate).not.toBe("دبر1235");
  });

  it("B بقى غير مطلوب و A بقى مطلوب: الكارت بيروح لـA، وصفّارة واحدة بس", () => {
    const r = runSession(["A", "B"], { A, B: { ...B, found: true } }, {
      A: { nextPlate: "دبر1235", nowFound: true },
      B: { nextPlate: "كهط5252", nowFound: false },
    });
    expect(r.acted.A).toBe("fire");
    expect(r.acted.B).toBe("clear");
    // النطق لفّ صفّارة واحدة (لـB)، و A لفّ واحدة لما قلب ⇒ اتنين، كل نبضة مرة.
    expect(r.sirens).toBe(2);
    // الكارت اتكتب لـA (أحدث من B؟ لأ — A أقدم) ⇒ B كان لسه على الكارت وقتها
    // فـA مااكتبش؛ وبعدين B عمل clear. النتيجة: مافيش كارت **كاذب**.
    expect(r.card).toBe(null);
  });

  it("صفّارة واحدة بالظبط لكل نبضة نهايتها «مطلوبة» — عمرها ما تبقى صفر", () => {
    // A مطلوب من النطق (`wasFound`) و بعد الترقيع لسه مطلوب ⇒ `repoint`، مافيش
    // صفّارة تانية. B مش مطلوب من النطق وقلب ⇒ `fire`، صفّارة واحدة.
    const r = runSession(["A", "B"], { A: { ...A, found: true }, B }, {
      A: { nextPlate: "دبر1235", nowFound: true },
      B: { nextPlate: "كهط5252", nowFound: true },
    });
    expect(r.acted.A).toBe("repoint");
    expect(r.acted.B).toBe("fire");
    expect(r.sirens).toBe(2);                    // نبضة A (نطق) + نبضة B (ترقيع)
    expect(r.card?.rowId).toBe("B");
  });

  it("مافيش نبضة نهايتها «مطلوبة» ⇒ صفر صفّارات وصفر كارت", () => {
    const r = runSession(["A", "B"], { A, B }, {
      A: { nextPlate: "دبر1235", nowFound: false },
      B: { nextPlate: "كهط5252", nowFound: false },
    });
    expect(r.sirens).toBe(0);
    expect(r.card).toBe(null);
    expect(Object.values(r.acted)).toEqual(["none", "none"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// حرس على الكود نفسه: أي `setPttAlert` جوّه مسار الحَكَم لازم يكون محروس
// =============================================================================
// الاختبار ده بيقرا الصفحة كنص عن قصد. الفرع اللي وقع كان **سطر واحد** بلا حرس
// جنب سطرين محروسين، والمراجعة العادية عدّت عليه. الحرس النصّي بيمنع رجوعه.
// ─────────────────────────────────────────────────────────────────────────────
describe("مسار الحَكَم في الصفحة — كل setPttAlert محروس", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8");

  /** جسم `requestSecondOpinion` — من تعريفها لبداية الدالة اللي بعدها. */
  function judgeBody(): string {
    const start = src.indexOf("async function requestSecondOpinion(");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("function drainJudgeQueue(", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("كل `setPttAlert` في مسار الحَكَم بياخد **دالة تحديث**، مش قيمة جاهزة", () => {
    const body = judgeBody();
    const calls = body.match(/setPttAlert\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // `setPttAlert({` = كتابة غير مشروطة = الباج. الشكل الوحيد المسموح
    // `setPttAlert((a) => …)` عشان القرار يتاخد على الحالة الحيّة.
    expect(body).not.toMatch(/setPttAlert\(\s*\{/);
    const guarded = body.match(/setPttAlert\(\s*\(a\)\s*=>/g) ?? [];
    expect(guarded.length).toBe(calls.length);
  });

  it("فرع `fire` بينادي `canJudgeWriteAlert` — مش بيكتب على عمي", () => {
    const body = judgeBody();
    expect(body).toContain("canJudgeWriteAlert");
    // والصفّارة نفسها **بره** الحرس: نبضة قلبت «مطلوبة» لازم تسمع، أياً كان
    // الكارت المعروض.
    const fireAt = body.indexOf("fireWantedAlert({");
    const writeAt = body.indexOf("canJudgeWriteAlert");
    expect(fireAt).toBeGreaterThan(0);
    expect(writeAt).toBeGreaterThan(fireAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// عيب ٥: رد متأخّر لصف **اتمسح** لسه بيلفّ صفّارة ويفتح كارت لصف مش موجود
// =============================================================================
// `patched = changed && !userEdited && !!re` — مافيش فيها أي فحص إن الصف لسه
// موجود. `setPttResults(prev.map(…))` مالقيهوش فمابيعملش حاجة (كله تمام)، بس
// `patched` بتفضل `true` ⇒ `decideJudgeAlertAction` بترجّع `fire` ⇒
// `fireWantedAlert` بتلف، و`canJudgeWriteAlert(null, …)` بترجّع `true` (مافيش
// كارت لأن `deletePttRow` قفله) ⇒ **كارت «مطلوبة» لصف مش في القائمة**.
// و`deletePttRow` مابيلغيش أي رد في الطريق، فالحالة دي قابلة للوصول: زمن الرد
// المقيس ٤١٠–٢٣٠٢ms، والمالك بيمسح صف بضغطة.
//
// القرار: الصف اللي مش موجود = **مافيش أي فعل** — لا صفّارة ولا كارت ولا ترقيع.
// وثابت «صفّارة واحدة لكل نبضة» بيفضل قايم: صف اتمسح مالوش نبضة مستنية أصلاً.
// ─────────────────────────────────────────────────────────────────────────────
describe("صف اتمسح والرد في الطريق — ولا صفّارة ولا كارت", () => {
  const tr = (o: Partial<Parameters<typeof decideJudgeAlertAction>[0]>) => ({
    patched: true, prevPlate: "دبر1234", nextPlate: "كهط5251",
    wasFound: false, nowFound: true, ...o,
  });

  it("`rowAlive: false` بيلغي **كل** الأفعال الأربعة", () => {
    for (const [wasFound, nowFound] of [[false, true], [true, false], [true, true], [false, false]]) {
      expect(decideJudgeAlertAction(tr({ rowAlive: false, wasFound, nowFound })))
        .toBe("none");
    }
  });

  it("ونفس الدخل بصف **موجود** بيرجّع الفعل الحقيقي (الفحص مش بيلغي الميزة)", () => {
    expect(decideJudgeAlertAction(tr({ rowAlive: true }))).toBe("fire");
    expect(decideJudgeAlertAction(tr({ rowAlive: true, wasFound: true, nowFound: false })))
      .toBe("clear");
  });

  it("الحقل غايب = السلوك القديم بالحرف (توافق للخلف)", () => {
    expect(decideJudgeAlertAction(tr({}))).toBe("fire");
  });

  it("الصفحة بتشتق «الصف لسه موجود» وبتضمّها في `patched` وفي قرار الإنذار", () => {
    const src = readFileSync(
      join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8");
    // ريف بأيدي الصفوف الحيّة + شيل فوري عند المسح (مش مستنيين إعادة رسم).
    expect(src).toMatch(/pttRowIdsRef/);
    expect(src).toMatch(/function deletePttRow[\s\S]{0,220}pttRowIdsRef\.current\.delete\(id\)/);
    // و`patched` نفسها مشروطة بوجود الصف.
    expect(src).toMatch(/const patched = changed && !userEdited && !!re && rowAlive/);
    expect(src).toMatch(/rowAlive,/);
  });
});
