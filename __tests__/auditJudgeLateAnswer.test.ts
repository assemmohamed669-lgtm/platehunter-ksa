/**
 * تدقيق مستقل لعيب «رد متأخّر» (Fix C) — محاكاة كاملة لآلة الحالة، لا اختبار
 * دالة لوحدها. بتعيد بناء مسار الرد في `requestSecondOpinion`
 * (`page.tsx:2380-2430`) بالحرف، وبتعدّ **الصفّارات** وحالة الكارت في تلات
 * سيناريوهات: صف اتمسح · صف المندوب عدّله · صف لسه موجود.
 *
 * الثابت اللي لازم يقوم في التلاتة: **صفّارة واحدة بالظبط لكل نبضة نهايتها
 * «مطلوبة»** — وصف مش موجود مالوش نبضة أصلاً ⇒ صفر.
 */

import { describe, it, expect } from "vitest";
import { decideJudgeAlertAction, canJudgeWriteAlert } from "@/lib/plateFusion";

interface Row { id: string; plate: string; found: boolean; seq: number }

/** الشيت: اللوحات «المطلوبة». */
const SHEET = new Set(["دبي1882", "رصي9076"]);

function makeWorld() {
  const rows = new Map<string, Row>();
  const rowIds = new Set<string>();        // = pttRowIdsRef
  const edited = new Set<string>();        // = pttEditedIdsRef
  let card: { rowId: string; seq: number; plate: string } | null = null;
  let sirens = 0;
  let seqCounter = 0;

  /** النطق: بيخلق الصف، وبيلفّ صفّارة + كارت لو مطلوب (نفس `addOnePttRow`). */
  function speak(id: string, plate: string): Row {
    const seq = ++seqCounter;
    const found = SHEET.has(plate);
    const row: Row = { id, plate, found, seq };
    rows.set(id, row);
    rowIds.add(id);                        // قبل أي إعادة رسم — نفس page.tsx:2176
    if (found) { sirens++; card = { rowId: id, seq, plate }; }
    return row;
  }

  function deleteRow(id: string) {
    rowIds.delete(id);                     // فوراً — نفس `deletePttRow`
    rows.delete(id);
    if (card?.rowId === id) card = null;
  }

  function editRow(id: string, plate: string) {
    edited.add(id);                        // قبل الكتابة — نفس `applyPttEdit`
    const r = rows.get(id);
    if (r) r.plate = plate;
  }

  /** الرد المتأخّر من الرأي التاني — نفس ترتيب page.tsx بالحرف. */
  function judgeReply(rowId: string, dgPlateNorm: string, fusedPlate: string, wasFound: boolean) {
    const changed = !!fusedPlate && fusedPlate !== dgPlateNorm;
    const re = changed
      ? { found: SHEET.has(fusedPlate), matchType: "exact" as const, similarity: undefined, row: {} }
      : null;
    const userEdited = edited.has(rowId);
    const rowAlive = rowIds.has(rowId);
    const patched = changed && !userEdited && !!re && rowAlive;

    // الـupdater: بيلفّ على الصفوف الموجودة بس (`prev.map`) — صف ممسوح مش فيها.
    const r = rows.get(rowId);
    if (r && patched && r.plate === dgPlateNorm && re) {
      r.plate = fusedPlate; r.found = re.found;
    }

    const action = decideJudgeAlertAction({
      patched, prevPlate: dgPlateNorm, nextPlate: fusedPlate,
      wasFound, nowFound: re?.found === true, rowAlive,
    });
    if (action === "fire" && re) {
      sirens++;                            // بره الحرس عن قصد (حدث الصف)
      const mine = { rowId, seq: rows.get(rowId)?.seq ?? 0 };
      if (canJudgeWriteAlert(card, mine)) card = { rowId, seq: mine.seq, plate: fusedPlate };
    } else if (action === "clear") {
      if (card?.rowId === rowId) card = null;
    } else if (action === "repoint") {
      if (card?.rowId === rowId) card = { ...card, plate: fusedPlate };
    }
    return action;
  }

  return {
    speak, deleteRow, editRow, judgeReply,
    get card() { return card; },
    get sirens() { return sirens; },
    get rows() { return rows; },
  };
}

