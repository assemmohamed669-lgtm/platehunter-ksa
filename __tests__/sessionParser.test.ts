import { describe, it, expect } from "vitest";
import { newSessionState, parseSessionChunk, type SessionRecord } from "../lib/sessionParser";

// ── Helpers ──────────────────────────────────────────────────────────────────
// يشغّل النص كله كدفعة واحدة نهائية (زي وقفة التسجيل في المسارين Native/Web).
function batch(text: string): SessionRecord[] {
  return parseSessionChunk(text, newSessionState(), { final: true }).records;
}

// يشغّل عدة chunks بالتتابع (زي مسار Groq الحي) ويجمع السجلات بالترتيب.
function streamed(chunks: string[]): SessionRecord[] {
  let state = newSessionState();
  const out: SessionRecord[] = [];
  chunks.forEach((c, i) => {
    const res = parseSessionChunk(c, state, { final: i === chunks.length - 1 });
    out.push(...res.records);
    state = res.state;
  });
  return out;
}

// ── سيناريو المستخدم الحرفي (من وثيقة الطلب) ────────────────────────────────
// حاء باء كاف ٥٨٧٨ ونيت / دال باء راء ١٢٣٤ فان / «جراج يمين» /
// حاء ميم نون ٤٥٦٧ دباب / الف باء حاء ٧٨٩٠ ونيت / «برحة يسار» / دال واو كاف ٩٩١١ فان
const FIELD_SESSION =
  "حاء باء كاف خمسة تمانية سبعة تمانية ونيت " +
  "دال باء راء واحد اتنين تلاتة اربعة فان " +
  "جراج يمين " +
  "حاء ميم نون اربعة خمسة ستة سبعة دباب " +
  "الف باء حاء سبعة تمانية تسعة صفر ونيت " +
  "برحة يسار " +
  "دال واو كاف تسعة تسعة واحد واحد فان";

describe("sessionParser — السياق الأمامي (الملاحظة تنطبق على ما بعدها)", () => {
  it("يستخرج الخمس لوحات بالترتيب مع الأنواع الصحيحة", () => {
    const recs = batch(FIELD_SESSION);
    expect(recs.map((r) => r.plate)).toEqual([
      "حبك5878", "دبر1234", "حمن4567", "ابح7890", "دوك9911",
    ]);
    expect(recs.map((r) => r.vehicleType)).toEqual([
      "ونيت", "فان", "دباب", "ونيت", "فان",
    ]);
  });

  it("اللوحات قبل أول ملاحظة بدون سياق، وبعدها ترث «جراج يمين» ثم «برحة يسار»", () => {
    const recs = batch(FIELD_SESSION);
    expect(recs[0].contextNote).toBe("");
    expect(recs[1].contextNote).toBe("");
    expect(recs[2].contextNote).toBe("جراج يمين");
    expect(recs[3].contextNote).toBe("جراج يمين");
    expect(recs[4].contextNote).toBe("برحة يسار");
    // السياق بيتحقن في notes المحفوظة
    expect(recs[2].notes).toContain("جراج يمين");
    expect(recs[4].notes).toContain("برحة يسار");
    expect(recs[0].notes).not.toContain("جراج");
  });

  it("ملاحظة في أول الجلسة تنطبق على كل اللوحات التالية", () => {
    const recs = batch("الشارع بيلف يمين دال باء راء واحد اتنين تلاتة اربعة حاء ميم نون خمسة ستة سبعة تمانية");
    expect(recs.map((r) => r.plate)).toEqual(["دبر1234", "حمن5678"]);
    expect(recs[0].contextNote).toBe("الشارع بيلف يمين");
    expect(recs[1].contextNote).toBe("الشارع بيلف يمين");
  });

  it("رقم الجراج لا يتسرب أبداً لأرقام اللوحة", () => {
    const recs = batch("جراج يمين رقم خمسة دال باء راء واحد اتنين تلاتة اربعة");
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toBe("دبر1234");
    expect(recs[0].contextNote).toBe("جراج يمين رقم 5");
  });

  it("بدون أي ملاحظات → contextNote فاضي للجميع", () => {
    const recs = batch("حاء باء كاف خمسة تمانية سبعة تمانية دال باء راء واحد اتنين تلاتة اربعة");
    expect(recs).toHaveLength(2);
    for (const r of recs) expect(r.contextNote).toBe("");
  });

  it("chunk فيه ملاحظة فقط لا يولّد أي سجلات", () => {
    const res = parseSessionChunk("برحة يسار", newSessionState(), { final: true });
    expect(res.records).toHaveLength(0);
    expect(res.state.currentNote).toBe("برحة يسار");
    expect(res.events.some((e) => e.type === "NoteDetected" && e.value === "برحة يسار")).toBe(true);
  });
});

