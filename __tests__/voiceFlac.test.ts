/**
 * 🗜️ صوت Voice PRO مضغوط من غير فقد (`lib/voiceFlac.ts`) — المالك (٢٦ نوفمبر ٢٠٢٦): «عايز المضمون ميأثرش علي الشغل ابدا
 * وفي نفس الوقت نقلل بقدر المستطاع». التحويل في لحظة الإرسال بس، وأي غلط ⇒ الـWAV نفسه.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWav, normalizePeak } from "@/lib/wav";
import { NetBytes, VOICE_FLAC_FOR_ALL, formatRefused, toFlacBody, voiceFlacFor } from "@/lib/voiceFlac";
import { lightKeepsNote } from "@/lib/deviceDiag";

function speechLike(n: number): Float32Array {
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.4 * Math.sin(i / 9) * Math.sin(i / 2100) + 0.02 * Math.sin(i * 1.7);
  return f;
}

describe("مين", () => {
  it("السوبر أدمن الأول لحد ما الصندوق يقيس", () => {
    expect(VOICE_FLAC_FOR_ALL).toBe(false);
    expect(voiceFlacFor(true)).toBe(true);
    expect(voiceFlacFor(false)).toBe(false);
  });
});

describe("toFlacBody", () => {
  it("WAV البرنامج ⇒ FLAC أصغر (audio/flac)", async () => {
    const wav = encodeWav(normalizePeak(speechLike(86_400)), 16000);
    const body = await toFlacBody(wav);
    expect(body.type).toBe("audio/flac");
    // الإشارة الصناعية دي بتتضغط أقل من الكلام الحقيقي (٥٨٪ على نوافذ ميدانية — `__tests__/flac.test.ts`)
    expect(body.size).toBeLessThan(wav.size);
    const head = new Uint8Array(await body.arrayBuffer()).subarray(0, 4);
    expect(String.fromCharCode(...head)).toBe("fLaC");
  });

  it("مش WAV البرنامج ⇒ نفس الجسم زي ما هو", async () => {
    const other = new Blob([new Uint8Array(500)], { type: "audio/webm" });
    expect(await toFlacBody(other)).toBe(other);
  });

  it("Blob بايظ (القراية بترمي) ⇒ نفس الجسم، من غير ما يرمي", async () => {
    const bad = { size: 100, type: "audio/wav", arrayBuffer: async () => { throw new Error("boom"); } } as unknown as Blob;
    expect(await toFlacBody(bad)).toBe(bad);
  });
});

describe("السيرفر رفض الصيغة ⇒ WAV", () => {
  it("٤٠٠/٤١٥ بس (النت/٥٠٣/التوكن مالهمش علاقة بالصيغة)", () => {
    expect(formatRefused("http_400")).toBe(true);
    expect(formatRefused("http_415")).toBe(true);
    for (const c of ["http_503", "http_401", "network", "timeout", null, undefined]) expect(formatRefused(c)).toBe(false);
  });
});

describe("NetBytes — قياس الصندوق", () => {
  it("بيجمّع ويطلّع النسبة", () => {
    const b = new NetBytes();
    b.add(172_844, 100_761);
    b.add(172_844, 100_761);
    expect(b.snapshot()).toEqual({ wavKB: 338, sentKB: 197, windows: 2, pct: 58 });
  });
  it("الصندوق الخفيف بيحتفظ بسطر rv2-bytes (للكل)", () => {
    expect(lightKeepsNote("rv2-bytes")).toBe(true);
  });
});

describe("الربط — المحرّك والصفحة", () => {
  const E = readFileSync(path.join(process.cwd(), "lib/voicexEngine.ts"), "utf8").replace(/\r\n/g, "\n");
  const P = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("المحرّك: التحويل لحظة الإرسال بس، والسيرفر رفض ⇒ نفس النافذة WAV وباقي الجلسة WAV", () => {
    expect(E).toMatch(/const body = flacOn \? await toFlacBody\(wav\) : wav;/);
    expect(E).toMatch(/mimeType: body\.type \|\| "audio\/wav"/);
    expect(E).toMatch(/if \(!resp && body !== wav && formatRefused\(lastErr\)\) \{\s*flacOn = false;/);
    expect(E).toMatch(/sentBytes \+= wav\.size;\s*\}\s*netBytes\.add\(wav\.size, sentBytes\);/);
  });

  it("الصفحة: الحساب + سيرفر النوع بنفس القاعدة + سطر القياس عند الوقف", () => {
    expect(P).toMatch(/flac: voiceFlacFor\(isSuperRef\.current\)/);
    expect(P).toMatch(/const body = voiceFlacFor\(isSuperRef\.current\) \? await toFlacBody\(wav\) : wav;/);
    expect(P).toMatch(/"Content-Type": b\.type \|\| "audio\/wav"/);
    expect(P).toMatch(/if \(body !== wav && formatRefused\(`http_\$\{res\.status\}`\)\) res = await postType\(wav\);/);
    expect(P).toMatch(/diagNote\("rv2-bytes", b\)/);
  });
});
