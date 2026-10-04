import { describe, it, expect, vi } from "vitest";
import { probeVoiceHealth, probeVoiceTranscribe, mergeHealth } from "@/lib/voiceHealth";
import { failCodeText } from "@/lib/voiceMonitorView";
import { voiceProbeClip, VOICE_PROBE_PLATE } from "@/lib/voiceProbeClip";

/**
 * 🔴 ٤ أكتوبر ٢٠٢٦: كارت ماليزيا باظ (CUDA) و`/health` فضل يقول ok — كل تفريغ كان بيفشل
 * والمراقبة خضرا، ومحدش عرف غير لما المناديب وقفوا. الفحص الحقيقي بيبعت مقطع صوت صغير
 * فيه لوحة معروفة على `/transcribe` بنفس توكن المناديب ونفس الصيغة (WAV) — طلب واحد
 * كل دقيقة، بمهلة، من غير إعادة.
 */
describe("probeVoiceTranscribe", () => {
  const clip = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const reply = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status });

  it("لوحة الاختبار رجعت صح وبسرعة ⇐ ok · بنفس ترويسة المناديب وصيغتهم · طلب واحد", async () => {
    let t = 0;
    const fetchFn = vi.fn().mockImplementation(async () => { t += 600; return reply({ plate: "رني8293", accepted: true }); });
    const r = await probeVoiceTranscribe({ url: "https://voice.example/transcribe", token: "tok", clip, expectPlate: "رني8293", fetchFn, now: () => t });
    expect(r).toMatchObject({ ok: true, error: null, status: 200, ms: 600, plate: "رني8293" });
    const [u, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(u).toBe("https://voice.example/transcribe");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h["X-Plate-Token"]).toBe("tok");
    expect(h["Content-Type"]).toBe("audio/wav");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("لوحة غلط ⇐ wrong_plate · فاضية ⇐ no_plate", async () => {
    const a = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "رني8293", fetchFn: vi.fn().mockResolvedValue(reply({ plate: "رني8233" })) });
    expect(a).toMatchObject({ ok: false, error: "wrong_plate", plate: "رني8233" });
    const b = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "رني8293", fetchFn: vi.fn().mockResolvedValue(reply({ plate: "" })) });
    expect(b).toMatchObject({ ok: false, error: "no_plate" });
  });

  it("كذا لوحة مفصولين بمسافة وفيهم المطلوبة ⇐ ok", async () => {
    const r = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "رني8293", fetchFn: vi.fn().mockResolvedValue(reply({ plate: "رني8293 دبم9199" })) });
    expect(r.ok).toBe(true);
  });

  it("التوكن اترفض ⇐ bad_token · خطأ سيرفر ⇐ http_5xx", async () => {
    const a = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "x", fetchFn: vi.fn().mockResolvedValue(reply({ error: "bad token" }, 401)) });
    expect(a).toMatchObject({ ok: false, error: "bad_token", status: 401 });
    const b = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "x", fetchFn: vi.fn().mockResolvedValue(new Response("x", { status: 502 })) });
    expect(b).toMatchObject({ ok: false, error: "http_502", status: 502 });
  });

  it("بطيء (عدّى الحد) ⇐ slow حتى لو اللوحة صح — زي ٤ أكتوبر على المعالج (٣.٥–٧ث)", async () => {
    let t = 0;
    const fetchFn = vi.fn().mockImplementation(async () => { t += 5200; return reply({ plate: "رني8293" }); });
    const r = await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "رني8293", fetchFn, now: () => t, slowMs: 3000 });
    expect(r).toMatchObject({ ok: false, error: "slow", ms: 5200, plate: "رني8293" });
  });

  it("مافيش توكن ⇐ no_token ومابيبعتش حاجة", async () => {
    const fetchFn = vi.fn();
    const r = await probeVoiceTranscribe({ url: "u", token: "", clip, expectPlate: "x", fetchFn });
    expect(r).toMatchObject({ ok: false, error: "no_token" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("مهلة ⇐ timeout · شبكة ⇐ network — ومابيرميش أبداً", async () => {
    const hang = vi.fn().mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    expect(await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "x", fetchFn: hang, timeoutMs: 20 }))
      .toMatchObject({ ok: false, error: "timeout" });
    expect(await probeVoiceTranscribe({ url: "u", token: "t", clip, expectPlate: "x", fetchFn: vi.fn().mockRejectedValue(new TypeError("x")) }))
      .toMatchObject({ ok: false, error: "network" });
  });
});