describe("رد متأخّر لصف **اتمسح**", () => {
  it("ولا صفّارة ولا كارت ولا ترقيع — والصف فضل ممسوح", () => {
    const w = makeWorld();
    w.speak("r1", "دبه1882");                   // مش في الشيت ⇒ مافيش صفّارة
    expect(w.sirens).toBe(0);
    expect(w.card).toBeNull();
    w.deleteRow("r1");
    // الرد وصل بعد المسح، ولوحته المدمجة **مطلوبة** — ده بالظبط الطريق اللي كان
    // بيلفّ صفّارة + كارت لصف مش في القائمة.
    const act = w.judgeReply("r1", "دبه1882", "دبي1882", false);
    expect(act).toBe("none");
    expect(w.sirens).toBe(0);
    expect(w.card).toBeNull();
    expect(w.rows.has("r1")).toBe(false);
  });

  it("ومامسحش كارت صف تانٍ حيّ", () => {
    const w = makeWorld();
    w.speak("r1", "دبه1882");
    w.speak("r2", "رصي9076");                   // مطلوب ⇒ صفّارة + كارت
    expect(w.sirens).toBe(1);
    expect(w.card?.rowId).toBe("r2");
    w.deleteRow("r1");
    w.judgeReply("r1", "دبه1882", "دبي1882", false);
    expect(w.sirens).toBe(1);                   // ولا صفّارة زيادة
    expect(w.card?.rowId).toBe("r2");           // الكارت لسه على الصف الحيّ
  });

  it("مسح **جماعي** (deletePttSelected) نفس النتيجة", () => {
    const w = makeWorld();
    w.speak("r1", "دبه1882");
    w.deleteRow("r1");                          // نفس مسار الشيل من الريف
    expect(w.judgeReply("r1", "دبه1882", "دبي1882", false)).toBe("none");
    expect(w.sirens).toBe(0);
  });
});

describe("رد متأخّر لصف المندوب **عدّله**", () => {
  it("عين المندوب أعلى: مافيش ترقيع ولا صفّارة، واللوحة اللي عدّلها بتفضل", () => {
    const w = makeWorld();
    w.speak("r1", "دبه1882");
    w.editRow("r1", "دبك1882");
    const act = w.judgeReply("r1", "دبه1882", "دبي1882", false);
    expect(act).toBe("none");
    expect(w.sirens).toBe(0);
    expect(w.rows.get("r1")!.plate).toBe("دبك1882");   // مش لوحة الحَكَم
    expect(w.card).toBeNull();
  });

  it("وصف معدَّل **مطلوب** من النطق: الصفّارة اللي اتشغّلت وقت النطق مابتتكرّرش", () => {
    const w = makeWorld();
    w.speak("r1", "دبي1882");                   // مطلوب ⇒ صفّارة ١
    expect(w.sirens).toBe(1);
    w.editRow("r1", "دبي1883");
    w.judgeReply("r1", "دبي1882", "رصي9076", true);
    expect(w.sirens).toBe(1);                   // ولا صفّارة تانية
    expect(w.rows.get("r1")!.plate).toBe("دبي1883");
  });
});

