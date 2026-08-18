import { describe, it, expect } from "vitest";
import { planChunks, offsetSegments, encodeWav, CHUNK_SEC } from "@/lib/audioChunks";

describe("planChunks — تقطيع التسجيل الطويل", () => {
  it("تسجيل أقصر من الجزء الواحد = جزء واحد يغطّيه كله", () => {
    expect(planChunks(40, 60)).toEqual([{ start: 0, end: 40 }]);
  });

  it("تسجيل بالظبط قدّ الجزء = جزء واحد، مش اتنين", () => {
    expect(planChunks(60, 60)).toEqual([{ start: 0, end: 60 }]);
  });

  it("تسجيل طويل بيتقسم لأجزاء متتابعة بلا فجوة ولا تداخل", () => {
    const parts = planChunks(150, 60);
    expect(parts).toEqual([
      { start: 0, end: 60 },
      { start: 60, end: 120 },
      { start: 120, end: 150 },
    ]);
  });

  it("مافيش جزء فاضي في الآخر لما الطول يقبل القسمة", () => {
    const parts = planChunks(120, 60);
    expect(parts).toHaveLength(2);
    expect(parts[parts.length - 1].end).toBe(120);
  });

  it("تسجيل فاضي أو طول غلط = مافيش أجزاء (مانخترعش شغل)", () => {
    expect(planChunks(0, 60)).toEqual([]);
    expect(planChunks(-5, 60)).toEqual([]);
    expect(planChunks(Number.NaN, 60)).toEqual([]);
  });

  it("ساعة كاملة بتتقسم من غير ما نفقد ثانية", () => {
    const parts = planChunks(3600, 60);
    expect(parts).toHaveLength(60);
    expect(parts[0].start).toBe(0);
    expect(parts[59].end).toBe(3600);
    // مافيش فجوة بين أي جزئين
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].start).toBe(parts[i - 1].end);
    }
  });
});

describe("offsetSegments — توقيت اللوحة لازم يبقى من أول التسجيل", () => {
  it("بيزوّد بداية الجزء على توقيت كل مقطع", () => {
    const segs = [{ text: "أ ب ج ١٢٣٤", start: 2, end: 5 }];
    expect(offsetSegments(segs, 60)).toEqual([{ text: "أ ب ج ١٢٣٤", start: 62, end: 65 }]);
  });

  it("الجزء الأول (بداية صفر) مابيتغيّرش", () => {
    const segs = [{ text: "س", start: 1.5, end: 3 }];
    expect(offsetSegments(segs, 0)).toEqual(segs);
  });

  it("مقطع بلا توقيت بيفضل على بداية الجزء — مش على صفر", () => {
    // المحرك القديم بيرجّع start=0 لكل حاجة؛ من غير الإزاحة كل لوحات
    // الجزء التالت هتبان وكأنها اتقالت في أول ثانية من التسجيل.
    expect(offsetSegments([{ text: "س", start: 0, end: 0 }], 120))
      .toEqual([{ text: "س", start: 120, end: 120 }]);
  });

  it("مابيكسرش لو الليستة فاضية", () => {
    expect(offsetSegments([], 30)).toEqual([]);
  });
});

describe("encodeWav — الملف اللي بيتبعت للسيرفر", () => {
  it("بيطلّع ترويسة RIFF/WAVE صحيحة", async () => {
    const wav = encodeWav(new Float32Array(1600), 16000);
    const head = new Uint8Array(await wav.arrayBuffer());
    expect(String.fromCharCode(...head.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...head.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...head.slice(12, 16))).toBe("fmt ");
  });

  it("بيكتب مونو ١٦ك ١٦-بت — نفس اللي الموديل متدرّب عليه", async () => {
    const buf = await encodeWav(new Float32Array(800), 16000).arrayBuffer();
    const dv = new DataView(buf);
    expect(dv.getUint16(22, true)).toBe(1);        // قناة واحدة
    expect(dv.getUint32(24, true)).toBe(16000);    // معدّل العيّنات
    expect(dv.getUint16(34, true)).toBe(16);       // ١٦ بت للعيّنة
  });

  it("الحجم = ٤٤ بايت ترويسة + بايتين لكل عيّنة", async () => {
    const wav = encodeWav(new Float32Array(1000), 16000);
    expect(wav.size).toBe(44 + 2000);
  });

  it("بيقصّ الصوت العالي بدل ما يلفّ حواليه ويعمل طقطقة", async () => {
    const buf = await encodeWav(Float32Array.from([2, -2]), 16000).arrayBuffer();
    const dv = new DataView(buf);
    expect(dv.getInt16(44, true)).toBe(32767);
    expect(dv.getInt16(46, true)).toBe(-32768);
  });

  it("جزء بطول الحد الأقصى يفضل تحت سقف السيرفر (٤٫٥ ميجا بعد التحويل النصي)", () => {
    const bytes = 44 + CHUNK_SEC * 16000 * 2;
    const base64Bytes = Math.ceil(bytes / 3) * 4;
    expect(base64Bytes).toBeLessThan(4.5 * 1024 * 1024);
  });
});
