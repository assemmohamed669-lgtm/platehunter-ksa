import { describe, it, expect } from "vitest";
import { pcm16FromFloat32, buildDeepgramQuery } from "@/lib/deepgramStream";

describe("pcm16FromFloat32 — تحويل عينات Float32 لـ PCM linear16", () => {
  it("يحوّل القيم الأساسية صح (0 / +1 / -1)", () => {
    const out = pcm16FromFloat32(new Float32Array([0, 1, -1]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);   // +1 → أقصى موجب
    expect(out[2]).toBe(-32768);  // -1 → أقصى سالب
  });

  it("يقصّ القيم برّه [-1,1] (clamp) بدل ما تلتف", () => {
    const out = pcm16FromFloat32(new Float32Array([1.5, -2.0]));
    expect(out[1] ?? out[0]).toBeLessThanOrEqual(0); // -2 → -32768
    expect(pcm16FromFloat32(new Float32Array([1.5]))[0]).toBe(32767);
    expect(pcm16FromFloat32(new Float32Array([-2.0]))[0]).toBe(-32768);
  });

  it("بيرجّع Int16Array بنفس الطول", () => {
    const out = pcm16FromFloat32(new Float32Array([0.1, 0.2, 0.3, 0.4]));
    expect(out).toBeInstanceOf(Int16Array);
    expect(out.length).toBe(4);
  });

  it("نصف المدى ≈ 16383", () => {
    expect(pcm16FromFloat32(new Float32Array([0.5]))[0]).toBe(16383);
  });
});

describe("buildDeepgramQuery — إعدادات nova-3 للّوحات (PCM + endpointing + vad)", () => {
  const qs = buildDeepgramQuery({
    sampleRate: 48000,
    keyterms: ["ألف", "باء"],
  });
  const p = new URLSearchParams(qs);

  it("موديل nova-3 وعربي (الوحيد اللي بيدعم العربي)", () => {
    expect(p.get("model")).toBe("nova-3");
    expect(p.get("language")).toBe("ar");
  });

  it("PCM linear16 مونو بمعدّل العيّنات الفعلي", () => {
    expect(p.get("encoding")).toBe("linear16");
    expect(p.get("channels")).toBe("1");
    expect(p.get("sample_rate")).toBe("48000");
  });

  it("إعدادات تجميع اللوحة: endpointing ~1200 + utterance_end_ms + vad_events", () => {
    expect(p.get("endpointing")).toBe("1200");
    expect(p.get("utterance_end_ms")).toBe("1000");
    expect(p.get("vad_events")).toBe("true");
    expect(p.get("interim_results")).toBe("true"); // مطلوب مع utterance_end_ms
  });

  it("بلا ترقيم/تنسيق ذكي (يفسد شكل اللوحة)", () => {
    expect(p.get("smart_format")).toBe("false");
    expect(p.get("punctuate")).toBe("false");
  });

  it("بيحقن كل keyterm مرة", () => {
    expect(p.getAll("keyterm")).toEqual(["ألف", "باء"]);
  });

  it("يسمح بتغيير endpointing وتمرير قيم مخصّصة", () => {
    const p2 = new URLSearchParams(buildDeepgramQuery({ sampleRate: 16000, endpointing: 800 }));
    expect(p2.get("endpointing")).toBe("800");
    expect(p2.get("sample_rate")).toBe("16000");
    expect(p2.getAll("keyterm")).toEqual([]); // بدون keyterms
  });
});