describe("رد متأخّر لصف **لسه موجود** — الميزة لازم تشتغل", () => {
  it("F→T: صفّارة واحدة + كارت على اللوحة المدمجة", () => {
    const w = makeWorld();
    w.speak("r1", "دبه1882");
    expect(w.sirens).toBe(0);
    const act = w.judgeReply("r1", "دبه1882", "دبي1882", false);
    expect(act).toBe("fire");
    expect(w.sirens).toBe(1);                   // **واحدة بالظبط**
    expect(w.card).toEqual({ rowId: "r1", seq: 1, plate: "دبي1882" });
    expect(w.rows.get("r1")!.plate).toBe("دبي1882");
    expect(w.rows.get("r1")!.found).toBe(true);
  });

  it("T→F: الكارت بيتقفل، وصفر صفّارات زيادة", () => {
    const w = makeWorld();
    w.speak("r1", "دبي1882");
    expect(w.sirens).toBe(1);
    const act = w.judgeReply("r1", "دبي1882", "دبه1882", true);
    expect(act).toBe("clear");
    expect(w.sirens).toBe(1);
    expect(w.card).toBeNull();
  });

  it("T→T بلوحة مختلفة: repoint، وصفر صفّارات زيادة", () => {
    const w = makeWorld();
    w.speak("r1", "دبي1882");
    const act = w.judgeReply("r1", "دبي1882", "رصي9076", true);
    expect(act).toBe("repoint");
    expect(w.sirens).toBe(1);
    expect(w.card?.plate).toBe("رصي9076");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الحزامين **زايدين على بعض** — وده مقصود، بس لازم يتثبّت إن الاتنين موجودين
// =============================================================================
// شيل أي واحد لوحده والثابت يفضل قايم (`patched` فيها `rowAlive`، و
// `decideJudgeAlertAction` بيفحصها تاني). فالاختبار اللي بيحاكي الصفحة مش كافي
// لوحده كـ«بيفشل-لو-اتكسر»: لازم فحص مباشر إن الاتنين في الكود.
// ─────────────────────────────────────────────────────────────────────────────

describe("الحزامين الاتنين لازم يكونوا موجودين", () => {
  it("قبل الإصلاح (بلا `rowAlive` في الاتنين) الفعل كان `fire` — ده هو الباج", () => {
    // نفس دخل حالة «الصف اتمسح» بالظبط، بس بحساب ما-قبل-الإصلاح.
    const patchedPreFix = true;          // changed && !userEdited && !!re  (بلا rowAlive)
    expect(decideJudgeAlertAction({
      patched: patchedPreFix, prevPlate: "دبه1882", nextPlate: "دبي1882",
      wasFound: false, nowFound: true,   // rowAlive غايب = السلوك القديم
    })).toBe("fire");
  });

  it("الحزام ١: `patched` في الصفحة بتضمّ `rowAlive`", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("app/(app)/instant-check/page.tsx", "utf8");
    expect(src).toMatch(/const rowAlive = pttRowIdsRef\.current\.has\(rowId\)/);
    expect(src).toMatch(/const patched = changed && !userEdited && !!re && rowAlive/);
    // والشيل بيحدّث الريف **قبل** إعادة الرسم في المسارين
    expect(src).toMatch(/pttRowIdsRef\.current\.delete\(id\)/);
    expect(src).toMatch(/ids\.forEach\(\(i\) => pttRowIdsRef\.current\.delete\(i\)\)/);
  });

  it("الحزام ٢: `decideJudgeAlertAction` بيفحص `rowAlive` **أول** حاجة", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("lib/plateFusion.ts", "utf8");
    const body = src.slice(src.indexOf("export function decideJudgeAlertAction"));
    const first = body.split("\n").find((l) => l.includes("return"));
    expect(first).toMatch(/rowAlive === false/);
  });
});

describe("الثابت: صفّارة واحدة بالظبط لكل نبضة نهايتها «مطلوبة»", () => {
  it("على كل تباديل (اتمسح · اتعدّل · موجود) × (F→T · T→F · T→T)", () => {
    type Life = "alive" | "deleted" | "edited";
    const cases: Array<[Life, string, string, boolean, number]> = [
      // life, dgPlate, fusedPlate, wasFound, expected sirens TOTAL
      ["alive",   "دبه1882", "دبي1882", false, 1],   // نبضة واحدة ⇒ صفّارة واحدة
      ["deleted", "دبه1882", "دبي1882", false, 0],   // مافيش نبضة ⇒ صفر
      ["edited",  "دبه1882", "دبي1882", false, 0],
      ["alive",   "دبي1882", "دبه1882", true,  1],   // صفّارة النطق بس
      ["deleted", "دبي1882", "دبه1882", true,  1],
      ["edited",  "دبي1882", "دبه1882", true,  1],
      ["alive",   "دبي1882", "رصي9076", true,  1],
      ["deleted", "دبي1882", "رصي9076", true,  1],
      ["edited",  "دبي1882", "رصي9076", true,  1],
    ];
    for (const [life, dg, fused, wasFound, want] of cases) {
      const w = makeWorld();
      w.speak("r1", dg);
      if (life === "deleted") w.deleteRow("r1");
      if (life === "edited") w.editRow("r1", dg + "x");
      w.judgeReply("r1", dg, fused, wasFound);
      expect(w.sirens, `${life} ${dg}→${fused}`).toBe(want);
      // وكارت على صف ممسوح **ممنوع** في كل الحالات
      if (life === "deleted") expect(w.card).toBeNull();
    }
  });
});
