import { describe, it, expect, vi, afterEach } from "vitest";
import { parseEnabledFlag, resolveActiveDeepgramKey, PLATE_LETTER_KEYTERMS, testDeepgramKey } from "@/lib/deepgramKey";

// WebSocket وهمي — نتحكّم في فتح/قفل الاتصال يدوياً بدل اتصال حقيقي بـ Deepgram.
class FakeWS {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  static instances: FakeWS[] = [];
  constructor(public url: string, public proto?: unknown) { FakeWS.instances.push(this); }
  close() { /* no-op */ }
}

describe("testDeepgramKey — فحص اتصال المفتاح (رصيد/توثيق)", () => {
  afterEach(() => { FakeWS.instances = []; vi.unstubAllGlobals(); });

  it("مفتاح فاضي → false فوراً بلا اتصال", async () => {
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    await expect(testDeepgramKey("  ")).resolves.toBe(false);
    expect(FakeWS.instances.length).toBe(0);
  });

  it("الاتصال فتح (onopen) → true (شغّال)", async () => {
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    const p = testDeepgramKey("goodkey");
    FakeWS.instances[0].onopen?.();
    await expect(p).resolves.toBe(true);
  });

  it("اتقفل قبل ما يفتح → false (رصيد خلص / مفتاح غلط)", async () => {
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    const p = testDeepgramKey("deadkey");
    FakeWS.instances[0].onclose?.();
    await expect(p).resolves.toBe(false);
  });

  it("أول نتيجة بس اللي تحسب (قفل بعد فتح مايغيّرش)", async () => {
    vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
    const p = testDeepgramKey("goodkey");
    FakeWS.instances[0].onopen?.();
    FakeWS.instances[0].onclose?.();
    await expect(p).resolves.toBe(true);
  });
});

describe("PLATE_LETTER_KEYTERMS — تحيّز Deepgram (رفع دقة اللوحة 21%→41% بالقياس)", () => {
  it("فيه كل أسماء الحروف الـ17 الفصحى", () => {
    for (const t of ["ألف","باء","حاء","دال","راء","سين","صاد","طاء","عين","قاف","كاف","لام","ميم","نون","هاء","واو","ياء"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
  it("فيه كلمات الأرقام (اللي رفعت دقة الأرقام لـ76%)", () => {
    for (const t of ["صفر","واحد","اتنين","تلاتة","اربعة","خمسة","ستة","سبعة","تمانية","تسعة"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
  it("فيه النطق المصري للحروف (حه/به/ره/طه)", () => {
    for (const t of ["حه","به","ره","طه","هه"]) {
      expect(PLATE_LETTER_KEYTERMS).toContain(t);
    }
  });
});

describe("Deepgram enable flag — إيقاف/تشغيل مؤقت", () => {
  it("الافتراضي شغّال لما القيمة مش محدّدة (null)", () => {
    expect(parseEnabledFlag(null)).toBe(true);
  });

  it("متوقّف بس لو القيمة '0'", () => {
    expect(parseEnabledFlag("0")).toBe(false);
    expect(parseEnabledFlag("1")).toBe(true);
    expect(parseEnabledFlag("")).toBe(true);
  });

  it("resolveActiveDeepgramKey بيرجّع المفتاح لما شغّال", () => {
    expect(resolveActiveDeepgramKey("abc123", true)).toBe("abc123");
  });

  it("بيرجّع فاضي لما متوقّف (المفتاح محفوظ بس مش مستخدم)", () => {
    expect(resolveActiveDeepgramKey("abc123", false)).toBe("");
  });

  it("بيشيل الفراغات وبيتعامل مع الفاضي", () => {
    expect(resolveActiveDeepgramKey("  abc ", true)).toBe("abc");
    expect(resolveActiveDeepgramKey("", true)).toBe("");
  });
});
