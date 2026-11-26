/**
 * 🗜️➕ «الجديد بس» (`lib/voiceDelta.ts` + `serving/delta_gateway.py`) — المالك (٢٦ نوفمبر ٢٠٢٦): «نفذ انت دة امر مني اهم حاجه
 * انه ميأثرش لا علي السيرفر ولا علي المناديب ولا علي الشغل».
 *
 * اتقاس قبل الربط: ١٧١ نافذة ميدانية ⇒ النافذة المبنية على السيرفر مختلفة في ٠.١١٥٪ من العيّنات بـ١/٣٢٧٦٨ · اللوحة والقبول
 * نفسهم ١٧١/١٧١ على سيرفر اللوحات الحقيقي (ونفسهم ٦٠/٦٠ جوّه السيرفر · ٢٥/٢٥ عبر النفق) · الطلب ٣٣.٥٪ من الـWAV.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELTA_OFF_MS, DELTA_TIMEOUT_MS, DELTA_URL, DeltaState, VOICE_DELTA_FOR_ALL,
  deltaFailureKind, deltaUrl, newDeltaSid, quantize24, voiceDeltaFor,
} from "@/lib/voiceDelta";

describe("مين", () => {
  it("السوبر أدمن الأول", () => {
    expect(VOICE_DELTA_FOR_ALL).toBe(false);
    expect(voiceDeltaFor(true)).toBe(true);
    expect(voiceDeltaFor(false)).toBe(false);
  });
  it("مسار ‎/d/‎ على نفق المجمّع، ومهلة قصيرة (الطريق القديم يلحق بدري)", () => {
    expect(DELTA_URL).toBe("https://batch.qannas-ksa.com/d/transcribe");
    expect(DELTA_TIMEOUT_MS).toBeLessThanOrEqual(6000);
    expect(DELTA_OFF_MS).toBe(60_000);
  });
});

describe("DeltaState — بيبعت اللي ماتبعتش بس", () => {
  it("أول نافذة ⇒ كلها · اللي بعدها ⇒ من آخر المتبعت", () => {
    const s = new DeltaState("abcdefgh12");
    expect(s.plan(0, 86_400)).toBe(0);
    s.sent(86_400);
    expect(s.plan(24_000, 110_400)).toBe(86_400);   // ١.٥ث جديدة بس
    s.sent(110_400);
    expect(s.plan(48_000, 134_400)).toBe(110_400);
  });

  it("فجوة سكوت (النافذة بتبدأ بعد آخر المتبعت) ⇒ كلها", () => {
    const s = new DeltaState("abcdefgh12");
    s.sent(86_400);
    expect(s.plan(200_000, 286_400)).toBe(200_000);
  });

  it("نافذة متبعتة كلها قبل كده (التأكيد الفوري) ⇒ مافيش جسم، السيرفر بيبنيها من اللي عنده", () => {
    const s = new DeltaState("abcdefgh12");
    s.sent(150_000);
    expect(s.plan(40_000, 126_400)).toBe(126_400);
  });

  it("٤٠٩ ⇒ الجاية تبعت مداها كامل · الوسيط وقع ⇒ دقيقة على القديم", () => {
    const s = new DeltaState("abcdefgh12");
    s.sent(86_400);
    s.missing();
    expect(s.plan(24_000, 110_400)).toBe(24_000);
    s.sent(110_400);
    s.down(1_000);
    expect(s.usable(1_000 + DELTA_OFF_MS - 1)).toBe(false);
    expect(s.usable(1_000 + DELTA_OFF_MS)).toBe(true);
    expect(s.plan(48_000, 134_400)).toBe(48_000);
  });

  it("الفشل: ٤٠٩ = ناقص · أي حاجة تانية = الوسيط مش تمام", () => {
    expect(deltaFailureKind("http_409")).toBe("missing");
    for (const c of ["http_404", "http_502", "http_503", "http_401", "network", "timeout", null]) expect(deltaFailureKind(c)).toBe("down");
  });
});

describe("quantize24 / الرابط / المعرّف", () => {
  it("خام الميك ⇒ ٢٤-بت (القصّ على ±١ زي floatToPcm16)", () => {
    expect(Array.from(quantize24(new Float32Array([0, 1, -1, 1.5, -2, 0.5])))).toEqual([0, 8388607, -8388607, 8388607, -8388607, 4194304]);
  });
  it("الرابط فيه الجلسة والمدى", () => {
    expect(deltaUrl(DELTA_URL, "abc", { a: 1, b: 9, u: 5, rate: 16000 })).toBe(`${DELTA_URL}?sid=abc&a=1&b=9&u=5&rate=16000`);
  });
  it("المعرّف حروف وأرقام ١٦+ (شرط الوسيط) ومختلف كل مرة", () => {
    const a = newDeltaSid(), b = newDeltaSid();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("الربط — المحرّك والميك والصفحة", () => {
  const E = readFileSync(path.join(process.cwd(), "lib/voicexEngine.ts"), "utf8").replace(/\r\n/g, "\n");
  const M = readFileSync(path.join(process.cwd(), "lib/micEngine.ts"), "utf8").replace(/\r\n/g, "\n");
  const P = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("sliceRaw نفس حساب sliceWav بالحرف (نفس العيّنات) + أرقامها المطلقة", () => {
    const body = (name: string) => M.slice(M.indexOf(name), M.indexOf(name) + 900);
    for (const line of [
      "const from = Math.max(0, fromSec - paddingSec);",
      "const to = toSec + paddingSec;",
      "const absoluteStart = Math.floor(from * rate) - this.droppedSamples;",
      "const absoluteEnd = Math.ceil(to * rate) - this.droppedSamples;",
      "const start = Math.max(0, absoluteStart);",
      "const end = Math.min(audio.length, absoluteEnd);",
      "if (end - start < rate * 0.2) return null;",
    ]) {
      expect(body("sliceWav(fromSec")).toContain(line);
      expect(body("sliceRaw(fromSec")).toContain(line);
    }
    expect(body("sliceRaw(fromSec")).toContain("const audio = this.getAudio(true);");
    expect(body("sliceRaw(fromSec")).toContain("a: this.droppedSamples + start, b: this.droppedSamples + end");
  });

  it("المحرّك: «الجديد بس» الأول (مش الإعادة ولا الجسّة) — وأي فشل ⇒ نفس النافذة على الطريق القديم", () => {
    expect(E).toMatch(/const delta = deltaState && !isReplay && !probe && deltaState\.usable\(Date\.now\(\)\) \? mic\.sliceRaw\(fromSec, toSec, 0\.2\) : null;/);
    expect(E).toMatch(/timeoutMs: DELTA_TIMEOUT_MS, attempts: 1/);
    expect(E).toMatch(/if \(resp\) deltaHits \+= 1;\s*else if \(deltaFailureKind\(dErr\) === "missing"\) deltaState\.missing\(\);\s*else deltaState\.down\(Date\.now\(\)\);/);
    expect(E).toMatch(/if \(!resp\) \{\s*const body = flacOn \? await toFlacBody\(wav\) : wav;/);
  });

  it("الصفحة: للسوبر أدمن الأول", () => {
    expect(P).toMatch(/delta: voiceDeltaFor\(isSuperRef\.current\)/);
  });
});
