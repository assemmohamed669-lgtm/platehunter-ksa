/**
 * **قاعدة المالك (٢٠٢٦-٠٩-٢١): لو قال ٣ لوحات مطلوبة ورا بعض — حتى بسرعة —
 * التلاتة يطلعوا وكل واحدة تدق جرسها.**
 *
 * الاختبار ده بيمشّي السلسلة الحقيقية من طرف لطرف:
 *   محرك الإجماع → اللوحات المعتمَدة → البحث التام في ملف التشييك → طابور الإنذار
 * بالمكوّنات الحقيقية، مش بمحاكاة.
 */
import { describe, it, expect } from "vitest";
import { LiveConsensus } from "@/lib/liveConsensus";
import { buildCombinedCheckIndex } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { pushAlert, dropCurrent, type QueuedAlert } from "@/lib/wantedAlertQueue";

/** ملف تشييك فيه التلات لوحات المطلوبة + واحدة مش مطلوبة. */
const CHECK_ROWS = [
  { "رقم اللوحة": "حبك 1234", "الحي": "النسيم" },
  { "رقم اللوحة": "حبك 1235", "الحي": "الملز" },
  { "رقم اللوحة": "حبك 1236", "الحي": "الصفا" },
];
const checkIndex = buildCombinedCheckIndex([{ headers: ["رقم اللوحة", "الحي"], rows: CHECK_ROWS }]);

/** نفس اللي `searchInCheck` بيعمله: تطبيع + بحث تام. */
const isWanted = (plate: string) => checkIndex.has(normalizePlate(bankPlateToArabic(plate)));

/** يمشّي القراءات في السلسلة كلها ويرجّع طابور الإنذار. */
function chain(reads: { plate: string; tMs: number; conf: number }[]): QueuedAlert[] {
  const c = new LiveConsensus();
  for (const x of reads) c.add(x);
  let queue: QueuedAlert[] = [];
  for (const committed of c.flush()) {
    if (!isWanted(committed.plate)) continue;                 // تطابق تام بس
    queue = pushAlert(queue, { plate: committed.plate, matchType: "exact" });
  }
  return queue;
}

describe("٣ لوحات مطلوبة ورا بعض", () => {
  it("**بسرعة** (١.٢ث بينهم) → ٣ إنذارات", () => {
    const q = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك1235", tMs: 1200, conf: 0.92 },
      { plate: "حبك1236", tMs: 2400, conf: 0.91 },
    ]);
    expect(q.map((a) => a.plate)).toEqual(["حبك1234", "حبك1235", "حبك1236"]);
  });

  it("**ببطء** (٣.٥ث بينهم) → ٣ إنذارات كمان", () => {
    const q = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك1235", tMs: 3500, conf: 0.92 },
      { plate: "حبك1236", tMs: 7000, conf: 0.91 },
    ]);
    expect(q).toHaveLength(3);
  });

  it("كل واحدة اتقرت نافذتين (الحالة الشائعة) → ٣ إنذارات", () => {
    const q = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 }, { plate: "حبك1234", tMs: 1200, conf: 0.92 },
      { plate: "حبك1235", tMs: 2400, conf: 0.92 }, { plate: "حبك1235", tMs: 3600, conf: 0.91 },
      { plate: "حبك1236", tMs: 4800, conf: 0.91 }, { plate: "حبك1236", tMs: 6000, conf: 0.90 },
    ]);
    expect(q.map((a) => a.plate)).toEqual(["حبك1234", "حبك1235", "حبك1236"]);
  });

  it("السرعة مايصحّش تغيّر العدد — الشرط بالنص", () => {
    const fast = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك1235", tMs: 900, conf: 0.92 },
      { plate: "حبك1236", tMs: 1800, conf: 0.91 },
    ]);
    const slow = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك1235", tMs: 5000, conf: 0.92 },
      { plate: "حبك1236", tMs: 10000, conf: 0.91 },
    ]);
    expect(fast.length).toBe(slow.length);
    expect(fast.length).toBe(3);
  });

  it("كل إنذار بدوره — «تم» بتوري اللي بعده لحد ما يخلصوا", () => {
    let q = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك1235", tMs: 1200, conf: 0.92 },
      { plate: "حبك1236", tMs: 2400, conf: 0.91 },
    ]);
    const shown: string[] = [];
    while (q.length) { shown.push(q[0].plate); q = dropCurrent(q); }
    expect(shown).toEqual(["حبك1234", "حبك1235", "حبك1236"]);
  });

  it("اللوحة اللي مش في الشيت مابتدقّش جرس", () => {
    const q = chain([
      { plate: "حبك1234", tMs: 0, conf: 0.93 },
      { plate: "حبك9999", tMs: 1200, conf: 0.92 },   // مش في الشيت
    ]);
    expect(q.map((a) => a.plate)).toEqual(["حبك1234"]);
  });

  it("٥٠ لوحة مطلوبة ورا بعض — ٥٠ إنذار، ولا واحدة تضيع", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ "رقم اللوحة": `دوا ${7000 + i}` }));
    const idx = buildCombinedCheckIndex([{ headers: ["رقم اللوحة"], rows }]);
    const c = new LiveConsensus();
    for (let i = 0; i < 50; i++) c.add({ plate: `دوا${7000 + i}`, tMs: i * 1100, conf: 0.93 });
    let q: QueuedAlert[] = [];
    for (const p of c.flush()) {
      if (!idx.has(normalizePlate(bankPlateToArabic(p.plate)))) continue;
      q = pushAlert(q, { plate: p.plate, matchType: "exact" });
    }
    expect(q).toHaveLength(50);
  });
});
