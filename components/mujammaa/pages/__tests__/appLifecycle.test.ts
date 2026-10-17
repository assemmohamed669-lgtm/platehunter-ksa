// @vitest-environment node
/**
 * 🧮 دورة حياة المجمّع جوّه قناص — حاجات المعمل ماكانش محتاجها لأن صفحته عمرها ما بتتقفل
 * (`<div hidden>` في App.tsx). في قناص الصفحة بتتقفل لما السوبر أدمن يروح تاب تاني.
 * (مراجعة ١٦ أكتوبر — ١٣ ملاحظة اتأكّدت؛ دول حرّاس اللي في الصفحة.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "BatchPage.tsx"), "utf8").replace(/\r\n/g, "\n");
function block(start: string, close = "\n  };"): string {
  const i = SRC.indexOf(start);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = SRC.indexOf(close, i);
  expect(j).toBeGreaterThan(i);
  return SRC.slice(i, j);
}

describe("🔴 الصفحة اتقفلت ⇒ عامل الطابور يقف (مايفضلش يبعت للسيرفر في الخلفية)", () => {
  it("علامة القفل بتتحط في التنظيف — وبتتصفّر في الفتح بس (StrictMode بيعمل قفل/فتح وهمي)", () => {
    expect(SRC).toMatch(/const unmountedRef = useRef\(false\);/);
    expect(SRC).toMatch(/unmountedRef\.current = false;\n\s*const track = gpsTrackRef\.current;\n\s*return \(\) => \{\n\s*unmountedRef\.current = true;/);
    expect((SRC.match(/unmountedRef\.current = false/g) ?? []).length).toBe(1);
  });

  it("runQueue بيبصّ عليها قبل كل مقطع، و«كامل ⚡» مابيبدأش بعد القفل", () => {
    expect(block("const runQueue = ")).toMatch(/if \(unmountedRef\.current\) break;/);
    expect(block("const runChunksTranscription = ")).toMatch(/if \(unmountedRef\.current\) \{/);
  });
});

describe("ملف التشييك الحالي وقت بناء الصف (مش النسخة اللي كانت وقت ما الطابور بدأ)", () => {
  it("buildEntry وeditEntry بيقروا من ref", () => {
    expect(SRC).toMatch(/const sheetRef = useRef\(bank\.sheet\);\n\s*sheetRef\.current = bank\.sheet;/);
    expect((SRC.match(/matchInCheckSheet\(sheetRef\.current, review\.plate\)/g) ?? []).length).toBe(2);
    expect(SRC).not.toMatch(/\[bank\.sheet\]\n\s*\);/);
  });
});

describe("«الميك مشغول» — التحديث التلقائي وصفّارة الرسالة العاجلة يستنّوا", () => {
  it("مسكة من أول التسجيل لحد ما المقطع يتقفل، ومسكة طول طلب التفريغ", () => {
    expect(SRC).toMatch(/import \{ setMicBusy \} from "@\/lib\/micBusy";/);
    expect(SRC).toMatch(/createBusyHold\(setMicBusy\)/);
    const start = block("const startRecordingInner = ");
    expect(start.indexOf("await rec.start()")).toBeLessThan(start.indexOf("recReleaseRef.current = busyRef.current.hold()"));
    expect(block("const stopRecording = useCallback(", "\n  }, [")).toMatch(/recReleaseRef\.current\?\.\(\);/);
    const chunks = block("const runChunksTranscription = ");
    expect(chunks).toMatch(/const releaseReq = busyRef\.current\.hold\(\);/);
    expect(chunks).toMatch(/finally \{\n\s*releaseReq\(\);/);
    expect(SRC).toMatch(/busyRef\.current\.reset\(\);/);
  });
});

describe("بيبلّغ الصفحة إنه مشغول (مفتاح «التسجيل القديم» يتقفل)", () => {
  it("onBusyChange = بيسجّل أو بيقفل المقطع", () => {
    expect(SRC).toMatch(/onBusyChange\?: \(busy: boolean\) => void;/);
    expect(SRC).toMatch(/onBusyChangeRef\.current\?\.\(phase === "recording" \|\| finalizing\)/);
  });
});

describe("التصدير بفتح/مشاركة التطبيق (مش <a download> اللي مابيشتغلش جوّه التطبيق)", () => {
  it("الأزرار بتنده appExport", () => {
    expect(SRC).not.toMatch(/exportEntriesToExcel\(|exportEntriesToCsv\(/);
    expect(SRC).toMatch(/openEntriesExcel\(entries, bank\.sheet, "تفريغ_مجمع"/);
    expect(SRC).toMatch(/openEntriesCsv\(entries, bank\.sheet, "تفريغ_مجمع"/);
    expect(SRC).toMatch(/shareEntriesExcel\(entries, bank\.sheet, "تفريغ_مجمع"/);
  });
});
