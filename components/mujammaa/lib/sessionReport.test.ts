import { describe, expect, it } from "vitest";
import {
  buildBatchReport,
  diagText,
  parseReadingSheet,
  reportText,
  type BatchReport,
  type ChunkRow,
  type ReportInput,
} from "./batchReport";
import {
  REREAD_MIN,
  SESSION_WINDOW_MS,
  buildSessionReport,
  closeSessions,
  combineParts,
  hasReportDiag,
  isReRead,
  newestOpenSession,
  pickSessionReport,
  planSessionSave,
  removePart,
  sheetKey,
  storedReport,
  upsertPart,
  withDiag,
  type ReportPart,
} from "./sessionReport";
import FIX from "./__tests__/fixtures/batch-20261003.json";

/**
 * ==========================================================================
 *  📊 تقرير واحد للجلسة كلها — مقطع واحد أو أكتر (٤ أكتوبر ٢٠٢٦)
 * ==========================================================================
 *  المالك: «يلا ضيفها انها تطلع كله في تقرير واحد سواء سجلت مقطع صوتي واحد
 *  او اكتر». بيقرا ورقة ١٢٥ لوحة على ٤ تسجيلات، ويفرّغ كل واحد من قايمة
 *  المقاطع — وعايز تقرير **واحد** قدّام الورقة كلها.
 *
 *  التسجيلات بتتعامل كـ**شريط واحد متوصّل** بالترتيب: كل وقت في التسجيل k
 *  بيتزاح بمجموع مدد اللي قبله، وكل رقم مقطع بيتزاح بعدد مقاطع اللي قبله.
 * ========================================================================== */

type Input = ReportPart["input"];

const part = (clipId: string, input: Partial<Input> & { audioSec: number }, extra: Partial<ReportPart> = {}): ReportPart => ({
  clipId,
  input: { rows: [], elapsedMs: 1000, ...input },
  ...extra,
});

/* ------------------------------------------------------------ مفتاح الورقة */

describe("sheetKey — مفتاح ورقة القراية", () => {
  const TEXT = "حبك1234 فان\nدرن1452 ونيت مركونه\nسصع5555";

  it("ورقة فاضية ⇒ \"\"", () => {
    expect(sheetKey([])).toBe("");
    expect(sheetKey(parseReadingSheet("بسم الله\n\n"))).toBe("");
  });

  it("تعديل المسافات بس (مسافات زيادة · سطور فاضية · CRLF) ⇒ نفس المفتاح", () => {
    const k = sheetKey(parseReadingSheet(TEXT));
    expect(k).not.toBe("");
    expect(sheetKey(parseReadingSheet("  حبك1234   فان  \r\n\r\nدرن1452  ونيت   مركونه\n\n سصع5555 \n"))).toBe(k);
    expect(sheetKey(parseReadingSheet("ح ب ك 1234 فان\nدرن1452 ونيت مركونه\nسصع5555"))).toBe(k);
  });

  it("تغيير لوحة أو نوع أو ملاحظة أو الترتيب ⇒ مفتاح تاني", () => {
    const k = sheetKey(parseReadingSheet(TEXT));
    expect(sheetKey(parseReadingSheet(TEXT.replace("حبك1234", "حبك1235")))).not.toBe(k);
    expect(sheetKey(parseReadingSheet(TEXT.replace("فان", "ونيت")))).not.toBe(k);
    expect(sheetKey(parseReadingSheet(TEXT.replace("مركونه", "مصدومه")))).not.toBe(k);
    expect(sheetKey(parseReadingSheet(TEXT.split("\n").reverse().join("\n")))).not.toBe(k);
  });
});

/* ------------------------------------------------------------ upsertPart */

describe("upsertPart — «فرّغ تاني» مابيعدّش مرتين", () => {
  const a = part("c1", { audioSec: 10 }, { startedAtMs: 1000 });
  const b = part("c2", { audioSec: 20 }, { startedAtMs: 2000 });
  const c = part("c3", { audioSec: 30 }, { startedAtMs: 3000 });

  it("مقطع جديد بيتضاف — والقديمة مابتتلمسش", () => {
    const before = [a];
    const out = upsertPart(before, b);
    expect(out.map((p) => p.clipId)).toEqual(["c1", "c2"]);
    expect(before).toHaveLength(1);
  });

  it("نفس المقطع اتفرّغ تاني ⇒ بيتبدّل مكانه، مش بيتكرّر", () => {
    const again = part("c2", { audioSec: 25 }, { startedAtMs: 2000 });
    const out = upsertPart([a, b, c], again);
    expect(out.map((p) => p.clipId)).toEqual(["c1", "c2", "c3"]);
    expect(out[1].input.audioSec).toBe(25);
  });

  it("الترتيب بلحظة بداية التسجيل — حتى لو اتفرّغوا بالعكس", () => {
    const out = upsertPart(upsertPart(upsertPart([], c), a), b);
    expect(out.map((p) => p.clipId)).toEqual(["c1", "c2", "c3"]);
  });

  it("من غير لحظة بداية ⇒ ترتيب الإضافة", () => {
    const x = part("x", { audioSec: 1 });
    const y = part("y", { audioSec: 1 });
    const z = part("z", { audioSec: 1 });
    expect(upsertPart(upsertPart(upsertPart([], z), x), y).map((p) => p.clipId)).toEqual(["z", "x", "y"]);
  });
});

/* ------------------------------------------------------------ combineParts */