describe("sessionParser — carry-over عبر حدود الـ chunks", () => {
  it("لوحة مقطوعة نصّين بين chunk-ين تكتمل بدون فقد", () => {
    const recs = streamed([
      "جراج يمين دال باء راء واحد اتنين",   // مقطوعة بعد رقمين
      "تلاتة اربعة فان",                     // بقية الأرقام + النوع
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toBe("دبر1234");
    expect(recs[0].vehicleType).toBe("فان");
    expect(recs[0].contextNote).toBe("جراج يمين");
  });

  it("حروف بدون أرقام في نهاية chunk تترحّل وتكتمل في اللي بعده", () => {
    const recs = streamed([
      "حاء باء كاف خمسة تمانية سبعة تمانية دال باء راء",
      "واحد اتنين تلاتة اربعة",
    ]);
    expect(recs.map((r) => r.plate)).toEqual(["حبك5878", "دبر1234"]);
  });

  it("عبارة ملاحظة مقطوعة بين chunk-ين تتجمّع صح", () => {
    const recs = streamed([
      "دال باء راء واحد اتنين تلاتة اربعة جراج",  // anchor بدون اتجاه
      "يمين حاء ميم نون خمسة ستة سبعة تمانية",
    ]);
    expect(recs.map((r) => r.plate)).toEqual(["دبر1234", "حمن5678"]);
    expect(recs[0].contextNote).toBe("");           // قبل الملاحظة
    expect(recs[1].contextNote).toBe("جراج يمين");   // بعدها
  });

  it("السياق (currentNote) يعيش عبر الـ chunks في الـ state", () => {
    let state = newSessionState();
    const r1 = parseSessionChunk("برحة يسار", state);
    state = r1.state;
    const r2 = parseSessionChunk("حاء ميم نون خمسة ستة سبعة تمانية", state, { final: true });
    expect(r2.records).toHaveLength(1);
    expect(r2.records[0].contextNote).toBe("برحة يسار");
  });

  it("chunk غير نهائي لا يفقد لوحة كاملة موجودة فيه", () => {
    let state = newSessionState();
    const r1 = parseSessionChunk("حاء باء كاف خمسة تمانية سبعة تمانية ونيت", state);
    expect(r1.records).toHaveLength(1);
    expect(r1.records[0].plate).toBe("حبك5878");
    expect(r1.records[0].vehicleType).toBe("ونيت");
  });

  it("الذيل الناقص يتفرّغ في النهاية (final flush) بدل ما يضيع", () => {
    const recs = streamed([
      "دال باء راء واحد اتنين تلاتة",  // 3 أرقام بس — ناقصة
    ]);
    // بالسلوك الموروث: الأرقام بتتحاط padStart — المهم إنها متضاعتش
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toContain("دبر");
  });
});

describe("sessionParser — إصلاحات المراجعة العدائية", () => {
  it("قطع بعد واو العطف وسط الأرقام لا يولّد لوحات وهمية (الترحيل يمتد للأرقام الناقصة)", () => {
    const recs = streamed([
      "دال واحد اتنين تلاتة و",                    // اتقطعت بعد واو العطف
      "اربعة كاف ميم خمسة ستة سبعة تمانية",
    ]);
    expect(recs.map((r) => r.plate)).toEqual(["د1234", "كم5678"]);
  });

  it("ملاحظة بين حروف اللوحة وأرقامها لا تفقد الحروف", () => {
    const recs = batch("دال باء راء جراج يمين واحد اتنين تلاتة اربعة");
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toBe("دبر1234");
    expect(recs[0].contextNote).toBe("جراج يمين");
  });

  it("حروف قبل ملاحظة على حدود chunk تتوحّد مع أرقامها بعد الملاحظة", () => {
    const recs = streamed([
      "دال باء راء جراج",
      "يمين واحد اتنين تلاتة اربعة",
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toBe("دبر1234");
    expect(recs[0].contextNote).toBe("جراج يمين");
  });

  it("أرقام بدون حروف معزولة بملاحظة تنضم لملاحظات آخر لوحة بدل سجل وهمي", () => {
    const recs = batch("حاء باء كاف خمسة ستة سبعة تمانية جراج يمين واحد اتنين تلاتة اربعة");
    expect(recs).toHaveLength(1);
    expect(recs[0].plate).toBe("حبك5678");
    expect(recs[0].notes).toContain("1234");
  });
});

describe("sessionParser — الأحداث والتسلسل", () => {
  it("يصدر NoteDetected و PlateCompleted بالترتيب الزمني", () => {
    const res = parseSessionChunk(
      "جراج يمين دال باء راء واحد اتنين تلاتة اربعة",
      newSessionState(),
      { final: true }
    );
    const types = res.events.map((e) => e.type);
    expect(types.indexOf("NoteDetected")).toBeLessThan(types.indexOf("PlateCompleted"));
    const seqs = res.events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("تعدد الملاحظات يبدّل السياق مش يراكمه", () => {
    const recs = batch(
      "جراج يمين دال باء راء واحد اتنين تلاتة اربعة برحة يسار حاء ميم نون خمسة ستة سبعة تمانية"
    );
    expect(recs[0].contextNote).toBe("جراج يمين");
    expect(recs[1].contextNote).toBe("برحة يسار");
    expect(recs[1].notes).not.toContain("جراج");
  });
});
