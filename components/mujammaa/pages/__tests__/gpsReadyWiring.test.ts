// @vitest-environment node
// (نص الصفحة بيتقري بـ`import.meta.url` = ملف — في jsdom مش ملف)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 📍 الموقع جاهز قبل ما يسجّل (١٩ أكتوبر ٢٠٢٦) — حرّاس على الربط في `BatchPage`: العلامة جنب زرار
 * التسجيل، والتحذير الكبير بيتشغّل لو داس تسجيل والعلامة مش خضرا، وبيتقفل مع الإيقاف.
 */
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

const between = (from: string, to: string) => {
  const i = SRC.indexOf(from);
  return SRC.slice(i, SRC.indexOf(to, i));
};

describe("📍 الموقع جاهز — الربط", () => {
  it("العلامة جنب زرار التسجيل", () => {
    expect(SRC).toMatch(/import \{ GpsReadyChip, GpsStartWarning \} from "\.\.\/components\/GpsReadiness"/);
    const area = between('<button className="btn-primary" onClick={startRecording}', "التسجيل لحد");
    expect(area).toMatch(/<GpsReadyChip \/>/);
  });

  it("داس تسجيل والعلامة مش خضرا ⇒ التحذير الكبير (بعد ما التسجيل بدأ فعلاً — مابيوقّفوش)", () => {
    const body = between("const startRecordingInner = async", "const stopRecording = useCallback");
    const iPhase = body.indexOf('setPhase("recording")');
    const iArm = body.indexOf("setGpsWarnArmed(true)");
    expect(iPhase).toBeGreaterThan(0);
    expect(iArm).toBeGreaterThan(iPhase);
    expect(body).toMatch(/gpsStartWarning\(gpsReadiness\(currentFix\(\), lastFixRecvAt\(\), Date\.now\(\), gpsStatus\(\)\)\)/);
  });

  it("الإيقاف بيقفل التحذير، والتحذير الصغير مابيتكرّرش جنب الكبير", () => {
    expect(between("const stopRecording = useCallback", "finalizeClipRef.current(s, seconds, blob)")).toMatch(
      /setGpsWarnArmed\(false\)/
    );
    expect(SRC).toMatch(/phase === "recording" && gpsWarnArmed && <GpsStartWarning onReady=\{disarmGpsWarn\} \/>/);
    expect(SRC).toMatch(/const warn = gpsWarnArmed \? null : recordGpsWarning\(/);
  });
});