describe("combineParts — التسجيلات شريط واحد متوصّل", () => {
  it("تسجيل واحد ⇒ نفس المدخل بالظبط", () => {
    const p = part("c1", {
      audioSec: 30,
      rows: [{ plate: "حبك1234", t_s: 2 }],
      seqs: [["حبك1234"]],
      cuts: [[0, 28]],
      run: "runA",
      serverMs: 2000,
      realtimeX: 15.2,
      calls: 3,
    });
    expect(combineParts([p])).toEqual(p.input);
  });

  const A = part("A", {
    audioSec: 30,
    rows: [
      { plate: "حبك1234", support: 2, t_s: 2, t_slot: 2.5 } as ChunkRow,
      { plate: "درن1452", support: 2, t_s: null },
    ],
    dropped: [{ plate: "زور1111", support: 1, why: "lone", chunks: [0], t_s: 20, nbr: [3, 3] }],
    cohereFixed: [{ from: "حبك1235", to: "حبك1234", action: "fix", row: 0, heard: 1, of: 1 }],
    seqs: [["حبك1234", "درن1452"]],
    chunks: [{ start: 0, end: 28, text: "حبك1234 درن1452" }],
    cuts: [[0, 28]],
    cohereTexts: ["حا با كاف"],
    cohereDigits: ["1234", "1452"],
    run: "runA",
    elapsedMs: 3000,
    serverMs: 2000,
    calls: 1,
    model: "M1",
    recipe: { v: 1 },
    fieldsFrom: "self",
  });
  const B = part("B", {
    audioSec: 45,
    rows: [{ plate: "سصع5555", support: 3, t_s: 5, t_slot: 6 } as ChunkRow],
    dropped: [{ plate: "رحن3488", support: 1, why: "edge", chunks: [1], t_s: 30, coverage: 3 }],
    cohereFixed: [{ from: "سصع5556", to: "سصع5555", action: "fix", row: 0 }],
    seqs: [["سصع5555"], ["رحن3488"]],
    chunks: [{ start: 0, end: 28, text: "سصع5555" }, { start: 17, end: 45, text: "رحن3488" }],
    cuts: [[0, 28], [17, 45]],
    cohereTexts: ["سين صاد عين", "را حا نون"],
    cohereDigits: ["1452", "5555"],
    run: "runB",
    elapsedMs: 4000,
    serverMs: 3000,
    calls: 2,
    model: "M2",
    recipe: { v: 2 },
    fieldsFrom: "cohere",
  });
  const c = combineParts([A, B]);

  it("الأوقات بتتزاح بمدة اللي قبلها (t_s · t_slot · المتشال · المقاطع · الحدود) — و null يفضل null", () => {
    expect(c.rows.map((r) => r.t_s)).toEqual([2, null, 35]);
    expect(c.rows.map((r) => (r as ChunkRow).t_slot)).toEqual([2.5, undefined, 36]);
    expect(c.dropped!.map((d) => d.t_s)).toEqual([20, 60]);
    expect(c.chunks!.map((x) => [x.start, x.end])).toEqual([[0, 28], [30, 58], [47, 75]]);
    expect(c.cuts).toEqual([[0, 28], [30, 58], [47, 75]]);
  });

  it("أرقام المقاطع بتتزاح بعدد مقاطع اللي قبلها — والقوايم ماشية بنفس الترتيب", () => {
    expect(c.dropped!.map((d) => d.chunks)).toEqual([[0], [2]]);
    expect(c.seqs).toEqual([["حبك1234", "درن1452"], ["سصع5555"], ["رحن3488"]]);
    expect(c.cohereTexts).toEqual(["حا با كاف", "سين صاد عين", "را حا نون"]);
    expect(c.chunks!.map((x) => x.text)).toEqual(["حبك1234 درن1452", "سصع5555", "رحن3488"]);
  });

  it("اللوحات والمتشال والتصحيح بيتلمّوا — وصف التصحيح بيتزاح بعدد صفوف اللي قبله", () => {
    expect(c.rows.map((r) => r.plate)).toEqual(["حبك1234", "درن1452", "سصع5555"]);
    expect(c.dropped!.map((d) => d.plate)).toEqual(["زور1111", "رحن3488"]);
    expect(c.dropped![0].nbr).toEqual([3, 3]);
    expect(c.dropped![1].coverage).toBe(3);
    expect(c.cohereFixed!.map((f) => [f.from, f.row])).toEqual([["حبك1235", 0], ["سصع5556", 2]]);
    expect(c.cohereDigits).toEqual(["1234", "1452", "5555"]);
  });

  it("المدد بتتجمع · السرعة = الصوت كله ÷ وقت السيرفر كله · التشغيلات بـ« + » · الموديل من الأخير", () => {
    expect(c.audioSec).toBe(75);
    expect(c.elapsedMs).toBe(7000);
    expect(c.serverMs).toBe(5000);
    expect(c.calls).toBe(3);
    expect(c.realtimeX).toBe(15);
    expect(c.run).toBe("runA + runB");
    expect(c.model).toBe("M2");
    expect(c.recipe).toEqual({ v: 2 });
    expect(c.fieldsFrom).toBe("cohere");
  });

  it("المدخلات الأصلية مابتتغيّرش", () => {
    expect(B.input.rows[0].t_s).toBe(5);
    expect(B.input.dropped![0].chunks).toEqual([1]);
    expect(B.input.chunks![0].start).toBe(0);
  });

  it("تسجيل من غير نص كوهير قبل تسجيل بيه ⇒ المقاطع بتتسند بخانات فاضية فالرقم يفضل مظبوط", () => {
    const noCoh = part("A", { audioSec: 30, seqs: [["حبك1234"], ["درن1452"]], cuts: [[0, 28], [9, 30]] });
    const withCoh = part("B", { audioSec: 30, seqs: [["سصع5555"]], cuts: [[0, 28]], cohereTexts: ["نص التسجيل التاني"] });
    const cc = combineParts([noCoh, withCoh]);
    expect(cc.cohereTexts).toHaveLength(3);
    expect(cc.cohereTexts![2]).toBe("نص التسجيل التاني");
    const r = buildBatchReport({ sheet: [], ...cc });
    expect(r.diag![2]).toMatchObject({ s: 30, e: 58, m: "سصع5555", c: "نص التسجيل التاني" });
    expect(r.diag![0].c ?? "").toBe("");
  });
});

/* --------------------------------------- جلسة المالك: ورقة واحدة على ٣ تسجيلات */

const SHEET = parseReadingSheet([
  "حبك1234 فان",
  "درن1452 ونيت",
  "سصع5555",
  "يطك5488",   // هتطلع مقلوبة (يطك4588) في التسجيل التاني
  "رحن3488",   // اتشالت «لوحدها» في التسجيل التاني (المقطع رقم 1 جوّاه)
  "دهس7777",   // محدّش سمعها
].join("\n"));

const REC_A = part("clip-A", {
  audioSec: 30,
  rows: [
    { plate: "حبك1234", support: 2, type: "فان", t_s: 2 },
    { plate: "درن1452", support: 2, type: "ونيت", t_s: 10 },
  ],
  seqs: [["حبك1234", "درن1452"]],
  chunks: [{ start: 0, end: 28, text: "حبك1234 درن1452" }],
  cuts: [[0, 28]],
  cohereTexts: ["حا با كاف ١٢٣٤ فان دال را نون ١٤٥٢ ونيت"],
  cohereDigits: ["1234", "1452"],
  run: "runA",
  elapsedMs: 3000,
  serverMs: 2000,
  calls: 1,
}, { startedAtMs: 1_000, label: "مقطع ١" });

const REC_B = part("clip-B", {
  audioSec: 40,
  rows: [
    { plate: "سصع5555", support: 2, t_s: 3 },
    { plate: "يطك4588", support: 2, t_s: 15 },
  ],
  dropped: [{ plate: "رحن3488", support: 1, why: "lone", nbr: [2, 2], chunks: [1], t_s: 30 }],
  seqs: [["سصع5555", "يطك4588"], ["يطك4588", "رحن3488"]],
  chunks: [{ start: 0, end: 28, text: "سصع5555 يطك4588" }, { start: 12, end: 40, text: "يطك4588 رحن3488" }],
  cuts: [[0, 28], [12, 40]],
  cohereTexts: ["سين صاد عين ٥٥٥٥ يا طا كاف ٤٥٨٨", "يا طا كاف ٤٥٨٨ را حا نون ٣٤٨٨"],
  cohereDigits: ["5555", "4588", "3488"],
  run: "runB",
  elapsedMs: 4000,
  serverMs: 3000,
  calls: 2,
}, { startedAtMs: 2_000, label: "مقطع ٢" });

const REC_C = part("clip-C", {
  audioSec: 20,
  rows: [{ plate: "زور9999", support: 2, t_s: 5 }],
  seqs: [["زور9999"]],
  chunks: [{ start: 0, end: 20, text: "زور9999" }],
  cuts: [[0, 20]],
  cohereTexts: ["زاي واو را"],
  cohereDigits: [],
  run: "runC",
  elapsedMs: 2000,
  serverMs: 1000,
  calls: 1,
}, { startedAtMs: 3_000, label: "مقطع ٣" });

const NOW = 1_759_500_000_000;

