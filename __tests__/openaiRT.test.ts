import { describe, it, expect } from "vitest";
import { resampleLinear, floatToInt16, pcm16ToBase64 } from "@/lib/openaiRT";

describe("openaiRT — تحويل الصوت لـ OpenAI (PCM16 24k base64)", () => {
  it("resampleLinear: نفس المعدّل → نفس البيانات بدون تغيير", () => {
    const inp = new Float32Array([0, 0.5, -0.5, 1]);
    const out = resampleLinear(inp, 24000, 24000);
    expect(Array.from(out)).toEqual(Array.from(inp));
  });

  it("resampleLinear: 16k→24k بيكبّر الطول بنسبة 1.5", () => {
    const inp = new Float32Array(160); // 10ms @16k
    const out = resampleLinear(inp, 16000, 24000);
    expect(out.length).toBe(240); // 10ms @24k
  });

  it("resampleLinear: 48k→24k بينصّف الطول", () => {
    const inp = new Float32Array(480);
    const out = resampleLinear(inp, 48000, 24000);
    expect(out.length).toBe(240);
  });

  it("resampleLinear: بيعمل استيفاء خطّي بين العيّنات", () => {
    // من [0,1] عند 1Hz لـ 2Hz → نقطة في النص لازم تبقى ~0.5
    const out = resampleLinear(new Float32Array([0, 1]), 1, 2);
    expect(out.length).toBe(4);
    expect(out[1]).toBeCloseTo(0.5, 5);
  });

  it("floatToInt16: بيقصّ [-1,1] ويحوّل لـ Int16", () => {
    const i16 = floatToInt16(new Float32Array([0, 1, -1, 2, -2]));
    expect(i16[0]).toBe(0);
    expect(i16[1]).toBe(32767);
    expect(i16[2]).toBe(-32768);
    expect(i16[3]).toBe(32767); // clamp > 1
    expect(i16[4]).toBe(-32768); // clamp < -1
  });

  it("pcm16ToBase64: base64 يفكّ للبايتات الأصلية (little-endian)", () => {
    const i16 = new Int16Array([1, 256, -1]);
    const b64 = pcm16ToBase64(i16);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // little-endian: 1→[01,00] 256→[00,01] -1→[ff,ff]
    expect(Array.from(bytes)).toEqual([1, 0, 0, 1, 255, 255]);
  });
});
