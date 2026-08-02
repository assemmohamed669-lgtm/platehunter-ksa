// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  JUDGE_TIMEOUT_MS,
  JUDGE_MAX_WINDOW_S,
  buildTranscribeUrl,
  parseJudgeResponse,
  postAudioForPlate,
} from "@/lib/plateJudgeClient";

// ─────────────────────────────────────────────────────────────────────────────
// طبقة الشبكة للرأي التاني. عقدها الوحيد: **عمرها ما ترمي، وعمرها ما تكدب.**
//   • أي فشل (شبكة/مهلة/٤٠١/٥٠٣/جسم بايظ/شكل غلط) = `null` ⇒ التطبيق يكمّل
//     بـDeepgram لوحده = **سلوك النهاردة بالحرف**.
//   • مافيش ثقة في السيرفر: كل حقل بيتفحص. حقل ناقص أو نوعه غلط = null.
//   • إعادة محاولة واحدة **بس** لفشل الشبكة. ولا واحدة لأي رد HTTP (٤xx/٥xx) —
//     ٤٠١ توكن غلط بيفضل غلط، و٥٠٣ «مزنوق» إعادة المحاولة بتزنقه أكتر.
// المهلة مبنية على القياس: p95 على الكارت ٢٦٤–٤٩٤ms (منها ffmpeg ٤٤–٦٨ms).
// ─────────────────────────────────────────────────────────────────────────────

const URL_OK = "https://judge.example.com/transcribe";
const TOKEN = "kK7xQm2ZpR9tVn4bLc6HdW8sYf3jGa5U";

/** رد ناجح كامل زي ما `serving/plate_server.py:794-809` بيرجّعه بالحرف. */
function serverBody(over: Record<string, unknown> = {}) {
  return {
    plate: "ابح1234",
    plate_norm: "ابح1234",
    confidence: { mean_logprob: -0.1132, min_logprob: -0.4471, no_speech_prob: 0.0021 },
    accepted: true,
    refuse_reason: null,
    ms: 287,
    model: "whisper-plates-v5plus",
    req: "9f2c1a4b7e05",
    dur_s: 3.75,
    n_tok: 8,
    device: "cuda",
    ms_ffmpeg: 51,
    ms_model: 231,
    ...over,
  };
}

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function opts(extra: Record<string, unknown> = {}) {
  return { transcribeUrl: URL_OK, token: TOKEN, mimeType: "audio/webm;codecs=opus", ...extra };
}

const blob = () => new Blob([new Uint8Array(4096)], { type: "audio/webm" });

describe("المهلة الصارمة — مبرَّرة بالقياس", () => {
  it("ثابت مسمّى، أكبر من p95 المقيس بهامش، وأصغر من ميزانية السيرفر (١٠ث)", () => {
    const measuredP95Ms = 494;      // أسوأ p95 مقيس على الكارت (٢٦٤–٤٩٤)
    const serverBudgetMs = 10000;   // serving/plate_server.py --timeout الافتراضي
    expect(JUDGE_TIMEOUT_MS).toBe(4000);
    expect(JUDGE_TIMEOUT_MS).toBeGreaterThan(measuredP95Ms * 4);
    expect(JUDGE_TIMEOUT_MS).toBeLessThan(serverBudgetMs);
  });

  it("نافذة الصوت مقصوصة على ٣٠ث — نفس سقف مستخلِص Whisper", () => {
    expect(JUDGE_MAX_WINDOW_S).toBe(30);
  });
});

describe("buildTranscribeUrl — قصّ الصوت على السيرفر (متوافق للخلف)", () => {
  it("بلا توقيت → العنوان زي ما هو (نفس عقد /transcribe القديم)", () => {
    expect(buildTranscribeUrl(URL_OK)).toBe(URL_OK);
    expect(buildTranscribeUrl(URL_OK, undefined, undefined)).toBe(URL_OK);
  });

  it("بتوقيت سليم → start/end بالثواني", () => {
    expect(buildTranscribeUrl(URL_OK, 12500, 16000)).toBe(`${URL_OK}?start=12.500&end=16.000`);
    expect(buildTranscribeUrl(URL_OK, 0, 4200)).toBe(`${URL_OK}?start=0.000&end=4.200`);
  });

  it("بيقصّ النافذة على ٣٠ث من البداية", () => {
    expect(buildTranscribeUrl(URL_OK, 1000, 99000)).toBe(`${URL_OK}?start=1.000&end=31.000`);
  });

  it("توقيت غلط/مقلوب/سالب/غير منتهي → بلا معاملات (بيبعت المقطع كله)", () => {
    expect(buildTranscribeUrl(URL_OK, 16000, 12000)).toBe(URL_OK);   // مقلوب
    expect(buildTranscribeUrl(URL_OK, 5000, 5000)).toBe(URL_OK);     // صفر مدّة
    expect(buildTranscribeUrl(URL_OK, -1, 5000)).toBe(URL_OK);
    expect(buildTranscribeUrl(URL_OK, NaN, 5000)).toBe(URL_OK);
    expect(buildTranscribeUrl(URL_OK, 1000, Infinity)).toBe(URL_OK);
    expect(buildTranscribeUrl(URL_OK, 1000, undefined)).toBe(URL_OK);
  });
});