describe("mergeHealth — نبضة واحدة من /health + التفريغ الحقيقي", () => {
  const health = { target: "h", ok: true, status: 200, ms: 300, inflight: 2, error: null,
    detail: { model: "ckpt-7500", dtype: "float32", vram: null, device: "cuda" } };
  const deep = { ok: true, error: null, status: 200, ms: 700, plate: "رني8293" };

  it("الاتنين سليمين والكارت شغّال ⇐ ok والتفاصيل فيها التفريغ", () => {
    const r = mergeHealth(health, deep, "رني8293");
    expect(r).toMatchObject({ ok: true, error: null, ms: 300, inflight: 2 });
    expect(r.detail).toMatchObject({ device: "cuda", deep_ok: true, deep_ms: 700, plate: "رني8293", expect: "رني8293" });
  });

  it("السيرفر صاحي بس التفريغ فشل ⇐ مش ok بسبب التفريغ (ده بالظبط عطل ٤ أكتوبر)", () => {
    const r = mergeHealth(health, { ...deep, ok: false, error: "http_500", status: 500, plate: null }, "رني8293");
    expect(r).toMatchObject({ ok: false, error: "http_500" });
  });

  it("السيرفر على المعالج ⇐ مش ok بسبب cpu حتى لو التفريغ نجح", () => {
    const r = mergeHealth({ ...health, detail: { ...health.detail, device: "cpu" } }, deep, "رني8293");
    expect(r).toMatchObject({ ok: false, error: "cpu" });
  });

  it("/health نفسه واقع ⇐ سببه هو اللي بيتسجّل والتفريغ مااتجرّبش", () => {
    const r = mergeHealth({ ...health, ok: false, error: "http_502", status: 502 }, null, "رني8293");
    expect(r).toMatchObject({ ok: false, error: "http_502" });
    expect(r.detail).toMatchObject({ deep_ok: null });
  });
});

describe("probeVoiceHealth — الجهاز (cuda/cpu) في التفاصيل", () => {
  it("بيسجّل device", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, device: "cpu", inflight: 0 }), { status: 200 }));
    const row = await probeVoiceHealth({ url: "u", fetchFn });
    expect(row.detail).toMatchObject({ device: "cpu" });
  });
});

describe("failCodeText — أسباب الفحص الحقيقي", () => {
  it("كل سبب جديد ليه شرح عربي", () => {
    expect(failCodeText("cpu")).toContain("المعالج");
    expect(failCodeText("wrong_plate")).toContain("غلط");
    expect(failCodeText("no_plate")).toContain("مابيطلّعش");
    expect(failCodeText("slow")).toContain("بطيء");
    expect(failCodeText("no_token")).toContain("توكن");
  });
});

/** مقطع الفحص: صوت المالك (جلسة ٤ أكتوبر) بيقول رني8293 — WAV ١٦ك مونو زي فويس برو. */
describe("voiceProbeClip", () => {
  it("WAV سليم ١٦ك مونو ١٦ بت، ~٢.٦ث، واللوحة المتوقّعة", () => {
    const b = voiceProbeClip();
    const s = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
    expect(s(0, 4)).toBe("RIFF");
    expect(s(8, 4)).toBe("WAVE");
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getUint32(24, true)).toBe(16000);
    expect(dv.getUint16(34, true)).toBe(16);
    const secs = (b.byteLength - 44) / (16000 * 2);
    expect(secs).toBeGreaterThan(2);
    expect(secs).toBeLessThan(3.5);
    expect(VOICE_PROBE_PLATE).toBe("رني8293");
  });
});
