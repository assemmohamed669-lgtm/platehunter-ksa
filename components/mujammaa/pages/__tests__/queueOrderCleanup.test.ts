// @vitest-environment node
// (نص الصفحة بيتقري بـ`import.meta.url` = ملف — في jsdom مش ملف)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 🧮 الربط في `BatchPage` (١٨ أكتوبر ٢٠٢٦):
 *  · «تفريغ» بياخد رقمه **لحظة الدوسة** (قبل أي قراية من التخزين) والطابور بيختار بـ`pickNextJob`.
 *  · التسجيل مفتوح والتفريغ شغّال (زرار التسجيل مقفول وقت قفل المقطع اللي قبله بس).
 *  · المالك: «بعد مايتعمل تصدير للوحات دي تتمسح مباشرة» ⇒ المقطع اللي كل لوحاته اتصدّرت بيتمسح من الموبايل.
 */
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const fn = (start: string, end: string) => {
  const i = SRC.indexOf(start);
  return SRC.slice(i, SRC.indexOf(end, i + start.length));
};

describe("الطابور بالترتيب", () => {
  const tc = fn("const transcribeClip = async (id: string) => {", "/** ▶ اسمع المقطع المحفوظ");

  it("الرقم بيتاخد لحظة الدوسة — قبل قراية الصوت من التخزين", () => {
    const iSeq = tc.indexOf("const seq = ++queueSeqRef.current;");
    const iPrep = tc.indexOf("preparingRef.current.set(id, seq);");
    const iAwait = tc.indexOf("await getClipStore()");
    expect(iSeq).toBeGreaterThan(0);
    expect(iPrep).toBeGreaterThan(iSeq);
    expect(iAwait).toBeGreaterThan(iPrep);
    expect(tc).toMatch(/order: seq,/);
  });

  it("بعد التجهيز (نجح أو فشل) الطابور بيتشغّل — عشان اللي بعده مايفضلش مستني", () => {
    expect(tc).toMatch(/finally \{\s*queuingRef\.current\.delete\(id\);\s*preparingRef\.current\.delete\(id\);\s*void runQueue\(\);\s*\}/);
  });

  it("العامل بياخد بـpickNextJob (واحد في المرة)", () => {
    const rq = fn("const runQueue = async () => {", "const runTranscription = async");
    expect(rq).toMatch(/const next = pickNextJob\(clipsRef\.current, preparingRef\.current\.values\(\)\);/);
    expect(rq).toMatch(/if \(workerRef\.current\) return;\s*workerRef\.current = true;/);
  });

  it("التسجيل مفتوح والتفريغ شغّال — الزرار بيتقفل وقت قفل المقطع اللي قبله بس", () => {
    expect(SRC).toMatch(/<button className="btn-primary" onClick=\{startRecording\} disabled=\{finalizing\}>/);
    const sr = fn("const startRecording = async () => {", "const startRecordingInner = async");
    expect(sr).toMatch(/if \(finalizingRef\.current \|\| recorderRef\.current \|\| startingRef\.current\) return;/);
    expect(sr).not.toMatch(/workerRef|canStopTranscription|clipsRef/);
  });
});

describe("المقطع بيتمسح من الموبايل بعد ما لوحاته كلها تتصدّر", () => {
  const ex = fn("const exportToRecords = async () => {", "const copyAll = async");
  it("كل اللوحات اتحفظت ⇒ مسح المقطع (صوته ولوحاته) — اللي فشل ⇒ المقطع يفضل", () => {
    expect(ex).toMatch(/if \(left\.length === 0\) \{[\s\S]*?if \(exportClipId\) await deleteClip\(exportClipId\);/);
    const iSave = ex.indexOf("await saveTableToClip(left, { exported: saved.size, clipId: exportClipId });");
    const iDel = ex.indexOf("await deleteClip(exportClipId)");
    expect(iSave).toBeGreaterThan(0);
    expect(iDel).toBeGreaterThan(iSave);
  });
});
