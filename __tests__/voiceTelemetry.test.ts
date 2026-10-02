import { describe, it, expect } from "vitest";
import { VoiceTelemetry, percentile, skipCode } from "@/lib/voiceTelemetry";

/**
 * 🩺 مراقبة الصوت — المالك (٣ أكتوبر ٢٠٢٦): «عايز مراقبة شاملة علشان لما تحصل
 * حاجة زي كده نرجع ونعرف إيه اللي حصل والسبب ونحلّه — المهم مايأثرش على المناديب».
 * المُجمِّع ده بيلمّ في الذاكرة بس (رخيص)، والرفع كل دقيقتين ملخّص واحد.
 */
const mk = (t0 = 1_000_000) => {
  let now = t0;
  const tel = new VoiceTelemetry({ agentId: "a1", sessionId: "s1", platform: "android", build: "abc", server: "voice.qannas-ksa.com", now: () => now });
  return { tel, tick: (ms: number) => { now += ms; } };
};

describe("percentile", () => {
  it("بيحسب الوسيط و٩٥٪ والفاضي null", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
    expect(percentile([100, 200, 300, 400], 95)).toBe(400);
  });
});

describe("skipCode", () => {
  it("بيطلّع كود الفشل من سبب المحرّك", () => {
    expect(skipCode("request_failed:http_503")).toBe("http_503");
    expect(skipCode("replay_failed:timeout")).toBe("timeout");
    expect(skipCode("utterance_dropped_legacy")).toBe("utterance_dropped_legacy");
  });
});

describe("VoiceTelemetry", () => {
  it("بيعدّ القراءات والفشل والإعادة واللوحات اللي ظهرت", () => {
    const { tel, tick } = mk();
    tel.event("start");
    tel.read({ tMs: 1500, plate: "حبك1234", accepted: true, conf: 0.97, minLogprob: -0.1, msModel: 120, msWall: 900 });
    tick(1500);
    tel.read({ tMs: 3000, plate: "", accepted: false, conf: 0.4, minLogprob: -2, msModel: 100, msWall: 700 });
    tel.skip("request_failed:http_503");
    tel.skip("request_failed:timeout");
    tel.replay();
    tel.shown("حبك1234", { tMs: 1500, mult: 2, conf: 0.97 });
    const b = tel.takeBatch()!;
    expect(b.agent_id).toBe("a1");
    expect(b.session_id).toBe("s1");
    expect(b.counts).toMatchObject({ reads: 2, accepted: 1, empty: 1, replays: 1, shown: 1 });
    expect(b.counts.fails).toEqual({ http_503: 1, timeout: 1 });
    expect(b.latency).toMatchObject({ p50: 700, max: 900, n: 2 });
    const kinds = b.events.map((e) => e[0]);
    expect(kinds).toContain("e"); // start
    expect(kinds).toContain("r"); // قراءة فيها لوحة
    expect(kinds).toContain("f"); // فشل
    expect(kinds).toContain("s"); // لوحة ظهرت
  });

  it("القراءة الفاضية (من غير لوحة) بتتعدّ بس ومابتتسجّلش حدث — عشان الحجم", () => {
    const { tel } = mk();
    for (let i = 0; i < 50; i++) tel.read({ tMs: i * 1500, plate: "", accepted: false, conf: 0.3, msWall: 600 });
    const b = tel.takeBatch()!;
    expect(b.counts.empty).toBe(50);
    expect(b.events.filter((e) => e[0] === "r")).toHaveLength(0);
  });

  it("سقف الأحداث في الدفعة — وبيقول كام اترمى", () => {
    const { tel } = mk();
    for (let i = 0; i < 1000; i++) tel.read({ tMs: i, plate: "حبك1234", accepted: true, conf: 0.9, msWall: 500 });
    const b = tel.takeBatch()!;
    expect(b.events.length).toBeLessThanOrEqual(400);
    expect(b.counts.events_dropped).toBe(1000 - b.events.length);
    expect(b.counts.reads).toBe(1000);
  });

  it("takeBatch بتصفّر — والدفعة التانية فيها الجديد بس، ومن غير حاجة ترجّع null", () => {
    const { tel, tick } = mk();
    tel.read({ tMs: 1, plate: "حبك1234", accepted: true, conf: 0.9, msWall: 500 });
    const b1 = tel.takeBatch()!;
    tick(120_000);
    expect(tel.takeBatch()).toBeNull();
    tel.skip("request_failed:network");
    const b2 = tel.takeBatch()!;
    expect(b2.counts.reads).toBe(0);
    expect(b2.counts.fails).toEqual({ network: 1 });
    expect(new Date(b2.started_at).getTime()).toBeGreaterThanOrEqual(new Date(b1.ended_at).getTime());
  });

  it("أي مدخل غلط مايرميش استثناء (المراقبة عمرها ماتوقّف الصوت)", () => {
    const { tel } = mk();
    expect(() => {
      // @ts-expect-error مدخل بايظ عن قصد
      tel.read(null);
      // @ts-expect-error
      tel.skip(undefined);
      // @ts-expect-error
      tel.shown(null, null);
      tel.event("stop", { reason: "fatal" });
    }).not.toThrow();
  });

  it("السكوت بيتعدّ بس، والزحمة (نافذة اترمت قبل ما تتبعت) بتاخد حدث — ومش فشل", () => {
    const { tel } = mk();
    for (let i = 0; i < 20; i++) tel.skip("silence_gate");
    tel.skip("busy_window");
    tel.skip("utterance_queue_full");
    const b = tel.takeBatch()!;
    expect(b.counts.skips).toEqual({ silence_gate: 20, busy_window: 1 });
    expect(b.counts.fails).toEqual({ utterance_queue_full: 1 });
    expect(b.events.filter((e) => e[0] === "b")).toHaveLength(1);
    expect(b.events.filter((e) => e[0] === "f")).toHaveLength(1);
  });

  it("الموديل كتب نص من غير لوحة ⇐ حدث «t» بالنص (مقصوص) — ده «قلت لوحة ومااتكتبتش»", () => {
    const { tel } = mk();
    tel.read({ tMs: 9000, rawText: "انا سبعه سته سبعه خمسه", plate: "", accepted: false, conf: 0.5, msWall: 800 });
    const b = tel.takeBatch()!;
    const t = b.events.find((e) => e[0] === "t")!;
    expect(t[2]).toBe("انا سبعه سته سبعه خمسه");
  });

  it("وقت الحدث بالثواني من بداية الجلسة — عشان نطابقه بالساعة اللي المندوب بيشتكي فيها", () => {
    const { tel, tick } = mk(10_000);
    tel.event("start");
    tick(65_000);
    tel.skip("request_failed:http_503");
    const b = tel.takeBatch()!;
    const f = b.events.find((e) => e[0] === "f")!;
    expect(f[1]).toBe(65);
    expect(b.session_started_at).toBe(new Date(10_000).toISOString());
  });
});
