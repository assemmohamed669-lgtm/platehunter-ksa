/**
 * ⏱️ «بيقول لوحات يظهر لوحات ولوحات لا» (المالك ٢٨ أكتوبر ٢٠٢٦ — رامي عابد، وقبله احمد سلام والعبيدي).
 *
 * الدليل (مراقبة احمد سلام ٢٨ أكتوبر): من ثانية ١٩ تقريباً **كل** نافذة زاحفة رجعت `slice_failed` (١١٤ مقابل ٣٣ قراية)،
 * والقرايات اللي نجحت كلها قراية نطق، ومراكزها متأخرة عن الساعة ٨–١٣ ثانية ⇒ **الصوت اللي وصل متأخر عن ساعة الحائط**.
 * المحرّك كان بيقصّ النوافذ بساعة الحائط (`mic.elapsedSec`) فبيطلب صوت لسه ماوصلش ⇒ مقطع فاضي ⇒ النافذة بتترمى ⇒
 * كل لوحة بتتقري مرة واحدة (mult=1) لو المندوب سكت بعدها، وإلا بتضيع، والمطلوبة مابتتأكّدش.
 *
 * ⇒ `audioClock`: الزحلقة والتصريف والطابور وكل حاجة بساعة **الصوت اللي وصل** (`mic.durationSec`)، ولو الصوت وقف
 * مانبعتش نفس النافذة تاني (`audio_stalled`). موبايل سليم: الساعتين واحد ⇒ نفس النوافذ.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MicEngine } from "@/lib/micEngine";
import { AUDIO_CLOCK_FOR_VOICE_PRO, MIN_SLIDE_ADVANCE_SEC } from "@/lib/voicexEngine";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const ENGINE = read("lib/voicexEngine.ts");
const VP = read("app/(app)/registration-v2/page.tsx");
const IC = read("app/(app)/instant-check/page.tsx");

/** ميك فيه `sec` ثانية صوت بس (كأن الصوت متأخر عن الساعة) */
function micWithAudio(sec: number): MicEngine {
  const mic = new MicEngine({ mode: "live" });
  const m = mic as unknown as { running: boolean; actualSampleRate: number; handleChunk(c: Float32Array): void; handleRawChunk(c: Float32Array): void };
  m.running = true;
  m.actualSampleRate = 16000;
  const chunk = new Float32Array(1600).fill(0.1);   // ٠٫١ث
  for (let i = 0; i < sec * 10; i++) { m.handleChunk(chunk); m.handleRawChunk(chunk); }
  return mic;
}

describe("العيب نفسه — النافذة بساعة الحائط بتطلب صوت لسه ماوصلش", () => {
  it("الصوت ١٠ث والساعة ١٨ث ⇒ نافذة [١٣، ١٨] فاضية · نافذة الصوت [٥، ١٠] فيها صوت", () => {
    const mic = micWithAudio(10);
    expect(mic.durationSec).toBeCloseTo(10, 5);
    expect(mic.sliceWav(13, 18, 0.2, true)).toBeNull();
    expect(mic.sliceWav(5, 10, 0.2, true)).not.toBeNull();
  });
});

describe("المحرّك — `audioClock`", () => {
  it("علم في الخيارات + Voice PRO بيطلبه (للكل) + «صوتي» لأ", () => {
    expect(ENGINE).toMatch(/audioClock\?: boolean;/);
    expect(AUDIO_CLOCK_FOR_VOICE_PRO).toBe(true);
    expect(VP).toMatch(/audioClock: AUDIO_CLOCK_FOR_VOICE_PRO,/);
    expect(IC).not.toMatch(/audioClock/);
  });

  it("الساعة واحدة في كل حتة: `clockSec()` بدل `mic.elapsedSec`", () => {
    expect(ENGINE).toMatch(/function clockSec\(\): number \{\n\s*return AUDIO_CLOCK \? mic\.durationSec : mic\.elapsedSec;\n\s*\}/);
    // كل الاستعمالات التانية اتشالت
    const uses = ENGINE.split("\n").filter((l) => /mic\.elapsedSec/.test(l) && !/AUDIO_CLOCK \? mic\.durationSec : mic\.elapsedSec/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    expect(uses).toEqual([]);
  });

  it("الصوت وقف ⇒ مانبعتش نفس النافذة تاني (`audio_stalled`)", () => {
    expect(MIN_SLIDE_ADVANCE_SEC).toBeGreaterThan(0);
    expect(MIN_SLIDE_ADVANCE_SEC).toBeLessThanOrEqual(1);
    expect(ENGINE).toMatch(/if \(AUDIO_CLOCK && elapsed - lastSlideAudioSec < MIN_SLIDE_ADVANCE_SEC\) \{ opts\.onSkip\?\.\("audio_stalled"\); return; \}/);
  });

  it("المراقبة بتعدّه (من غير ما تملا الأحداث)", () => {
    expect(read("lib/voiceTelemetry.ts")).toMatch(/"audio_stalled"/);
  });
});
