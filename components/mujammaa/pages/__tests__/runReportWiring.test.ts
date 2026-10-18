// @vitest-environment node
// (نص الصفحة بيتقري بـ`import.meta.url` = ملف — في jsdom مش ملف)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 📋 تقرير كل تسجيل للسيرفر (١٨ أكتوبر ٢٠٢٦) — المالك: «أهم حاجه عايزين نعرف كل التقارير عن التسجيل».
 * حرّاس على الربط في `BatchPage`: التقرير بيتبعت بعد **كل** تفريغ (نجح أو فشل — وأهمه اللي ماوصلش
 * السيرفر)، في الخلفية من غير ما يأخّر الطابور، وبالموقع النهائي للوحات.
 */
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

const runQueueBody = (() => {
  const i = SRC.indexOf("const runQueue = async");
  return SRC.slice(i, SRC.indexOf("const runTranscription = async", i));
})();

describe("📋 تقرير التسجيل — الربط", () => {
  it("بيتبعت في الخلفية (مافيش await) وبحساب المندوب", () => {
    expect(SRC).toMatch(/import \{[^}]*\bbuildRunReport\b[^}]*\bsendRunReport\b[^}]*\} from "\.\.\/lib\/runTelemetry"/);
    expect(SRC).toMatch(/import \{ currentSession \} from "@\/lib\/authSession"/);
    expect(SRC).toMatch(/void currentSession\(\)\s*\.then\(/);
    expect(SRC).not.toMatch(/await\s+sendRunReport\(/);
    expect(SRC).not.toMatch(/await\s+queueRunReport\(/);
  });

  it("بعد كل مقطع في الطابور — بعد الموقع النهائي (clipRunOutcome) ونجح أو فشل", () => {
    const iOutcome = runQueueBody.indexOf("const outcome = clipRunOutcome(");
    const iReport = runQueueBody.indexOf("queueRunReport(");
    expect(iOutcome).toBeGreaterThan(0);
    expect(iReport).toBeGreaterThan(iOutcome);
    // مش جوّه if (ok) — الفشل أهم تقرير
    const before = runQueueBody.slice(iOutcome, iReport);
    expect(before).not.toMatch(/if \(ok\) \{\s*$/);
    expect(runQueueBody).toMatch(/kind: info\?\.responded \? "run" : "fail"/);
    expect(runQueueBody).toMatch(/entries: ok \? outcome\.entries : entriesRef\.current/);
    expect(runQueueBody).toMatch(/errors: sinceJob\.map\(/);
  });

  it("التوقيتات: الرفع (أول رد) وأول لوحات والكل — ومعرّف الأرشيف", () => {
    expect(SRC).toMatch(/runInfoRef\.current = \{ responded: false \}/);
    expect(SRC).toMatch(/uploadMs: performance\.now\(\) - startedAt/);
    expect(SRC).toMatch(/platesMs = performance\.now\(\) - startedAt/);
    expect(SRC).toMatch(/run: typeof data\?\.run === "string" \? data\.run : undefined/);
  });

  it("🚦 الطابور: أطول رقم واستنى قد إيه", () => {
    const i = SRC.indexOf("const onQueue = (pos: number | null) =>");
    const body = SRC.slice(i, SRC.indexOf("const onPlates", i));
    expect(body).toMatch(/queuePosMax: Math\.max\(/);
    expect(body).toMatch(/queuedMs: performance\.now\(\) - /);
    expect(SRC).toMatch(/queuedMs: info\?\.queuedMs, queuePosMax: info\?\.queuePosMax/);
  });

  it("📤 التصدير للسجلات بيتبعت بتقريره — اتحفظ/فشل/من غير موقع/عدّل/مسح", () => {
    const i = SRC.indexOf("const exportToRecords = async");
    const body = SRC.slice(i, SRC.indexOf("const copyAll = async", i));
    expect(body).toMatch(/queueRunReport\(\{\s*kind: "export"/);
    expect(body).toMatch(/saved: saved\.size, failed: res\.failed, total: list\.length, no_pin: noPin/);
    expect(body).toMatch(/edited: editCountRef\.current, deleted: deleteCountRef\.current/);
    // العدّ بيتصفّر بعد التصدير بس لو اتحفظ حاجة
    expect(body).toMatch(/editCountRef\.current = 0;\s*deleteCountRef\.current = 0;/);
    for (const fn of ["const editEntry", "const annotateEntry"]) {
      const j = SRC.indexOf(fn);
      expect(SRC.slice(j, j + 400)).toMatch(/editCountRef\.current \+= 1/);
    }
    const k = SRC.indexOf("const removeEntry");
    expect(SRC.slice(k, k + 300)).toMatch(/deleteCountRef\.current \+= 1/);
  });

  it("حجم المقطع بيتاخد قبل ما الصوت يتشال من الذاكرة", () => {
    const iBytes = runQueueBody.indexOf("const clipBytes = next.blob.size");
    const iFree = runQueueBody.indexOf("mark({ blob: new Blob() })");
    expect(iBytes).toBeGreaterThan(0);
    expect(iBytes).toBeLessThan(iFree);
  });
});
