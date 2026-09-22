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

describe("تقليل الكتابة — الكتابة كانت O(N²)", () => {
  /**
   * #247 خلّى كل تغيير في القائمة يكتب **القائمة كلها** في IndexedDB. اللوحة
   * الواحدة بتعمل ٣-٤ تغييرات (الصف + الموقع + النوع + الشيل)، يعني مندوب
   * بـ١٥٠ لوحة بيكتب ميجابايتات في الجلسة الواحدة. والحصّة في المتصفّح **لكل
   * أصل مش لكل قاعدة** — فلما تمتلئ، **كل** كتابة في **كل** قاعدة بتفشل،
   * وده بالظبط شكل «تعذّر حفظ أي لوحة».
   */
  it("رشقة تغييرات بتتكتب مرة واحدة مش خمسة", async () => {
    const { saveDraft, __writeCountForTest } = await import("@/lib/checkDrafts");
    const before = __writeCountForTest();
    for (let i = 1; i <= 5; i++) void saveDraft("ptt", "t-burst", Array.from({ length: i }, (_, k) => ({ id: `p${k}` })));
    await new Promise((r) => setTimeout(r, 400));
    const writes = __writeCountForTest() - before;
    expect(writes).toBeLessThanOrEqual(2);   // مش ٥
  });

  it("وآخر قيمة هي اللي بتتحفظ", async () => {
    const { saveDraft, loadDraft } = await import("@/lib/checkDrafts");
    for (let i = 1; i <= 4; i++) void saveDraft("manual", "t-last", Array.from({ length: i }, (_, k) => ({ id: `m${k}` })));
    await new Promise((r) => setTimeout(r, 400));
    expect(await loadDraft("manual", "t-last")).toHaveLength(4);
  });
});

describe("الحفظ في ذاكرة المتصفّح فوري — مش مؤجّل", () => {
  it("القيمة موجودة **قبل** ما مؤقّت التجميع يعدّي", async () => {
    // لو أجّلناها، قفلة مفاجئة للتطبيق في الـ٣٠٠ مللي دي بتضيّع آخر لوحة.
    const { saveDraft } = await import("@/lib/checkDrafts");
    void saveDraft("ptt", "t-immediate", [{ id: "زي" }, { id: "كده" }]);
    const raw = localStorage.getItem("t-immediate");        // بلا أي انتظار
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toHaveLength(2);
  });

  it("وكل تغيير بيحدّثها فوراً حتى لو الرشقة لسه بتتجمّع", async () => {
    const { saveDraft } = await import("@/lib/checkDrafts");
    void saveDraft("ptt", "t-immediate2", [{ id: "1" }]);
    void saveDraft("ptt", "t-immediate2", [{ id: "1" }, { id: "2" }]);
    void saveDraft("ptt", "t-immediate2", [{ id: "1" }, { id: "2" }, { id: "3" }]);
    expect(JSON.parse(localStorage.getItem("t-immediate2") as string)).toHaveLength(3);
  });
});