describe("parseJudgeResponse — مافيش ثقة في السيرفر", () => {
  it("رد كامل سليم → مقروء ومحوّل لأسماء الكود", () => {
    const r = parseJudgeResponse(serverBody());
    expect(r).toEqual({
      plate: "ابح1234",
      plateNorm: "ابح1234",
      accepted: true,
      refuseReason: null,
      meanLogprob: -0.1132,
      minLogprob: -0.4471,
      noSpeechProb: 0.0021,
      serverMs: 287,
      model: "whisper-plates-v5plus",
    });
  });

  it("رفض البوابة → اللوحة بترجع زي ما هي مع accepted=false والسبب", () => {
    const r = parseJudgeResponse(serverBody({ accepted: false, refuse_reason: "low_mean_logprob" }));
    expect(r?.accepted).toBe(false);
    expect(r?.refuseReason).toBe("low_mean_logprob");
    expect(r?.plate).toBe("ابح1234");
  });

  it("لوحة فاضية مقبولة كشكل (السيرفر بيرجّعها في _empty_result)", () => {
    const r = parseJudgeResponse(serverBody({ plate: "", plate_norm: "", accepted: false }));
    expect(r?.plate).toBe("");
    expect(r?.accepted).toBe(false);
  });

  it("قيم ثقة null مقبولة (n_tok=0 بيرجّع null فعلاً)", () => {
    const r = parseJudgeResponse(serverBody({
      confidence: { mean_logprob: null, min_logprob: null, no_speech_prob: 0.5 },
    }));
    expect(r?.meanLogprob).toBeNull();
    expect(r?.minLogprob).toBeNull();
    expect(r?.noSpeechProb).toBe(0.5);
  });

  it("جسم مش كائن → null", () => {
    for (const bad of [null, undefined, "", "ابح1234", 0, 1, true, [], [serverBody()], () => {}]) {
      expect(parseJudgeResponse(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("حقل مطلوب ناقص أو نوعه غلط → null", () => {
    expect(parseJudgeResponse(serverBody({ plate: undefined }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ plate: 1234 }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ plate: null }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ accepted: undefined }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ accepted: "true" }))).toBeNull();  // سترنج مش بوليان
    expect(parseJudgeResponse(serverBody({ accepted: 1 }))).toBeNull();
  });

  it("قيمة ثقة نوعها غلط أو غير منتهية → null (مايتفلترش، بيترفض)", () => {
    expect(parseJudgeResponse(serverBody({ confidence: { mean_logprob: "-0.1" } }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ confidence: { mean_logprob: NaN } }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ confidence: { mean_logprob: Infinity } }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ confidence: "x" }))).toBeNull();
    expect(parseJudgeResponse(serverBody({ confidence: [] }))).toBeNull();
  });

  it("مفتاح confidence غايب خالص → مقبول بقيم null (مش كسر)", () => {
    const r = parseJudgeResponse(serverBody({ confidence: undefined }));
    expect(r?.meanLogprob).toBeNull();
    expect(r?.noSpeechProb).toBeNull();
  });

  it("لوحة طويلة بشكل غير معقول → null (جسم مش من خدمتنا)", () => {
    expect(parseJudgeResponse(serverBody({ plate: "ا".repeat(200) }))).toBeNull();
  });

  it("جسم فيه error (شكل الفشل) → null حتى لو باقي الحقول سليمة", () => {
    expect(parseJudgeResponse(serverBody({ error: "audio_decode_failed" }))).toBeNull();
    expect(parseJudgeResponse({ error: "unauthorized" })).toBeNull();
  });
});

