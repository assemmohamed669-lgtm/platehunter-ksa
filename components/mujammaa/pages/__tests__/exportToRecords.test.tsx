/**
 * 📋 «تصدير للسجلات» من المجمّع (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «هيتحفظ هناك لما المندوب يصدر اللوحات اللي اتفرغت واول ما تتصدر وتتحفظ تلقائي تتمسح
 * واهم حاجه يقدر يعمل تعديل او يمسح لوحات منهم قبل ما يصدر».
 *  · التسجيل الجديد بيفضّي الجدول ⇒ اللوحات اللي لسه ماتصدّرتش لازم تفضل في مقطعها **بتعديلاتها**،
 *    والمقطع يقول «لسه ماتصدّرتش».
 *  · اللي اتحفظ فعلاً بس بيتشال (الفاشل بيفضل قدامه).
 *  · المندوب بيصدّر للسجلات بس — Excel/CSV/النسخ للسوبر أدمن (وأقفال التنزيل في صفحة السجلات).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ClipList from "../../components/ClipList";
import type { StoredClip } from "../../lib/clipStore";
import type { PlateEntry } from "../../lib/plateEntry";

const SRC = readFileSync(join(__dirname, "..", "BatchPage.tsx"), "utf8").replace(/\r\n/g, "\n");

function plate(p: string): PlateEntry {
  return {
    id: `plate-t-${p}`,
    review: { plate: p, heardPlate: p, letters: [...p.slice(0, 3)], digits: p.slice(3), confidence: 90, status: "solid", corrections: [], notes: [], raw: p, order: 1, needsAudioReview: false },
    pin: null,
    match: { kind: "none", similarity: 0 },
    capturedAt: 1,
    source: "batch",
  } as unknown as PlateEntry;
}

function clip(over: Partial<StoredClip> = {}): StoredClip {
  return {
    id: "c1",
    seq: 1,
    label: "تسجيل ١",
    startEpoch: 1_790_000_000_000,
    mime: "audio/webm",
    source: "record",
    status: "done",
    bytes: 1000,
    durationSec: 30,
    stamp: { events: [] },
    rawFixes: [],
    result: { at: 1, plates: 2, pinned: 0, entries: [plate("ابح1234"), plate("حطس5678")] },
    ...over,
  } as unknown as StoredClip;
}

const noop = () => {};
const list = (clips: StoredClip[], extra: Record<string, unknown> = {}) =>
  render(
    <ClipList
      clips={clips}
      recordingId={null}
      recordingSeconds={0}
      persistent
      storageWarn={null}
      tableRows={0}
      playing={null}
      onTranscribe={noop}
      onPlay={noop}
      onShow={noop}
      onDelete={noop}
      {...extra}
    />
  );

describe("ClipList — حالة التصدير تحت كل مقطع", () => {
  it("مقطع فيه لوحات ⇒ «لسه ماتصدّرتش» بالعدد", () => {
    list([clip()], { showExportState: true });
    expect(screen.getByText(/2 لوحة لسه ماتصدّرتش للسجلات/)).toBeTruthy();
  });

  it("اتصدّر كله ⇒ «اتصدّر للسجلات» بالعدد", () => {
    list([clip({ result: { at: 1, plates: 0, pinned: 0, entries: [], exportedAt: 5, exportedCount: 7 } } as Partial<StoredClip>)], {
      showExportState: true,
    });
    expect(screen.getByText(/اتصدّر للسجلات \(7 لوحة\)/)).toBeTruthy();
  });

  it("من غير التصدير للسجلات (الشكل القديم) ⇒ ولا كلمة", () => {
    list([clip()]);
    expect(screen.queryByText(/ماتصدّرتش/)).toBeNull();
  });

  it("تفريغ شغّال ⇒ الملاحظة بتقول استنى يخلص", () => {
    list([clip()], { showExportState: true, transcribing: true });
    expect(screen.getByText(/بعد ما التفريغ اللي شغّال يخلص/)).toBeTruthy();
  });

  it("المندوب (advanced=false) مابيشوفش أرقام التشخيص", () => {
    list([clip({ status: "ready", result: undefined } as Partial<StoredClip>)], { advanced: false });
    expect(screen.queryByText(/قراءة دقيقة/)).toBeNull();
  });
});

describe("BatchPage — وصلة التصدير (حرّاس على الكود)", () => {
  it("اللي اتحفظ فعلاً بس بيتشال، والمقطع بيتعلّم «اتصدّر»، والقايمة الفاضية بتتمسح من الجلسة", () => {
    const at = SRC.indexOf("const exportToRecords = async");
    const fn = SRC.slice(at, SRC.indexOf("const copyAll", at));
    expect(fn).toMatch(/const saved = new Set\(res\.savedEntryIds\);/);
    expect(fn).toMatch(/const left = list\.filter\(\(e\) => !saved\.has\(e\.id\)\);/);
    expect(fn).toMatch(/await saveTableToClip\(left, \{ exported: saved\.size \}\);/);
    expect(fn).toMatch(/if \(left\.length === 0\) \{\s*\/\/[^\n]*\n\s*clearSession\("batch"\);/);
    // لوحة من غير موقع ⇒ سؤال الأول (مابنخترعش موقع)
    expect(fn).toMatch(/window\.confirm\(/);
  });

  it("✏️ التعديل والمسح بيرجعوا للمقطع (التسجيل الجديد بيفضّي الجدول)", () => {
    for (const name of ["const annotateEntry", "const editEntry", "const removeEntry"]) {
      const i = SRC.indexOf(name);
      expect(SRC.slice(i, i + 400)).toMatch(/tableDirtyRef\.current = true;/);
    }
    expect(SRC).toMatch(/if \(!tableDirtyRef\.current\) return;\s*tableDirtyRef\.current = false;\s*entriesRef\.current = entries;\s*void saveTableToClip\(entries\)\.then\(/);
    // 🔴 مراجعة ١٨ أكتوبر: المقطع لسه مالوش نتيجة ⇒ التعديل يفضل مستني (كان بيضيع) — والقراية من التخزين
    expect(SRC).toMatch(/if \(!ok\) tableDirtyRef\.current = true;/);
    expect(SRC).toMatch(/\}, \[entries, storedClips, saveTableToClip\]\);/);
    expect(SRC).toMatch(/c = await \(await getClipStore\(\)\)\.get\(id\);/);
  });

  it("الجدول بيتربط بالمقطع اللي بيعرضه، وبيتفك مع تسجيل جديد و«مسح الكل»", () => {
    expect(SRC).toMatch(/if \(ok && next\.clipId\) \{\s*setTableClip\(next\.clipId\);/);
    const show = SRC.slice(SRC.indexOf("const showClipPlates"), SRC.indexOf("const deleteClip"));
    expect(show).toMatch(/setTableClip\(id\);/);
    const start = SRC.slice(SRC.indexOf("const startRecordingInner"), SRC.indexOf("const startRecordingInner") + 300);
    expect(start).toMatch(/setTableClip\(null\);/);
    const clear = SRC.slice(SRC.indexOf("const clearAll = useCallback"), SRC.indexOf("const clearAll = useCallback") + 200);
    expect(clear).toMatch(/setTableClip\(null\);/);
  });

  it("🔴 كل تفريغ بيفك الربط في أوله (رد بيتقطع بعد اللوحات كان بيخلّي التعديل يكتب فوق مقطع تاني)", () => {
    const i = SRC.indexOf("await runTranscription();");
    const before = SRC.slice(i - 700, i);
    expect(before).toMatch(/setTableClip\(null\);/);
    expect(before).toMatch(/lastKnownSpokenAtRef\.current = 0;/);
  });

  it("🔴 الربط بيتحفظ مع الجلسة ويرجع بعد الرجوع للصفحة — بس لو لوحات الجدول من المقطع ده", () => {
    expect(SRC).toMatch(/const TABLE_CLIP_KEY = "mj:batch:tableClip";/);
    expect(SRC).toMatch(/localStorage\.setItem\(TABLE_CLIP_KEY, id\)/);
    expect(SRC).toMatch(/c\.result\.entries\.some\(\(e\) => ids\.has\(e\.id\)\)/);
  });

  it("تفريغ شغّال ⇒ مافيش تصدير ولا تعديل (لوحاته لسه من غير موقع)", () => {
    const at = SRC.indexOf("const exportToRecords = async");
    const fn = SRC.slice(at, SRC.indexOf("const copyAll", at));
    expect(fn).toMatch(/if \(canStopTranscription\(clipsRef\.current\)\) \{/);
    expect(SRC).toMatch(/disabled=\{exporting \|\| canStopTranscription\(clips\)\}/);
  });

  it("مقطع اتصدّر قبل كده ⇒ «فرّغ تاني» بيسأل الأول (اللوحات هتتكرر)", () => {
    const t = SRC.slice(SRC.indexOf("const transcribeClip = async"), SRC.indexOf("const transcribeClip = async") + 1200);
    expect(t).toMatch(/result\?\.exportedCount/);
    expect(t).toMatch(/window\.confirm\(/);
  });

  it("تقرير التجربة (تشخيص) بيتحفظ للسوبر أدمن بس — مش بيتراكم عند المندوب", () => {
    expect(SRC).toMatch(/if \(advancedRef\.current\) try \{\s*const sheet = parseReadingSheet/);
  });

  it("المندوب: آخر غلط جنب زرار التسجيل، وحالة الطابور باينة وهو بيسجّل اللي بعده", () => {
    expect(SRC).toMatch(/\{!advanced && \(\s*<div className="mt-3">\s*<LastErrorNote errorLog=\{errorLog\} \/>/);
    expect(SRC).toMatch(/\{canStopTranscription\(clips\) && vadStage && phase !== "transcribing" && \(/);
    expect(SRC).toMatch(/\{advanced && server\.probe && /);
  });

  it("المندوب: «تصدير للسجلات» بس — Excel/CSV/المشاركة/النسخ للسوبر أدمن", () => {
    const i = SRC.indexOf("{onExportToRecords && (");
    const j = SRC.indexOf("{advanced && (<>");
    const k = SRC.indexOf("</>)}", j);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    const gated = SRC.slice(j, k);
    for (const b of ["انسخ الكل", "openEntriesExcel(", "shareEntriesExcel(", "openEntriesCsv("]) expect(gated).toContain(b);
  });

  it("وهو بيصدّر الجدول مقفول للتعديل (التعديل في النص كان هيضيع)", () => {
    for (const name of ["const annotateEntry", "const editEntry", "const removeEntry"]) {
      const i = SRC.indexOf(name);
      expect(SRC.slice(i, i + 300)).toMatch(/if \(exportingRef\.current \|\| canStopTranscription\(clipsRef\.current\)\) return;/);
    }
  });
});
