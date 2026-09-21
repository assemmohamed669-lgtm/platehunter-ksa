/**
 * **قرار المالك (٢٠٢٦-٠٩-٢١): المطلوب يظهر بتطابق تام بس — مايظهرش لوحات
 * متشابهة أبداً، لا في التشييك ولا في أي مسار فرز.**
 *
 * حارس على الملفات نفسها: أي مطابقة تقريبية ترجع لمسار المطلوب هتفشل هنا.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { similarityPercent, isStandardPlate } from "@/lib/plateParser";

const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const CHECK = read("app/(app)/instant-check/page.tsx");
const SORT = read("app/(app)/sorting/page.tsx");

describe("صفحة التشييك — تطابق تام بس", () => {
  it("مفيش أي مطابقة تقريبية على اللوحات", () => {
    expect(CHECK).not.toContain("similarityPercent(");
  });

  it("الفهرس بيتسأل بالمطابقة التامة (checkIndex.get / has)", () => {
    expect(CHECK).toContain("checkIndex.get(normalized)");
  });

  it("اللوحة المطلوبة بتطابق تام مابتتبلعش من حارس التوأم", () => {
    expect(CHECK).toContain("const wantedExact = checkIndex.has(");
    expect(CHECK).toContain("if (mult !== undefined && !wantedExact)");
  });
});

describe("الفرز — تطابق تام في كل المسارات", () => {
  it("مفيش مفاتيح «حروف معكوسة» متحقونة في أي فهرس", () => {
    expect(SORT).not.toContain("reversePlateLetters(");
  });

  it("كل نداء لـmatchTokensAgainstRows بيقفل التقريبي صراحة", () => {
    const calls = SORT.match(/matchTokensAgainstRows\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c, c).toContain("false");
  });

  it("نتيجة الفرز بتتوسم exact بس", () => {
    expect(SORT).not.toContain('status: "fuzzy"');
  });
});

describe("ليه الفرع التقريبي القديم مكانش بيشتغل أصلاً", () => {
  it("أقصى تشابه بين لوحتين قياسيتين مختلفتين = ٨٦٪ — تحت عتبة الـ٨٨", () => {
    // ده بيوثّق إن شيل الفرع مابيغيّرش أي نتيجة كانت بتحصل فعلاً.
    expect(similarityPercent("ابح1234", "ابح1235")).toBe(86);
    expect(similarityPercent("ابح1234", "ابد1234")).toBe(86);
    expect(isStandardPlate("ابح1234")).toBe(true);
  });
});

describe("التصدير idempotent — الضغط المتكرر مايكرّرش", () => {
  it("معرّف الصف مشتق من صف المصدر مش من الوقت", () => {
    expect(CHECK).toContain("id: `fc-ptt-${r.id}`");
    expect(CHECK).toContain("id: `fc-cam-${h.id}`");
    expect(CHECK).not.toContain("id: `${stamp}-${i}`");
  });

  it("قفل واحد بيغطّي أزرار التصدير والمصدّر التلقائي", () => {
    expect(CHECK).toContain("const exportBusyRef = useRef(false)");
    expect(CHECK).toContain("withExportLock");
    expect(CHECK).toContain("autoBusyRef.current || exportBusyRef.current");
  });

  it("زرار الصوت وزرار الكاميرا بيتقفلوا وقت التصدير", () => {
    const buttons = CHECK.match(/exportAll(Ptt|Hits)ToField\(\)\)\}[^>]*/g) ?? [];
    expect(buttons.length).toBe(2);
    for (const b of buttons) expect(b, b).toContain("disabled={exportBusy}");
  });

  it("تصدير الصوت بيحتفظ بوقت التشييك — عشان دمج المكرر يشتغل", () => {
    expect(CHECK).toContain("checkedAt: r.checkedAt ??");
  });
});
