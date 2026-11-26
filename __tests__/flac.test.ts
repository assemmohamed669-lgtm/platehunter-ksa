// @vitest-environment node
/**
 * 🗜️ FLAC من غير أي فقد (`lib/flac.ts`) — المالك (٢٦ نوفمبر ٢٠٢٦): «عايز المضمون ميأثرش علي الشغل ابدا وفي نفس الوقت نقلل
 * بقدر المستطاع». الحكم = **ffmpeg** (نفس اللي سيرفر النوع بيفك بيه، وسيرفر اللوحات بيرجعله): الملف لازم يتفك من غير ولا غلطة
 * ويطلّع **نفس العيّنات بالبِت** — على إشارات صناعية بكل الأطوال والمعدلات، وعلى صوت ميداني حقيقي من أرشيف المجمّع.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { encodeFlac, wavBytesToFlac } from "@/lib/flac";
import { encodeWav, normalizePeak } from "@/lib/wav";

const FF = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const HAVE_FF = existsSync(FF);
const dir = mkdtempSync(path.join(tmpdir(), "flac-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let seq = 0;
/** يفك بـffmpeg ⇒ عيّنات ١٦-بت بنفس المعدل (ومن غير أي تحويل). */
function ffDecode(flac: Uint8Array, rate: number): { pcm: Int16Array; err: string } {
  const f = path.join(dir, `t${seq++}.flac`);
  writeFileSync(f, flac);
  const r = spawnSync(FF, ["-nostdin", "-v", "error", "-i", f, "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", String(rate), "-"], { maxBuffer: 64 << 20 });
  const b = r.stdout as Buffer;
  return { pcm: new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2)).slice(), err: String(r.stderr ?? "").trim() };
}

