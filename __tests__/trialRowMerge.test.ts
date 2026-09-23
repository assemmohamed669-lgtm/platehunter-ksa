import { describe, it, expect } from "vitest";
import { mergeTwinRow, type MergeRow } from "../lib/trialRowMerge";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «لما بختار النوع أو الملاحظة يدوي مش بتظهر»
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٣ سبتمبر ٢٠٢٦).
 *
 *  🔴 **السبب**: لما الإجماع يأكّد لوحة أو يحدّثها — وده بيحصل في أول
 *  ثانيتين-تلاتة بعد ما تظهر، **بالظبط** الوقت اللي المندوب بيختار فيه
 *  النوع — الصف كان بيتدمج كـ`{ ...fresh }`، يعني **`id` جديد**:
 *    · React بيشيل الصف القديم ويحط جديد ⇒ المنسدلة المفتوحة بتتقفل
 *      تحت إيد المندوب
 *    · واختياره بيروح لـ`saveCell(idالقديم)` ⇒ مالقاش الصف ⇒ **ضاع في صمت**
 *
 *  ⇒ ومن نفس السطر مشكلتين تانيين كانوا مستخبيين:
 *    · تصحيح اللوحة بإيد المندوب كان بيتكتب فوقيه بقراءة الموديل
 *    · لو كوهير رجع، تخمينه كان هيغلب اختيار المندوب
 *
 *  القاعدة: **الصف بيحافظ على هويته، وتعديل المندوب بيغلب أي حاجة من
 *  الموديل.**
 */
const row = (over: Partial<MergeRow> = {}): MergeRow => ({
  id: "A", plate: "أبح1234", type: null, note: null, match: null,
  shownAt: 1000, latencyMs: 3000, ...over,
});

describe("mergeTwinRow — هوية الصف", () => {
  it("🔴 **الـid بتاع الصف القديم يفضل** — ده اللي كان بيضيّع الاختيار", () => {
    const out = mergeTwinRow(row({ id: "B", shownAt: 2000 }), row({ id: "A" }));
    expect(out.id).toBe("A");
  });

  it("زمن الظهور = أول مرة المندوب شافها", () => {
    const out = mergeTwinRow(row({ id: "B", shownAt: 2000, latencyMs: 5000 }),
                             row({ id: "A", shownAt: 1000, latencyMs: 3000 }));
    expect(out.shownAt).toBe(1000);
    expect(out.latencyMs).toBe(3000);
  });
});

describe("mergeTwinRow — 🔴 تعديل المندوب بيغلب", () => {
  it("اختار نوع بإيده ⇒ يفضل حتى لو الموديل جاب نوع تاني", () => {
    const twin = row({ type: "و", edited: { type: true } });
    const out = mergeTwinRow(row({ id: "B", type: "ف" }), twin);
    expect(out.type).toBe("و");
  });

  it("اختار ملاحظة بإيده ⇒ تفضل", () => {
    const twin = row({ note: "مصدومه", edited: { note: true } });
    const out = mergeTwinRow(row({ id: "B", note: "جراج" }), twin);
    expect(out.note).toBe("مصدومه");
  });

  it("🔴 صحّح اللوحة بإيده ⇒ التصحيح يفضل ومطابقتها معاه", () => {
    const hit = { "اللوحة": "أبح1235" };
    const twin = row({ plate: "أبح1235", match: hit, edited: { plate: true } });
    const out = mergeTwinRow(row({ id: "B", plate: "أبح1234", match: null }), twin);
    expect(out.plate).toBe("أبح1235");
    expect(out.match).toBe(hit);
  });

  it("علامة التعديل بتتنقل مع الصف — عشان الدمج الجاي يحترمها", () => {
    const twin = row({ type: "و", edited: { type: true } });
    const out = mergeTwinRow(row({ id: "B" }), twin);
    expect(out.edited?.type).toBe(true);
  });
});

describe("mergeTwinRow — من غير تعديل يدوي: السلوك القديم", () => {
  it("الموديل جاب نوع والمندوب ماختارش ⇒ نوع الموديل", () => {
    const out = mergeTwinRow(row({ id: "B", type: "ف" }), row({ type: null }));
    expect(out.type).toBe("ف");
  });

  it("الموديل مجابش والقديم عنده ⇒ القديم يفضل", () => {
    const out = mergeTwinRow(row({ id: "B", type: null }), row({ type: "و" }));
    expect(out.type).toBe("و");
  });

  it("اللوحة من القراءة الجديدة (شافت النطق كامل)", () => {
    const out = mergeTwinRow(row({ id: "B", plate: "أبح1234" }), row({ plate: "أبح1284" }));
    expect(out.plate).toBe("أبح1234");
  });

  it("المطابقة: الجديدة لو فيه، وإلا القديمة", () => {
    const hit = { a: "b" };
    expect(mergeTwinRow(row({ id: "B", match: null }), row({ match: hit })).match).toBe(hit);
  });
});