describe("جلسة المالك — ورقة واحدة متقسّمة على ٣ تسجيلات ⇒ تقرير واحد", () => {
  const r1 = buildSessionReport(undefined, REC_A, SHEET, NOW);
  const r2 = buildSessionReport(r1, REC_B, SHEET, NOW + 60_000);
  const r3 = buildSessionReport(r2, REC_C, SHEET, NOW + 120_000);

  it("نفس التقرير (نفس المعرّف ولحظة الإنشاء) بيكبر مع كل تفريغ", () => {
    expect(r2.id).toBe(r1.id);
    expect(r3.id).toBe(r1.id);
    expect(r3.createdAt).toBe(NOW);
    expect(r3.updatedAt).toBe(NOW + 120_000);
    expect(r3.parts!.map((p) => p.clipId)).toEqual(["clip-A", "clip-B", "clip-C"]);
    expect(r3.sheetKey).toBe(sheetKey(SHEET));
  });

  it("العدّ قدّام الورقة كلها: قلت ٦ · طلع ٥ · صح ٣ · ٣ ماطلعوش · اختراع ١", () => {
    expect(r1.said).toBe(6);
    expect(r1.correct).toBe(2); // بعد أول تسجيل بس
    expect(r3.said).toBe(6);
    expect(r3.got).toBe(5);
    expect(r3.correct).toBe(3);
    expect(r3.missed.map((m) => m.plate)).toEqual(["يطك5488", "رحن3488", "دهس7777"]);
    expect(r3.misread.map(({ said, got }) => ({ said, got }))).toEqual([{ said: "يطك5488", got: "يطك4588" }]);
    expect(r3.extras.map((x) => x.plate)).toEqual(["زور9999"]);
    expect(r3.inventions).toBe(1);
    expect(r3.types).toMatchObject({ said: 2, correct: 2 });
    expect(r3.audioSec).toBe(90);
    expect(r3.elapsedMs).toBe(9000);
    expect(r3.calls).toBe(4);
    expect(r3.run).toBe("runA + runB + runC");
  });

  it("المتشال في التسجيل التاني بيشاور على مقطعه هو (#2) ووقته على الشريط (1:00) — مش مقطع التسجيل الأول", () => {
    const m = r3.missed.find((x) => x.plate === "رحن3488")!;
    expect(m.reason).toContain("لأن اللي حواليها اتسمعوا كتير");
    expect(m.evidence!.dropped).toEqual([{ plate: "رحن3488", support: 1, why: "lone", nbr: [2, 2], chunks: [2], t_s: 60 }]);
    expect(m.evidence!.reads.every((x) => x.i >= 1 && x.i <= 2)).toBe(true);
    const d = diagText(r3);
    expect(d).toContain("#2");
    expect(d).toContain("1:00");
  });

  it("القراية الغلط في التسجيل التاني: الدليل من مقاطعه بس", () => {
    const ev = r3.misread.find((x) => x.said === "يطك5488")!.evidence!;
    expect(ev.reads.map((x) => x.i).sort()).toEqual([1, 2]);
    expect(ev.reads.map((x) => x.read)).toEqual(["يطك4588", "يطك4588"]);
    expect(ev.t).toBe(45);
  });

  it("الاختراع في التسجيل التالت: مقطعه رقم 3 بوقته على الشريط (70–90ث)", () => {
    const ev = r3.extras[0].evidence!;
    expect(ev.reads).toEqual([{ i: 3, s: 70, e: 90, read: "زور9999" }]);
    expect(ev.t).toBe(75);
  });

  it("الاسم = وقت أول تسجيل + عدد التسجيلات", () => {
    const at = new Date(NOW).toLocaleString("ar-EG");
    expect(r1.label).toBe(at);
    expect(r2.label).toBe(`${at} · تسجيلين`);
    expect(r3.label).toBe(`${at} · 3 تسجيلات`);
  });

  it("«فرّغ تاني» لتسجيل في الجلسة ⇒ بيتبدّل مكانه، والعدّ مابيتضاعفش", () => {
    const again = buildSessionReport(r3, { ...REC_B }, SHEET, NOW + 180_000);
    expect(again.id).toBe(r1.id);
    expect(again.parts).toHaveLength(3);
    expect(again.got).toBe(5);
    expect(again.correct).toBe(3);
    expect(again.audioSec).toBe(90);
  });

  it("التسجيلات اتفرّغت بالعكس ⇒ نفس التقرير (الترتيب بلحظة التسجيل)", () => {
    const x = buildSessionReport(buildSessionReport(buildSessionReport(undefined, REC_C, SHEET, NOW), REC_A, SHEET, NOW), REC_B, SHEET, NOW);
    expect(x.parts!.map((p) => p.clipId)).toEqual(["clip-A", "clip-B", "clip-C"]);
    expect(x.missed).toEqual(r3.missed);
    expect(x.extras).toEqual(r3.extras);
    expect(x.diag).toEqual(r3.diag);
  });

  it("نص التقرير: سطر التسجيلات بعد سطر المدة على طول", () => {
    const t = reportText(r3).split("\n");
    const i = t.findIndex((l) => l.startsWith("⏱️ مدة التسجيل 1:30"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t[i + 1]).toBe("🎙️ 3 تسجيلات: 0:30 + 0:40 + 0:20");
    expect(reportText(r2)).toContain("🎙️ تسجيلين: 0:30 + 0:40");
    expect(reportText(r1)).not.toContain("🎙️");
  });

  it("التشخيص: نص المقاطع الخام متقسّم على التسجيلات — كل تسجيل بعنوانه ومدته وتشغيلته", () => {
    const d = diagText(r3);
    const h1 = d.indexOf("── تسجيل 1 (0:30) · التشغيلة runA");
    const h2 = d.indexOf("── تسجيل 2 (0:40) · التشغيلة runB");
    const h3 = d.indexOf("── تسجيل 3 (0:20) · التشغيلة runC");
    expect(h1).toBeGreaterThan(0);
    expect(h2).toBeGreaterThan(h1);
    expect(h3).toBeGreaterThan(h2);
    const at = (s: string) => d.indexOf(s, h1);
    expect(at("\n#0 ")).toBeGreaterThan(h1);
    expect(at("\n#0 ")).toBeLessThan(h2);
    expect(at("\n#1 ")).toBeGreaterThan(h2);
    expect(at("\n#2 ")).toBeLessThan(h3);
    expect(at("\n#3 ")).toBeGreaterThan(h3);
    // تسجيل واحد ⇒ مافيش عناوين تسجيلات
    expect(diagText(r1)).not.toContain("── تسجيل 1");
  });
});

/* ---------------------------- مقطع في تسجيل ماينفعش يشاور على مقطع في تسجيل تاني */

describe("الدليل مابيعدّيش من تسجيل لتسجيل", () => {
  const sheet = parseReadingSheet("حبك1234");
  const first = part("A", {
    audioSec: 30,
    rows: [{ plate: "حبك1234", support: 2, t_s: 2 }],
    // قراية قريبة «زور9998» في التسجيل الأول — مش بتاعة اختراع التسجيل التالت
    seqs: [["حبك1234", "زور9998"]],
    chunks: [{ start: 0, end: 28, text: "حبك1234 زور9998" }],
    cuts: [[0, 28]],
  }, { startedAtMs: 1 });

  it("لوحة من غير وقت (t_s = null) في التسجيل التاني ⇒ مقاطع تسجيلها بس", () => {
    const second = part("B", {
      audioSec: 30,
      rows: [{ plate: "زور9999", support: 2, t_s: null }],
      seqs: [["زور9999"]],
      chunks: [{ start: 0, end: 28, text: "زور9999" }],
      cuts: [[0, 28]],
    }, { startedAtMs: 2 });
    const r = buildSessionReport(buildSessionReport(undefined, first, sheet, NOW), second, sheet, NOW);
    const ev = r.extras.find((x) => x.plate === "زور9999")!.evidence!;
    expect(ev.reads.map((x) => x.i)).toEqual([1]);
  });

  it("تسجيل قصير في النص (٤ث) ⇒ اختراع التسجيل التالت مابيشاورش على مقطع التسجيل الأول", () => {
    const short = part("B", { audioSec: 4 }, { startedAtMs: 2 });
    const third = part("C", {
      audioSec: 30,
      rows: [{ plate: "زور9999", support: 2, t_s: 2 }],
      seqs: [["زور9999"]],
      chunks: [{ start: 0, end: 28, text: "زور9999" }],
      cuts: [[0, 28]],
    }, { startedAtMs: 3 });
    let r = buildSessionReport(undefined, first, sheet, NOW);
    r = buildSessionReport(r, short, sheet, NOW);
    r = buildSessionReport(r, third, sheet, NOW);
    const ev = r.extras.find((x) => x.plate === "زور9999")!.evidence!;
    expect(ev.t).toBe(36);
    expect(ev.reads.map((x) => x.i)).toEqual([1]);
  });
});

/* ----------------------------------------- على تسجيل المالك الحقيقي (٣ أكتوبر) */

// نفس ورقة batchReport.test.ts (تسجيل batch-runs/20261003-003055-395)
const REAL_PLATES = (
  "امن2651 دقو1197 حهق4233 اطط5406 دبو8965 دهس6368 اسم6259 اكط1587 اعه6074 دمد9617 " +
  "مصس0597 بطع4658 الط6345 حسس1772 حعس3197 اطق5734 انا7675 دقد2034 حهر8929 رنل6865 " +
  "رصد1205 حصق1559 حمب7101 رال5820 دطا8911 حنب1787 دقص0597 اصط1249 بعب8519 اهد2159 " +
  "بصع3965 امم1060 حوص4168 اول3031 دبد6514 حعس9223 بحص2763 اعص7955 درس7305 دمي5630 " +
  "دوط6501 بوه9615 اول3016 اوح2835 دنح5305 دبح7906 ااح4773 اصص8208 حبك5130 سده2560 " +
  "بوح2196 سول0941 اوط3905 حعد6579 اعب8412 رلي3807 سحط4201 حكر7718 انل1809 دطل9569"
).split(" ");
const REAL_KINDS = [
  "ونيت", "فان", "دباب", "شاص", "مركونه", "مصدومه", "لوحه صفرا", "نقل", "ملاكي", "برحه يمين",
  "برحه يسار", "غمارة", "غمارتين", "موتوسيكل", "مسجد", "داخل بيت", "جراج", "تحت تندة", "فندق", "امام فندق",
  "برحه يمين", "برحه يسار", "بدون لوحه اماميه", "مبنشرة", "متغطيه", "حادث", "متحرك", "مركونه", "متربه", "جران ماكس",
  "تريلا", "سطحه", "دوكر", "حافله", "اتوبيس", "كوستر", "ميكروباص", "نقليات", "دينه", "شاحنه",
  "شاص", "هاي اس", "اتش1",
];
const REAL_LINES = REAL_PLATES.map((p, i) => (REAL_KINDS[i] ? `${p} ${REAL_KINDS[i]}` : p));
const REAL_SHEET = parseReadingSheet(REAL_LINES.join("\n"));

const realPart = (over: Partial<Input> = {}): ReportPart => ({
  clipId: "clip-real",
  label: "مقطع ٢",
  startedAtMs: 2_000,
  input: {
    rows: FIX.plates,
    dropped: FIX.dropped,
    seqs: FIX.seqs,
    chunks: FIX.chunks,
    cuts: FIX.cuts,
    cohereTexts: FIX.cohere_texts,
    cohereDigits: FIX.cohere_digits,
    run: FIX.run,
    audioSec: FIX.dur_s,
    elapsedMs: 65000,
    calls: FIX.calls,
    model: FIX.model,
    fieldsFrom: FIX.fields_from,
    ...over,
  },
});

const REAL_LONE = [
  { plate: "اصا7675", support: 1, why: "lone", nbr: [4, 4], chunks: [9], t_s: 57.96 },
  { plate: "رصد1205", support: 1, why: "lone", nbr: [5, 4], chunks: [9], t_s: 76.15 },
];

describe("تسجيل واحد ⇒ نفس تقرير buildBatchReport بالظبط (تسجيل المالك الحقيقي)", () => {
  const strip = ({ id: _i, parts: _p, sheetKey: _k, updatedAt: _u, sheet: _s, ...rest }: BatchReport) => rest;

  for (const [name, over] of [["من غير متشال", {}], ["بالمتشال «لوحدها»", { dropped: REAL_LONE }]] as const) {
    it(name, () => {
      const p = realPart(over);
      const single = buildBatchReport({ sheet: REAL_SHEET, ...p.input, now: NOW });
      const session = buildSessionReport(undefined, p, REAL_SHEET, NOW);
      expect(strip(session)).toStrictEqual(strip(single));
      expect(session.createdAt).toBe(NOW);
      expect(session.updatedAt).toBe(NOW);
      expect(session.parts).toEqual([p]);
      expect(session.said).toBe(60);
      expect(session.correct).toBe(57);
      expect(reportText(session)).toBe(reportText(single));
      expect(diagText(session)).toBe(diagText(single));
    });
  }
});

describe("تسجيل المالك الحقيقي بعد تسجيل قبله ⇒ نفس النتيجة بالظبط، والأرقام والأوقات مزاحة", () => {
  // تسجيل ٢٠ث قبله: لوحتين من الورقة + اختراع
  const PRE = part("clip-pre", {
    audioSec: 20,
    rows: [
      { plate: "حبك1234", support: 2, type: "فان", t_s: 3 },
      { plate: "درن1452", support: 2, t_s: 9 },
      { plate: "زور9999", support: 2, t_s: 15 },
    ],
    seqs: [["حبك1234", "درن1452", "زور9999"]],
    chunks: [{ start: 0, end: 20, text: "حبك1234 درن1452 زور9999" }],
    cuts: [[0, 20]],
    cohereTexts: ["حا با كاف ١٢٣٤ فان دال را نون ١٤٥٢"],
    cohereDigits: ["1234", "1452"],
    run: "pre-run",
    elapsedMs: 2000,
    calls: 1,
  }, { startedAtMs: 1_000, label: "مقطع ١" });
  const SHEET2 = parseReadingSheet(["حبك1234 فان", "درن1452", ...REAL_LINES].join("\n"));
  const OFF = 20;
  const NCH = 1;

  for (const [name, over] of [["من غير متشال", {}], ["بالمتشال «لوحدها»", { dropped: REAL_LONE }]] as const) {
    it(name, () => {
      const alone = buildBatchReport({ sheet: REAL_SHEET, ...realPart(over).input, now: NOW });
      const both = buildSessionReport(buildSessionReport(undefined, PRE, SHEET2, NOW), realPart(over), SHEET2, NOW);

      expect(both.said).toBe(62);
      expect(both.correct).toBe(alone.correct + 2);
      expect(both.missed.map((m) => m.plate)).toEqual(alone.missed.map((m) => m.plate));
      expect(both.misread.map(({ said, got }) => [said, got])).toEqual(alone.misread.map(({ said, got }) => [said, got]));
      expect(both.extras.map((x) => x.plate).sort()).toEqual([...alone.extras.map((x) => x.plate), "زور9999"].sort());

      // كل دليل = نفس دليل التسجيل لوحده، بس رقم المقطع +1 والوقت +20ث
      for (const m of alone.missed) {
        const b = both.missed.find((x) => x.plate === m.plate)!;
        expect(b.reason).toBe(m.reason);
        expect(b.heardAs).toBe(m.heardAs);
        const ea = m.evidence!;
        const eb = b.evidence!;
        expect(eb.t!).toBeCloseTo(ea.t! + OFF, 1);
        expect(eb.reads.map((x) => ({ ...x, i: x.i - NCH, s: x.s! - OFF, e: x.e! - OFF })).map((x) => [x.i, x.read, Math.round(x.s * 100), Math.round(x.e * 100)]))
          .toEqual(ea.reads.map((x) => [x.i, x.read, Math.round(x.s! * 100), Math.round(x.e! * 100)]));
        expect(eb.cohere).toBe(ea.cohere);
        expect(eb.cohereAt).toBe(ea.cohereAt === undefined ? undefined : ea.cohereAt + NCH);
        expect((eb.dropped ?? []).map((d) => ({ ...d, chunks: d.chunks?.map((c) => c - NCH), t_s: Math.round((d.t_s! - OFF) * 100) / 100 })))
          .toEqual(ea.dropped ?? []);
      }
      const x2 = both.extras.find((x) => x.plate === "حوص6146")!;
      const x1 = alone.extras.find((x) => x.plate === "حوص6146")!;
      expect(x2.reason).toBe(x1.reason);
      expect(x2.evidence!.reads.map((x) => x.i - NCH)).toEqual(x1.evidence!.reads.map((x) => x.i));

      // النوع والملاحظة للوحات التسجيل الحقيقي زي ما هم
      const pick = (st: BatchReport["types"]) => ({ wrong: st.wrong, missing: st.missing });
      expect(pick(both.types)).toEqual(pick(alone.types));
      expect(pick(both.notes)).toEqual(pick(alone.notes));
      expect(both.types.correct).toBe(alone.types.correct + 1);

      // قسم المقاطع: مقطع التسجيل الأول + الـ٢٥ بتوعه بعده بوقتهم على الشريط
      expect(both.diag).toHaveLength(NCH + FIX.chunks.length);
      expect(both.diag![NCH]).toMatchObject({ s: 33.02, e: 61.26, m: FIX.chunks[0].text, c: FIX.cohere_texts[0] });
      // 🔎 (مراجعة ٤ أكتوبر) كل سطر بتسجيله — غير كده زي التسجيل لوحده بالظبط
      expect(both.out.slice(3).map(({ rec: _r, again: _a, ...o }) => o)).toEqual(alone.out);
      expect(both.out.map((o) => o.rec)).toEqual([1, 1, 1, ...alone.out.map(() => 2)]);
      expect(both.audioSec).toBeCloseTo(FIX.dur_s + OFF, 6);
      expect(both.run).toBe(`pre-run + ${FIX.run}`);
    });
  }

  it("التسجيل الحقيقي الأول والقصير بعده ⇒ الحقيقي ماتلمسش، والقصير مزاح بمدة الحقيقي", () => {
    const real = { ...realPart(), startedAtMs: 1_000 };
    const after = { ...PRE, startedAtMs: 2_000 };
    // لوحات القصير في آخر الورقة — التسجيلات بتترتّب بمكانها في الورقة (عيب ٤)
    const sheetLast = parseReadingSheet([...REAL_LINES, "حبك1234 فان", "درن1452"].join("\n"));
    const alone = buildBatchReport({ sheet: REAL_SHEET, ...real.input, now: NOW });
    const both = buildSessionReport(buildSessionReport(undefined, real, sheetLast, NOW), after, sheetLast, NOW);
    expect(both.parts!.map((p) => p.clipId)).toEqual(["clip-real", "clip-pre"]);
    for (const m of alone.missed) {
      expect(both.missed.find((x) => x.plate === m.plate)!.evidence!.reads).toEqual(m.evidence!.reads);
    }
    const inv = both.extras.find((x) => x.plate === "زور9999")!;
    expect(inv.evidence!.reads).toEqual([{ i: FIX.chunks.length, s: FIX.dur_s, e: FIX.dur_s + 20, read: "زور9999" }]);
    expect(inv.evidence!.t).toBeCloseTo(FIX.dur_s + 15, 2);
  });

  it("حدّ التشخيص (~١٥٠ كيلو) لسه شغّال على الجلسة كلها", () => {
    const big = "س".repeat(120_000);
    const a = part("a", { audioSec: 30, seqs: [["حبك1234"]], chunks: [{ start: 0, end: 28, text: big }], cohereTexts: [big] }, { startedAtMs: 1 });
    const b = part("b", { audioSec: 30, seqs: [["درن1452"]], chunks: [{ start: 0, end: 28, text: "درن1452" }], cohereTexts: ["دال را نون"] }, { startedAtMs: 2 });
    const r = buildSessionReport(buildSessionReport(undefined, a, SHEET, NOW), b, SHEET, NOW);
    const bytes = r.diag!.reduce((n, d) => n + new TextEncoder().encode(d.m + (d.c ?? "")).length, 0);
    expect(bytes).toBeLessThanOrEqual(150_000);
    expect(r.diagCut).toBe(2);
    expect(r.diag![1]).toMatchObject({ m: "درن1452", c: "دال را نون" });
    expect(diagText(r)).toContain("اتقص");
  });
});

/* --------------------------------------------------------- أنهي تقرير مفتوح */

describe("pickSessionReport — التسجيل الجاي يدخل أنهي تقرير", () => {
  const KEY = sheetKey(SHEET);
  const open = (id: string, at: number, over: Partial<BatchReport> = {}): BatchReport => ({
    ...buildSessionReport(undefined, REC_A, SHEET, at),
    id,
    ...over,
  });

  it("الأحدث المفتوح بنفس الورقة جوّه ٦ ساعات", () => {
    const reports = [open("old", NOW - 3_600_000), open("new", NOW - 60_000), open("mid", NOW - 1_800_000)];
    expect(pickSessionReport(reports, KEY, NOW)?.id).toBe("new");
  });

  it("بآخر تحديث مش بلحظة الإنشاء", () => {
    const reports = [open("a", NOW - 5 * 3_600_000, { updatedAt: NOW - 1000 }), open("b", NOW - 3_600_000)];
    expect(pickSessionReport(reports, KEY, NOW)?.id).toBe("a");
  });

  it("مابيختارش: تقرير قديم من غير تسجيلات · ورقة تانية · مقفول · أقدم من ٦ ساعات", () => {
    const legacy = buildBatchReport({ sheet: SHEET, ...REC_A.input, now: NOW - 1000 });
    const otherSheet = open("other", NOW - 1000, { sheetKey: "x" });
    const closed = open("closed", NOW - 1000, { closed: true });
    const stale = open("stale", NOW - SESSION_WINDOW_MS - 1);
    expect(pickSessionReport([legacy, otherSheet, closed, stale], KEY, NOW)).toBeUndefined();
    expect(pickSessionReport([], KEY, NOW)).toBeUndefined();
    expect(SESSION_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("من غير ورقة (المفتاح \"\") ⇒ التسجيلات بتتجمع برضه", () => {
    const r = buildSessionReport(undefined, REC_A, [], NOW);
    expect(r.sheetKey).toBe("");
    expect(pickSessionReport([r], "", NOW + 1000)?.id).toBe(r.id);
  });
});

describe("«ابدأ تقرير جديد» — closeSessions", () => {
  it("بيقفل المفتوح بس (اللي فيه تسجيلات) — ومابيمسحش حاجة", () => {
    const a = buildSessionReport(undefined, REC_A, SHEET, NOW);
    const done = { ...buildSessionReport(undefined, REC_B, SHEET, NOW), id: "done", closed: true };
    const legacy = buildBatchReport({ sheet: SHEET, ...REC_A.input, now: NOW });
    const out = closeSessions([a, done, legacy]);
    expect(out.map((r) => r.id)).toEqual([a.id]);
    expect(out[0]).toEqual({ ...a, closed: true });
    expect(a.closed).toBeUndefined();
    expect(pickSessionReport(out, sheetKey(SHEET), NOW)).toBeUndefined();
  });

  it("تقرير مقفول مابيرجعش يتفتح: التسجيل الجاي بيبدأ تقرير جديد", () => {
    const a = { ...buildSessionReport(undefined, REC_A, SHEET, NOW), closed: true };
    const prev = pickSessionReport([a], sheetKey(SHEET), NOW + 1000);
    const b = buildSessionReport(prev, REC_B, SHEET, NOW + 1000);
    expect(b.id).not.toBe(a.id);
    expect(b.parts).toHaveLength(1);
  });
});

describe("التوافق — تقرير قديم محفوظ (من غير تسجيلات)", () => {
  it("النص زي ما هو: مافيش سطر تسجيلات ولا عناوين تسجيلات", () => {
    const input: ReportInput = { sheet: SHEET, ...REC_A.input, now: NOW };
    const old = buildBatchReport(input);
    expect(old.parts).toBeUndefined();
    expect(reportText(old)).not.toContain("🎙️");
    expect(diagText(old)).not.toContain("── تسجيل");
  });
});

/* ==========================================================================
 *  🔎 مراجعة ٤ أكتوبر — العيوب اللي المراجعين لقوها في تقرير الجلسة
 * ========================================================================== */

const S3 = parseReadingSheet("حبك1234\nدرن1452\nسصع5555");

describe("عيب ١ — قراية غلط في تسجيل للوحة اتقرت صح في تسجيل تاني مش اختراع", () => {
  // آخر لوحة في التسجيل الأول اتقرت غلط، والمالك قراها تاني أول التسجيل التاني فطلعت صح
  const a = part("a", {
    audioSec: 30,
    rows: [{ plate: "حبك1234", support: 2, t_s: 2 }, { plate: "درن1453", support: 2, t_s: 25 }],
    cohereDigits: ["1234", "1452"],
  }, { startedAtMs: 1 });
  const b = part("b", {
    audioSec: 30,
    rows: [{ plate: "درن1452", support: 2, t_s: 2 }, { plate: "سصع5555", support: 2, t_s: 10 }],
  }, { startedAtMs: 2 });
  const r = buildSessionReport(buildSessionReport(undefined, a, S3, NOW), b, S3, NOW);

  it("مش «🔴 اختراع» — قراية غلط لنفس اللوحة اللي اتقرت صح في تسجيل تاني", () => {
    expect(r.correct).toBe(3);
    expect(r.inventions).toBe(0);
    const x = r.extras.find((e) => e.plate === "درن1453")!;
    expect(x.secondOf).toBe("درن1452");
    expect(x.reason).toContain("اتقرت صح في تسجيل تاني");
    expect(x.reason).not.toContain("🔴");
    expect(r.out.find((o) => o.plate === "درن1453")!.status).toBe("≈");
  });

  it("قراية قريبة من لوحة صح في **نفس** التسجيل لسه زي التقرير لوحده (مابيتغيّرش)", () => {
    const same = part("s", {
      audioSec: 30,
      rows: [{ plate: "حبك1234", support: 2, t_s: 2 }, { plate: "حبك1235", support: 2, t_s: 20 }],
    }, { startedAtMs: 3 });
    const other = part("o", { audioSec: 30, rows: [{ plate: "سصع5555", support: 2, t_s: 2 }] }, { startedAtMs: 4 });
    const both = buildSessionReport(buildSessionReport(undefined, same, S3, NOW), other, S3, NOW);
    const alone = buildBatchReport({ sheet: S3, ...same.input, now: NOW });
    expect(both.extras.find((e) => e.plate === "حبك1235")!.reason).toBe(alone.extras.find((e) => e.plate === "حبك1235")!.reason);
    expect(both.inventions).toBe(alone.inventions);
  });

  it("طلعت غلط في تسجيلين بقرايتين مختلفتين ⇒ التانية «قراية تانية غلط» مش اختراع", () => {
    const x = part("x", { audioSec: 30, rows: [{ plate: "درن1453", support: 2, t_s: 25 }] }, { startedAtMs: 1 });
    // بعيدة في الوقت عن الأولى (>٨ث) — القريبة بتتمسك من «القراية التانية» الأصلية
    const y = part("y", { audioSec: 30, rows: [{ plate: "سصع5555", support: 2, t_s: 9 }, { plate: "درن1454", support: 2, t_s: 20 }] }, { startedAtMs: 2 });
    const rr = buildSessionReport(buildSessionReport(undefined, x, S3, NOW), y, S3, NOW);
    expect(rr.misread.map(({ said, got }) => [said, got])).toEqual([["درن1452", "درن1453"]]);
    const e = rr.extras.find((q) => q.plate === "درن1454")!;
    expect(e.secondOf).toBe("درن1452");
    expect(e.reason).toContain("في تسجيل تاني (الأولى «درن1453»)");
    expect(rr.inventions).toBe(0);
  });

  it("القرايتين الغلط في **نفس** التسجيل وبعاد في الوقت ⇒ زي التقرير لوحده بالظبط", () => {
    const x = part("x", {
      audioSec: 30,
      rows: [{ plate: "درن1453", support: 2, t_s: 2 }, { plate: "درن1454", support: 2, t_s: 25 }],
    }, { startedAtMs: 1 });
    const y = part("y", { audioSec: 30, rows: [{ plate: "سصع5555", support: 2, t_s: 9 }] }, { startedAtMs: 2 });
    const alone = buildBatchReport({ sheet: S3, ...x.input, now: NOW });
    const rr = buildSessionReport(buildSessionReport(undefined, x, S3, NOW), y, S3, NOW);
    const why = (r: BatchReport) => r.extras.find((q) => q.plate === "درن1454")!.reason;
    expect(why(rr)).toBe(why(alone));
    expect(rr.inventions).toBe(alone.inventions);
  });

  it("«كل اللي طلع بالترتيب»: كل لوحة بتسجيلها، والمكررة متعلّمة إنها اتعدّت مرة واحدة", () => {
    const c = part("c", { audioSec: 30, rows: [{ plate: "حبك1234", support: 2, t_s: 2 }] }, { startedAtMs: 1 });
    const d = part("d", {
      audioSec: 30,
      rows: [{ plate: "حبك1234", support: 2, t_s: 1 }, { plate: "درن1452", support: 2, t_s: 5 }],
    }, { startedAtMs: 2 });
    const rr = buildSessionReport(buildSessionReport(undefined, c, S3, NOW), d, S3, NOW);
    expect(rr.got).toBe(2);
    expect(rr.out.map((o) => [o.plate, o.rec, Boolean(o.again)])).toEqual([
      ["حبك1234", 1, false],
      ["حبك1234", 2, true],
      ["درن1452", 2, false],
    ]);
    expect(rr.repeats).toBe(1);
    const t = reportText(rr);
    expect(t).toContain("🔁 1 لوحة طلعت في أكتر من تسجيل");
    expect(t).toContain("حبك1234 · تسجيل 2 · طلعت قبل كده (اتعدّت مرة واحدة)");
    // تسجيل واحد ⇒ مافيش علامات تسجيلات
    expect(buildSessionReport(undefined, c, S3, NOW).out[0]).toEqual(buildBatchReport({ sheet: S3, ...c.input, now: NOW }).out[0]);
  });
});

describe("عيب ٥ — أرقام الشاهد لكل تسجيل لوحده (مش متجمّعة من كل التسجيلات)", () => {
  it("اختراع في التسجيل التاني أرقامه الشاهد سمعها في التسجيل الأول للوحة تانية ⇒ لسه اختراع", () => {
    const a = part("a", { audioSec: 30, rows: [{ plate: "حبك1234", support: 2, t_s: 2 }], cohereDigits: ["1234"] }, { startedAtMs: 1 });
    const b = part("b", {
      audioSec: 30,
      rows: [{ plate: "درن1452", support: 2, t_s: 2 }, { plate: "زور1234", support: 2, t_s: 9 }],
      cohereDigits: ["1452"],
    }, { startedAtMs: 2 });
    const alone = buildBatchReport({ sheet: S3, ...b.input, now: NOW });
    expect(alone.inventions).toBe(1);
    const r = buildSessionReport(buildSessionReport(undefined, a, S3, NOW), b, S3, NOW);
    expect(r.inventions).toBe(1);
    expect(r.extras.find((x) => x.plate === "زور1234")!.reason).toContain("🔴 اختراع");
  });
});

describe("عيب ٤ — ترتيب التسجيلات بمكانها في الورقة (وقت ملف مرفوع ممكن يبقى غلط)", () => {
  const sheet = parseReadingSheet("حبك1111\nحبك2222\nحبك3333\nدرن4444\nدرن5555\nدرن6666");
  // التسجيل A (حروف حبك) آخر مقطع فيه سمع «حبك3334» — بس وقت ملفه بعد B
  const A = part("A", {
    audioSec: 30,
    rows: [{ plate: "حبك1111", support: 2, t_s: 2 }, { plate: "حبك2222", support: 2, t_s: 10 }],
    seqs: [["حبك1111", "حبك2222"], ["حبك2222", "حبك3334"]],
    chunks: [{ start: 0, end: 16, text: "حبك1111 حبك2222" }, { start: 12, end: 30, text: "حبك2222 حبك3334" }],
    cuts: [[0, 16], [12, 30]],
  }, { startedAtMs: 9000, label: "A" });
  const B = part("B", {
    audioSec: 30,
    rows: [{ plate: "درن4444", support: 2, t_s: 2 }, { plate: "درن5555", support: 2, t_s: 10 }, { plate: "درن6666", support: 2, t_s: 20 }],
    seqs: [["درن4444", "درن5555"], ["درن5555", "درن6666"]],
    chunks: [{ start: 0, end: 16, text: "درن4444 درن5555" }, { start: 12, end: 30, text: "درن5555 درن6666" }],
    cuts: [[0, 16], [12, 30]],
  }, { startedAtMs: 1000, label: "B" });

  it("التسجيلات بترتيب الورقة — والدليل للوحة الضايعة من مقاطع تسجيلها هي", () => {
    const r = buildSessionReport(buildSessionReport(undefined, A, sheet, NOW), B, sheet, NOW);
    expect(r.parts!.map((p) => p.clipId)).toEqual(["A", "B"]);
    const m = r.missed.find((x) => x.plate === "حبك3333")!;
    expect(m.evidence!.reads.every((x) => x.i <= 1)).toBe(true);
    expect(m.evidence!.reads.map((x) => x.read)).toContain("حبك3334");
    expect(diagText(r)).toContain("(تسجيل 1 ·");
  });

  it("تسجيل مالوش ولا لوحة من الورقة ⇒ الترتيب بلحظة التسجيل زي الأول", () => {
    const noise = part("N", { audioSec: 5, rows: [{ plate: "زور9999", support: 2, t_s: 1 }] }, { startedAtMs: 500 });
    const r = buildSessionReport(buildSessionReport(buildSessionReport(undefined, A, sheet, NOW), B, sheet, NOW), noise, sheet, NOW);
    expect(r.parts!.map((p) => p.clipId)).toEqual(["N", "B", "A"]);
  });
});

/* ---------------------------------------- اختيار التقرير وحفظه (planSessionSave) */

const recOf = (clipId: string, plates: string[], at: number, run = `run-${clipId}`) =>
  part(clipId, { audioSec: 20, rows: plates.map((p, i) => ({ plate: p, support: 2, t_s: 2 + i * 3 })), run }, { startedAtMs: at });

describe("عيب ٢ — «فرّغ تاني» لمقطع من جلسة قديمة بيرجع لتقريره هو", () => {
  it("المقطع جوّه تقرير مقفول ⇒ بيتحدّث هناك (ومايدخلش الجلسة المفتوحة)", () => {
    const c1 = recOf("c1", ["حبك1234"], 1000);
    const c2 = recOf("c2", ["درن1452"], 2000);
    let s1 = buildSessionReport(undefined, c1, S3, NOW);
    s1 = { ...buildSessionReport(s1, c2, S3, NOW + 1000), closed: true };
    const s2 = buildSessionReport(undefined, recOf("d1", ["سصع5555"], 5000), S3, NOW + 2000);
    const again = recOf("c2", ["درن1452"], 2000, "run-c2-b");
    const plan = planSessionSave([s2, s1], again, S3, NOW + 3000);
    expect(plan.report.id).toBe(s1.id);
    expect(plan.report.parts!.map((p) => p.clipId)).toEqual(["c1", "c2"]);
    expect(plan.report.closed).toBe(true);
    expect(plan.also.map((x) => x.id)).not.toContain(s2.id);
  });

  it("مقطع جديد ⇒ الجلسة المفتوحة زي الأول", () => {
    const s = buildSessionReport(undefined, recOf("c1", ["حبك1234"], 1000), S3, NOW);
    const plan = planSessionSave([s], recOf("c2", ["درن1452"], 2000), S3, NOW + 1000);
    expect(plan.report.id).toBe(s.id);
    expect(plan.also).toEqual([]);
  });
});

describe("عيب ٩ — «فرّغ تاني» مابيمسحش نتيجة التفريغ اللي قبله", () => {
  it("تشغيلة جديدة لنفس المقطع ⇒ نسخة مقفولة من التقرير القديم بأرقامه + التقرير مكمّل بالجديد", () => {
    const s = buildSessionReport(undefined, realPart(), REAL_SHEET, NOW);
    expect(s.correct).toBe(57);
    const runB = realPart({ rows: FIX.plates.slice(10), run: "runB" });
    const plan = planSessionSave([s], runB, REAL_SHEET, NOW + 60_000);
    expect(plan.report.id).toBe(s.id);
    expect(plan.report.correct).toBeLessThan(57);
    expect(plan.also).toHaveLength(1);
    const snap = plan.also[0];
    expect(snap.id).not.toBe(s.id);
    expect(snap.closed).toBe(true);
    expect(snap.snapshotOf).toBe(s.id);
    expect(snap.correct).toBe(57);
    expect(snap.run).toBe(FIX.run);
    expect(snap.label).toContain("قبل «فرّغ تاني»");
    // النسخة مابتتختارش كتقرير مفتوح ولا بيرجعلها مقطع
    expect(pickSessionReport([snap], sheetKey(REAL_SHEET), NOW + 60_000)).toBeUndefined();
    const next = planSessionSave([plan.report, snap], realPart({ run: "runC" }), REAL_SHEET, NOW + 120_000);
    expect(next.report.id).toBe(s.id);
  });

  it("نفس التشغيلة اتحفظت تاني ⇒ مافيش نسخة", () => {
    const s = buildSessionReport(undefined, realPart(), REAL_SHEET, NOW);
    expect(planSessionSave([s], realPart(), REAL_SHEET, NOW + 1000).also).toEqual([]);
  });
});

describe("عيب ٨ — الورقة اتقرت تاني ⇒ تقرير لوحده (مش اتحاد القرايتين)", () => {
  const round2 = realPart({ rows: REAL_PLATES.map((p, i) => ({ plate: p, support: 3, t_s: 2 + i * 3 })), run: "round2" });

  it("قراية كاملة تانية ⇒ تقرير جديد، والأول بيتقفل بأرقامه زي ما هي", () => {
    const s1 = buildSessionReport(undefined, realPart(), REAL_SHEET, NOW);
    const plan = planSessionSave([s1], { ...round2, clipId: "clip-2", startedAtMs: 9_000 }, REAL_SHEET, NOW + 2 * 3_600_000);
    expect(plan.report.id).not.toBe(s1.id);
    expect(plan.report.parts).toHaveLength(1);
    expect(plan.report.rereadOf).toBe(s1.id);
    expect(plan.report.correct).toBe(60);
    expect(plan.also).toEqual([{ ...s1, closed: true }]);
    expect(plan.also[0].missed).toHaveLength(3);
    expect(reportText(plan.report)).toContain("🔁 الورقة دي اتقرت تاني");
  });

  it("تسجيل بيكمّل الورقة ومعاد لوحة أو اتنين على الحدود ⇒ بيدخل نفس التقرير", () => {
    const sheet = parseReadingSheet(REAL_LINES.slice(0, 12).join("\n"));
    const p1 = recOf("p1", REAL_PLATES.slice(0, 6), 1000);
    const p2 = recOf("p2", REAL_PLATES.slice(4, 12), 2000);
    expect(isReRead([p1], p2, sheet)).toBe(false);
    const s = buildSessionReport(undefined, p1, sheet, NOW);
    const plan = planSessionSave([s], p2, sheet, NOW + 1000);
    expect(plan.report.id).toBe(s.id);
    expect(plan.report.parts).toHaveLength(2);
  });

  it(`الحد: ${REREAD_MIN} لوحات صح متكررة أو أكتر وخُمس اللي التسجيل جابه صح ⇒ قراية تانية`, () => {
    const sheet = parseReadingSheet(REAL_LINES.slice(0, 12).join("\n"));
    const p1 = recOf("p1", REAL_PLATES.slice(0, 8), 1000);
    expect(isReRead([p1], recOf("p2", REAL_PLATES.slice(0, 8), 2000), sheet)).toBe(true);
    expect(isReRead([p1], recOf("p2", REAL_PLATES.slice(6, 12), 2000), sheet)).toBe(false);
  });
});

describe("عيب ٣ — «شيل التسجيل ده» من التقرير (بإيد المالك)", () => {
  it("بيشيل التسجيل ويبني التقرير من جديد على الباقي — نفس المعرّف", () => {
    const r = buildSessionReport(buildSessionReport(buildSessionReport(undefined, REC_A, SHEET, NOW), REC_B, SHEET, NOW), REC_C, SHEET, NOW);
    const out = removePart(r, "clip-C", NOW + 5000)!;
    const ref = buildSessionReport(buildSessionReport(undefined, REC_A, SHEET, NOW), REC_B, SHEET, NOW);
    expect(out.id).toBe(r.id);
    expect(out.createdAt).toBe(r.createdAt);
    expect(out.updatedAt).toBe(NOW + 5000);
    expect(out.parts!.map((p) => p.clipId)).toEqual(["clip-A", "clip-B"]);
    expect(out.extras).toEqual(ref.extras);
    expect(out.inventions).toBe(0);
    expect(out.audioSec).toBe(70);
    expect(out.label).toBe(ref.label);
  });

  it("مابيشيلش: آخر تسجيل · مقطع مش فيه · نسخة «قبل فرّغ تاني» · تقرير من غير ورقة محفوظة", () => {
    const one = buildSessionReport(undefined, REC_A, SHEET, NOW);
    const two = buildSessionReport(one, REC_B, SHEET, NOW);
    expect(removePart(one, "clip-A", NOW)).toBeUndefined();
    expect(removePart(two, "nope", NOW)).toBeUndefined();
    expect(removePart({ ...two, snapshotOf: "x" }, "clip-A", NOW)).toBeUndefined();
    const { sheet: _s, ...noSheet } = two;
    expect(removePart(noSheet as BatchReport, "clip-A", NOW)).toBeUndefined();
  });
});

describe("عيب ١٠ — لوحات في تسجيل لسه ماتفرّغش مش غلط موديل", () => {
  const EXTRA = ["حبك1234", "درن1452", "سصع5555", "طلع2222"];
  const sheet = parseReadingSheet([...REAL_LINES, ...EXTRA].join("\n"));
  const r = buildSessionReport(undefined, realPart(), sheet, NOW);

  it("اللي بعد آخر لوحة اتسمعت في الورقة ⇒ «غالباً في تسجيل لسه ماتفرّغش» ومتعدّين لوحدهم", () => {
    for (const p of EXTRA) {
      const m = r.missed.find((x) => x.plate === p)!;
      expect(m.notYet, p).toBe(true);
      expect(m.reason).toContain("ولا الموديل ولا الشاهد سمعوها");
      expect(m.reason).toContain("لسه ماتفرّغش");
    }
    expect(r.notYet).toBe(4);
    // الـ٣ الضايعين في النص زي ما هم
    expect(r.missed.filter((m) => !m.notYet).map((m) => m.plate).sort()).toEqual(["انا7675", "حوص4168", "رصد1205"].sort());
    expect(reportText(r)).toContain("⏳ 4 من الضايعة");
  });

  it("قبل أول لوحة اتسمعت ⇒ نفس الحكاية (التسجيل الأول لسه ماتفرّغش)", () => {
    const s2 = parseReadingSheet([...EXTRA, ...REAL_LINES].join("\n"));
    const r2 = buildSessionReport(undefined, realPart(), s2, NOW);
    expect(r2.notYet).toBe(4);
    expect(r2.missed.find((x) => x.plate === "حبك1234")!.reason).toContain("قبل أول لوحة");
  });

  it("تسجيل في النص ماتفرّغش (وقع «لوحات بس») ⇒ لوحاته بين تسجيلين متعلّمة — ومش في تسجيل واحد", () => {
    const nine = REAL_PLATES.slice(0, 9);
    const sh = parseReadingSheet(REAL_LINES.slice(0, 9).join("\n"));
    const r1 = recOf("r1", nine.slice(0, 3), 1000);
    const r3x = recOf("r3", nine.slice(6, 9), 3000);
    const rr = buildSessionReport(buildSessionReport(undefined, r1, sh, NOW), r3x, sh, NOW);
    expect(rr.missed.map((m) => [m.plate, Boolean(m.notYet)])).toEqual(nine.slice(3, 6).map((p) => [p, true]));
    expect(rr.missed[0].reason).toContain("بين تسجيلين");
    // نفس الفجوة جوّه تسجيل واحد ⇒ الموديل فعلاً ماسمعهاش (زي الأول)
    const one = buildSessionReport(undefined, recOf("one", [...nine.slice(0, 3), ...nine.slice(6, 9)], 1000), sh, NOW);
    expect(one.missed.every((m) => !m.notYet)).toBe(true);
    expect(one.notYet).toBeUndefined();
  });

  it("مافيش ولا لوحة طلعت ⇒ مابيتعلّمش (التفريغ نفسه مطلّعش حاجة)", () => {
    const r0 = buildBatchReport({ sheet: S3, rows: [], audioSec: 10, elapsedMs: 1 });
    expect(r0.notYet).toBeUndefined();
    expect(r0.missed.every((m) => !m.notYet)).toBe(true);
  });
});

describe("عيب ١١/٦ — حجم التقرير المحفوظ", () => {
  it("التقرير المحفوظ مافيهوش التشخيص مرتين: بيتبني من التسجيلات وقت العرض — ونفس النص بالظبط", () => {
    const r = buildSessionReport(undefined, realPart({ dropped: REAL_LONE }), REAL_SHEET, NOW);
    const stored = storedReport(r);
    expect(stored.diag).toBeUndefined();
    expect(hasReportDiag(stored)).toBe(true);
    expect(diagText(withDiag(stored))).toBe(diagText(r));
    const r3b = buildSessionReport(buildSessionReport(buildSessionReport(undefined, REC_A, SHEET, NOW), REC_B, SHEET, NOW), REC_C, SHEET, NOW);
    expect(diagText(withDiag(storedReport(r3b)))).toBe(diagText(r3b));
    // التقارير القديمة (من غير تسجيلات) بتتحفظ زي ما هي
    const legacy = buildBatchReport({ sheet: REAL_SHEET, ...realPart().input, now: NOW });
    expect(storedReport(legacy)).toBe(legacy);
    expect(withDiag(legacy)).toBe(legacy);
  });

  const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

  it("تسجيل واحد محفوظ: نص المقاطع وكوهير متخزّن مرة واحدة بس", () => {
    const p = realPart({ dropped: REAL_LONE });
    const old = buildBatchReport({ sheet: REAL_SHEET, ...p.input, now: NOW });
    const full = buildSessionReport(undefined, p, REAL_SHEET, NOW);
    const stored = storedReport(full);
    // قبل الإصلاح: التقرير كله + نص كل مقطع مرة تانية جوّه التسجيل (~٢.٢ ضعف القديم)
    expect(bytes(stored)).toBeLessThanOrEqual(bytes(full) - bytes(full.diag));
    // الباقي = اللي إعادة البنا محتاجاه (اللوحات · السلاسل · الحدود · الورقة)
    expect(bytes(stored)).toBeLessThanOrEqual(bytes(old) * 1.75);
  });

  it("نص طويل جداً في تسجيل ⇒ بيتقص في التسجيل نفسه (التقرير المحفوظ تحت ~٢٠٠ كيلو)", () => {
    // كلام حقيقي (كلمات بمسافات) — ~٢٨٠ كيلو للنص الواحد
    const big = "سين ".repeat(40_000);
    const a = part("a", { audioSec: 30, seqs: [["حبك1234"]], chunks: [{ start: 0, end: 28, text: big }], cohereTexts: [big] }, { startedAtMs: 1 });
    const b = part("b", { audioSec: 30, seqs: [["درن1452"]], chunks: [{ start: 0, end: 28, text: "درن1452" }], cohereTexts: ["دال را نون"] }, { startedAtMs: 2 });
    const r = buildSessionReport(buildSessionReport(undefined, a, SHEET, NOW), b, SHEET, NOW);
    expect(bytes(storedReport(r))).toBeLessThanOrEqual(200_000);
    expect(r.diagCut).toBe(2);
    const d = diagText(withDiag(storedReport(r)));
    expect(d).toContain("اتقص");
    expect(d.match(/…\[اتقص\]/g)).toHaveLength(2);
    expect(r.diag![1]).toMatchObject({ m: "درن1452", c: "دال را نون" });
  });
});

describe("عيب ١٢ — الورقة اتغيّرت والتقرير المفتوح على الورقة القديمة", () => {
  it("newestOpenSession بيلاقي المفتوح بأي ورقة — عشان الكارت يقول «الورقة اتغيّرت»", () => {
    const s = buildSessionReport(undefined, REC_A, SHEET, NOW);
    expect(newestOpenSession([s], NOW + 1000)?.id).toBe(s.id);
    expect(newestOpenSession([{ ...s, closed: true }], NOW + 1000)).toBeUndefined();
    expect(newestOpenSession([s], NOW + SESSION_WINDOW_MS + 1)).toBeUndefined();
    const changed = sheetKey(parseReadingSheet("حبك1234 فان\nدرن1452 ونيت"));
    expect(pickSessionReport([s], changed, NOW + 1000)).toBeUndefined();
    expect(newestOpenSession([s], NOW + 1000)!.sheetKey).not.toBe(changed);
  });
});

describe("🛟 cohereRescued في التقرير الواحد (٤ أكتوبر)", () => {
  it("بيتجمّع من كل التسجيلات ورقم الصف بيتزاح زي cohereFixed", () => {
    const mk = (clipId: string, start: number, rows: Array<{ plate: string; t_s: number }>, resc: unknown[]) => ({
      clipId, startedAtMs: start,
      input: { rows: rows.map((r) => ({ ...r, support: 2 })), dropped: [], seqs: [rows.map((r) => r.plate)],
        chunks: [{ start: 0, end: 20, text: "" }], cuts: [[0, 20]], cohereTexts: [""], cohereDigits: [],
        cohereRescued: resc, audioSec: 20, elapsedMs: 1000 },
    });
    const a = mk("a", 1, [{ plate: "حدي1853", t_s: 2 }, { plate: "بعو1458", t_s: 5 }], []);
    const b = mk("b", 2, [{ plate: "امس4522", t_s: 2 }, { plate: "ردي1204", t_s: 4 }], [{ plate: "ردي1204", row: 1, heard: 4 }]);
    const c = combineParts([a, b] as never);
    expect(c.cohereRescued).toEqual([{ plate: "ردي1204", row: 3, heard: 4 }]);
  });
});