function expectSame(pcm: Int16Array, rate: number) {
  const flac = encodeFlac(pcm, rate);
  const out = ffDecode(flac, rate);
  expect(out.err).toBe("");
  expect(out.pcm.length).toBe(pcm.length);
  // مقارنة بالبِت (أول اختلاف بيطلع رقمه لو فيه)
  let firstDiff = -1;
  for (let i = 0; i < pcm.length; i++) if (pcm[i] !== out.pcm[i]) { firstDiff = i; break; }
  expect(firstDiff).toBe(-1);
  return flac;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe.skipIf(!HAVE_FF)("FLAC ⇐ ffmpeg — نفس العيّنات بالبِت", () => {
  it("أطوال كل الحالات (أقل من كتلة، كتلة بالظبط، كتلة وواحد، نافذة ٥.٤ث)", () => {
    const r = rng(7);
    for (const n of [1, 2, 15, 16, 17, 4095, 4096, 4097, 8192, 12_345, 86_400]) {
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) pcm[i] = Math.round(8000 * Math.sin(i / 7) + 3000 * (r() - 0.5));
      expectSame(pcm, 16000);
    }
  });

  it("سكوت تام (CONSTANT) · ضوضاء كاملة (VERBATIM) · مربّع على الحدود (−٣٢٧٦٨/٣٢٧٦٧ — أكبر بواقي)", () => {
    expectSame(new Int16Array(10_000), 16000);
    const r = rng(1);
    const noise = new Int16Array(20_000);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(r() * 65536) - 32768;
    expectSame(noise, 16000);
    const sq = new Int16Array(20_000);
    for (let i = 0; i < sq.length; i++) sq[i] = (i >> 1) % 2 ? 32767 : -32768;
    expectSame(sq, 16000);
  });

  it("معدلات تانية (لو الموبايل رفض ١٦ك): ٤٨ك و٤٤.١ك و٨ك", () => {
    const pcm = new Int16Array(48_000 * 5.4);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(12000 * Math.sin(i / 11) * Math.sin(i / 997));
    for (const rate of [48000, 44100, 8000]) expectSame(pcm, rate);
  });

  it("٢٤-بت (الخام لـ«الجديد بس» — `lib/voiceDelta.ts`): نفس القيم بالبِت، كل الأطوال والحدود", () => {
    const r = rng(11);
    for (const n of [1, 4095, 4096, 4097, 24_000, 30_000]) {
      const pcm = new Int32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = Math.round(8388607 * 0.3 * Math.sin(i / 7) * Math.sin(i / 1900)) + Math.floor(r() * 2000) - 1000;
      pcm[0] = 8388607; if (n > 1) pcm[n - 1] = -8388608;
      const flac = encodeFlac(pcm, 16000, 24);
      const f = path.join(dir, `t${seq++}.flac`);
      writeFileSync(f, flac);
      const out = spawnSync(FF, ["-nostdin", "-v", "error", "-i", f, "-f", "s32le", "-acodec", "pcm_s32le", "-ac", "1", "-"], { maxBuffer: 64 << 20 });
      expect(String(out.stderr ?? "").trim()).toBe("");
      const b = out.stdout as Buffer;
      const got = new Int32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
      expect(got.length).toBe(n);
      let firstDiff = -1;
      for (let i = 0; i < n; i++) if ((got[i] >> 8) !== pcm[i]) { firstDiff = i; break; }
      expect(firstDiff).toBe(-1);
    }
  });

  it("wavBytesToFlac: نفس WAV بتاع البرنامج (`encodeWav` + `normalizePeak`) ⇒ نفس العيّنات", async () => {
    const f = new Float32Array(86_400);
    for (let i = 0; i < f.length; i++) f[i] = 0.3 * Math.sin(i / 9) * Math.sin(i / 3000);
    const wav = new Uint8Array(await encodeWav(normalizePeak(f), 16000).arrayBuffer());
    const flac = wavBytesToFlac(wav)!;
    expect(flac).not.toBeNull();
    const pcm = new Int16Array(wav.buffer.slice(44));
    const out = ffDecode(flac, 16000);
    expect(out.err).toBe("");
    expect(Buffer.from(out.pcm.buffer).equals(Buffer.from(pcm.buffer))).toBe(true);
  });

  it("wavBytesToFlac: أي شكل تاني ⇒ null (يتبعت WAV زي ما هو)", () => {
    expect(wavBytesToFlac(new Uint8Array(10))).toBeNull();
    const notWav = new Uint8Array(100);
    notWav.set([0x66, 0x4c, 0x61, 0x43]);
    expect(wavBytesToFlac(notWav)).toBeNull();
  });

  /** 🎙️ صوت ميداني حقيقي (أرشيف المجمّع على الجهاز ده) — نوافذ ٥.٤ث معلّاة زي Voice PRO. */
  const ARCHIVE = "C:/Users/assem/Desktop/live-capture-off/batch-runs";
  it.skipIf(!existsSync(ARCHIVE))("نوافذ من تسجيلات مناديب حقيقية: نفس العيّنات + الحجم", async () => {
    const runs = readdirSync(ARCHIVE).filter((d) => existsSync(path.join(ARCHIVE, d, "audio.webm"))).slice(-8);
    let wavBytes = 0, flacBytes = 0, windows = 0;
    for (const d of runs) {
      const r = spawnSync(FF, ["-nostdin", "-v", "error", "-i", path.join(ARCHIVE, d, "audio.webm"), "-t", "240", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], { maxBuffer: 256 << 20 });
      const b = r.stdout as Buffer;
      const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
      for (let s = 0; s + 86_400 <= all.length; s += 16000 * 20) {
        const wav = new Uint8Array(await encodeWav(normalizePeak(all.slice(s, s + 86_400)), 16000).arrayBuffer());
        const flac = wavBytesToFlac(wav)!;
        const out = ffDecode(flac, 16000);
        expect(out.err).toBe("");
        expect(Buffer.from(out.pcm.buffer).equals(Buffer.from(wav.buffer.slice(44)))).toBe(true);
        wavBytes += wav.length; flacBytes += flac.length; windows++;
      }
    }
    expect(windows).toBeGreaterThan(20);
    const ratio = flacBytes / wavBytes;
    // مقيس ٢٦ نوفمبر ٢٠٢٦: ٤٩ نافذة ⇒ WAV ١٧٢٨٤٤ بايت · FLAC ١٠٠٧٦١ (٠.٥٨٣ ⇒ توفير ~٤٢٪)
    expect(ratio).toBeLessThan(0.7);
  }, 300_000);
});
