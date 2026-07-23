import { describe, it, expect } from "vitest";
import { segmentByGap, readDeepgramWords, type DgWord } from "@/lib/deepgramWords";

describe("segmentByGap — يفصل اللوحات عند الفجوة الزمنية بين الكلمات", () => {
  it("لوحتين بينهم فجوة كبيرة → مقطعين", () => {
    const words: DgWord[] = [
      { word: "دال", start: 0.0, end: 0.3 },
      { word: "حاء", start: 0.4, end: 0.7 },
      { word: "راء", start: 0.8, end: 1.0 },
      { word: "واحد", start: 1.1, end: 1.3 },
      // فجوة ١.٢ ثانية (لوحة جديدة)
      { word: "سين", start: 2.5, end: 2.8 },
      { word: "صاد", start: 2.9, end: 3.2 },
      { word: "طاء", start: 3.3, end: 3.6 },
    ];
    const segs = segmentByGap(words, 0.65);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toBe("دال حاء راء واحد");
    expect(segs[1]).toBe("سين صاد طاء");
  });

  it("تسلسل متقارب (كل الفجوات صغيرة) → مقطع واحد", () => {
    const words: DgWord[] = [
      { word: "دال", start: 0.0, end: 0.3 },
      { word: "قاف", start: 0.4, end: 0.7 },
      { word: "سين", start: 0.8, end: 1.0 },
      { word: "ثمانية", start: 1.1, end: 1.4 },
    ];
    expect(segmentByGap(words, 0.65)).toEqual(["دال قاف سين ثمانية"]);
  });

  it("الفجوة فوق الحد بتفصل", () => {
    const words: DgWord[] = [
      { word: "أ", start: 0, end: 0.3 },
      { word: "ب", start: 1.0, end: 1.2 }, // فجوة 0.7 > 0.65
    ];
    expect(segmentByGap(words, 0.65)).toHaveLength(2);
  });

  it("فجوة أصغر من الحد مابتفصلش", () => {
    const words: DgWord[] = [
      { word: "أ", start: 0, end: 0.3 },
      { word: "ب", start: 0.7, end: 1.0 }, // فجوة 0.4 < 0.65
    ];
    expect(segmentByGap(words, 0.65)).toHaveLength(1);
  });

  it("لستة فاضية → []", () => {
    expect(segmentByGap([], 0.65)).toEqual([]);
  });

  it("كلمة واحدة → مقطع واحد", () => {
    expect(segmentByGap([{ word: "دال", start: 0, end: 0.3 }], 0.65)).toEqual(["دال"]);
  });

  it("توقيتات ناقصة → مايفصلش (مقطع واحد آمن)", () => {
    const words: DgWord[] = [{ word: "دال" }, { word: "قاف" }, { word: "سين" }];
    expect(segmentByGap(words, 0.65)).toEqual(["دال قاف سين"]);
  });
});

describe("readDeepgramWords — يقرأ words[] من رسالة Deepgram بأمان", () => {
  it("يستخرج الكلمات من channel.alternatives[0].words", () => {
    const msg = {
      channel: { alternatives: [{ transcript: "دال قاف", words: [
        { word: "دال", start: 0, end: 0.3, confidence: 0.9 },
        { word: "قاف", start: 0.4, end: 0.7, confidence: 0.8 },
      ] }] },
    };
    const w = readDeepgramWords(msg);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ word: "دال", start: 0, confidence: 0.9 });
  });

  it("مفيش words → []", () => {
    expect(readDeepgramWords({ channel: { alternatives: [{ transcript: "x" }] } })).toEqual([]);
    expect(readDeepgramWords({})).toEqual([]);
    expect(readDeepgramWords(null)).toEqual([]);
  });
});