describe("postAudioForPlate — الطريق السعيد", () => {
  it("بيبعت التوكن في ترويسة (مش في الـquery) ونوع المحتوى الصح", async () => {
    const f = vi.fn(async () => jsonRes(serverBody()));
    const r = await postAudioForPlate(blob(), opts({ fetchImpl: f, startMs: 1000, endMs: 4000 }));
    expect(r?.plate).toBe("ابح1234");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_OK}?start=1.000&end=4.000`);
    expect(url).not.toContain(TOKEN);                        // السر عمره ما يبان في URL
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Plate-Token"]).toBe(TOKEN);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm;codecs=opus");
    expect(init.body).toBeInstanceOf(Blob);
    expect(init.signal).toBeDefined();
  });

  it("بلا mimeType → بيستخدم نوع الـblob", async () => {
    const f = vi.fn(async () => jsonRes(serverBody()));
    await postAudioForPlate(blob(), opts({ fetchImpl: f, mimeType: undefined }));
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
  });
});

describe("postAudioForPlate — كل فشل بيرجع null، وعمره ما يرمي", () => {
  it("إعداد ناقص (عنوان/توكن) → null بلا أي طلب", async () => {
    const f = vi.fn(async () => jsonRes(serverBody()));
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, transcribeUrl: "" }))).toBeNull();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, token: "" }))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("صوت فاضي → null بلا أي طلب", async () => {
    const f = vi.fn(async () => jsonRes(serverBody()));
    expect(await postAudioForPlate(new Blob([]), opts({ fetchImpl: f }))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("٤٠١ توكن غلط → null، **بلا** إعادة محاولة", async () => {
    const f = vi.fn(async () => jsonRes({ error: "unauthorized" }, 401));
    const onError = vi.fn();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("http_401");
  });

  it("٤١٣/٤١١/٤٠٠ → null بلا إعادة محاولة", async () => {
    for (const status of [400, 404, 411, 413]) {
      const f = vi.fn(async () => jsonRes({ error: "x" }, status));
      expect(await postAudioForPlate(blob(), opts({ fetchImpl: f }))).toBeNull();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("٥٠٣ مزنوق و٥٠٠ و٥٠٤ → null بلا إعادة محاولة (الإعادة بتزنق أكتر)", async () => {
    for (const status of [500, 503, 504]) {
      const f = vi.fn(async () => jsonRes({ error: "busy" }, status));
      const onError = vi.fn();
      expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).toBeNull();
      expect(f).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(`http_${status}`);
    }
  });

  it("جسم مش JSON → null", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } } as unknown as Response));
    const onError = vi.fn();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).toBeNull();
    expect(onError).toHaveBeenCalledWith("bad_json");
  });

  it("شكل رد غير مطابق (٢٠٠ بس الحقول غلط) → null", async () => {
    const f = vi.fn(async () => jsonRes({ plate: 1234, accepted: "yes" }));
    const onError = vi.fn();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).toBeNull();
    expect(onError).toHaveBeenCalledWith("bad_shape");
  });

  it("فشل شبكة → إعادة محاولة **واحدة** بس، وبعدين null", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const onError = vi.fn();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError, retryDelayMs: 0 }))).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith("network");
  });

  it("فشل شبكة مرة واحدة ثم نجاح → بيرجّع النتيجة", async () => {
    let n = 0;
    const f = vi.fn(async () => { if (n++ === 0) throw new TypeError("Failed to fetch"); return jsonRes(serverBody()); });
    const r = await postAudioForPlate(blob(), opts({ fetchImpl: f, retryDelayMs: 0 }));
    expect(r?.plate).toBe("ابح1234");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("مهلة (السيرفر مارد) → null، وبلا إعادة محاولة، والطلب اتلغى", async () => {
    let aborted = false;
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; rej(new DOMException("aborted", "AbortError")); });
    }));
    const onError = vi.fn();
    const r = await postAudioForPlate(blob(), opts({ fetchImpl: f, timeoutMs: 20, onError }));
    expect(r).toBeNull();
    expect(aborted).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);            // المهلة **مش** فشل شبكة
    expect(onError).toHaveBeenCalledWith("timeout");
  });

  it("أي استثناء غريب جوّه fetch (مش TypeError) → null بلا إعادة محاولة", async () => {
    const f = vi.fn(async () => { throw new Error("weird"); });
    const onError = vi.fn();
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("error");
  });

  it("onError نفسها لو رمت → الدالة برضه مابترميش", async () => {
    const f = vi.fn(async () => jsonRes({}, 401));
    const onError = () => { throw new Error("logger exploded"); };
    await expect(postAudioForPlate(blob(), opts({ fetchImpl: f, onError }))).resolves.toBeNull();
  });

  it("مافيش fetch في البيئة → null بلا رمي", async () => {
    expect(await postAudioForPlate(blob(), opts({ fetchImpl: null }))).toBeNull();
  });
});
