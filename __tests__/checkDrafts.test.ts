/**
 * قوايم التشييك اللي لسه ما اتصدّرتش (يدوي/كاميرا/صوت) **مايصحّش تضيع**.
 * «المندوب يخسر شغله دي مفيهاش تسامح».
 *
 * كانت متخزّنة في localStorage بس — وده بيتمسح من الـWebView أحياناً (حصلت
 * قبل كده). بقت في IndexedDB (اللي عليه storage.persist) وlocalStorage مرآة.
 */
import { describe, it, expect } from "vitest";
import { pickDraft, unexportedDeleteWarning } from "@/lib/checkDrafts";

describe("pickDraft — مين المصدر", () => {
  it("أول مرة بعد التحديث: بياخد اللي في localStorage (ترحيل)", () => {
    expect(pickDraft(null, false, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("بعد الترحيل: IndexedDB هو المصدر", () => {
    expect(pickDraft([9], true, [1, 2, 3])).toEqual([9]);
  });

  it("**الأهم**: قائمة فاضية بعد التصدير مابترجعش من localStorage", () => {
    // لو رجّعناها، اللوحات اللي اتصدّرت بتظهر تاني وتتصدّر مرتين.
    expect(pickDraft([], true, [1, 2, 3])).toEqual([]);
  });

  it("مافيش ولا واحدة = فاضية", () => {
    expect(pickDraft(null, false, null)).toEqual([]);
    expect(pickDraft(null, true, null)).toEqual([]);
  });

  it("localStorage بايظة مابتكسرش", () => {
    expect(pickDraft(null, false, undefined as unknown as number[])).toEqual([]);
  });
});

describe("unexportedDeleteWarning — تحذير قبل مسح لوحات مش متصدّرة", () => {
  it("مفيش لوحات غير متصدّرة → مفيش تحذير", () => {
    expect(unexportedDeleteWarning(0)).toBeNull();
  });

  it("فيه لوحات غير متصدّرة → تحذير بالعدد", () => {
    const w = unexportedDeleteWarning(3);
    expect(w).toContain("3");
    expect(w).toContain("مش متصدّرة");
  });

  it("التحذير بيقول للمندوب إن «لا» هترجّعه يصدّرها", () => {
    expect(unexportedDeleteWarning(1)).toContain("تصدير");
  });

  it("واحدة مفردة", () => {
    expect(unexportedDeleteWarning(1)).toContain("1");
  });
});

describe("طابور الكتابة — الترتيب مضمون", () => {
  it("كتابتين ورا بعض بينزلوا بالترتيب، والأخيرة هي اللي تفضل", async () => {
    // من غير الطابور، كل نداء بيفتح اتصال IDB لوحده والترتيب مش مضمون —
    // فكتابة قديمة ممكن تنزل بعد الجديدة وترجّع لوحات اتصدّرت.
    const { saveDraft, loadDraft } = await import("@/lib/checkDrafts");
    await Promise.all([
      saveDraft("manual", "t-manual", [{ id: "a" }]),
      saveDraft("manual", "t-manual", [{ id: "a" }, { id: "b" }]),
      saveDraft("manual", "t-manual", []),
    ]);
    expect(await loadDraft("manual", "t-manual")).toEqual([]);
  });
})
