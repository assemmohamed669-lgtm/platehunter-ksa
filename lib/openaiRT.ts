/**
 * عميل OpenAI Realtime للتفريغ الفوري (Real-Time) من المتصفح — نفس أداة تفريغ
 * الصوت في ChatGPT (gpt-4o-transcribe).
 *
 * الفروق عن Soniox/Speechmatics:
 *  (١) المصادقة: المتصفح مايقدرش يحطّ Authorization على WebSocket، فبنعمل
 *      **مفتاح مؤقّت (ek_...)** من المفتاح الأساسي عبر REST (زي Speechmatics)،
 *      وبنحطّه في **الـ subprotocol** بتاع الـ WebSocket.
 *  (٢) الصوت: لازم PCM16 mono little-endian بمعدّل 24kHz، و**base64 جوه JSON**
 *      (مش binary زي Soniox). فبنعمل resample من معدّل الالتقاط لـ 24k.
 *  (٣) البروتوكول: session.update أول، بعدين input_audio_buffer.append، والردود
 *      conversation.item.input_audio_transcription.delta (حي) / .completed (نهائي).
 *
 * معزول: بيرجّع handle فيه stop()، والصفحة بتوصّل onPartial/onFinal لمحلّلها.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OPENAI_MINT_URL = "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_RT_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const OPENAI_MODEL = "gpt-4o-transcribe";
const OUT_RATE = 24000; // OpenAI بيطلب 24kHz
// تلميح للموديل بحروف اللوحات السعودية (تعزيز ناعم للمفردات — مفيش قائمة كلمات مخصّصة في OpenAI).
const PLATE_PROMPT = "لوحات سيارات سعودية: حروف عربية (أ ب ح د ر س ص ط ع ق ك ل م ن ه و ي) وأرقام";

export interface OpenAICallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
  language?: string; // افتراضي "ar"
}

export interface OpenAIHandle {
  stop: () => Promise<void>;
}

// ── دوال نقية (قابلة للاختبار) ──────────────────────────────────────────────

/** استيفاء خطّي لإعادة تشكيل معدّل العيّنات (مثلاً 16k/48k → 24k). */
export function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate || input.length === 0) return input;
  const ratio = outRate / inRate;
  const outLen = Math.round(input.length * ratio);
  const out = new Float32Array(outLen);
  const lastIdx = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = i0 + 1 <= lastIdx ? i0 + 1 : lastIdx;
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** تحويل Float32 [-1,1] لـ Int16 مع القصّ. */
export function floatToInt16(f32: Float32Array): Int16Array {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return i16;
}

/** base64 لبايتات الـ Int16 الخام (little-endian) — على دفعات لتفادي طفح المكدّس. */
export function pcm16ToBase64(i16: Int16Array): string {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

// ── العميل ──────────────────────────────────────────────────────────────────

/** يبدأ جلسة تفريغ فوري بـ OpenAI. بيرجّع handle أو null لو فشل البدء. */
export async function startOpenAI(
  apiKey: string,
  cb: OpenAICallbacks,
): Promise<OpenAIHandle | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC || typeof AC !== "function") return null;

  const language = cb.language || "ar";

  // (١) مفتاح مؤقّت (ek_...) من المفتاح الأساسي — المتصفح مايقدرش يحطّ
  // Authorization على WebSocket، فبنحطّ المؤقّت في الـ subprotocol.
  let ek = "";
  try {
    const r = await fetch(OPENAI_MINT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: OUT_RATE },
              transcription: { model: OPENAI_MODEL, language, prompt: PLATE_PROMPT },
            },
          },
        },
      }),
    });
    if (!r.ok) { cb.onError?.("مفتاح OpenAI مرفوض — راجعه."); return null; }
    const j = await r.json().catch(() => ({} as any));
    ek = j.value || j.client_secret?.value || "";
    if (!ek) { cb.onError?.("تعذّر إنشاء مفتاح OpenAI المؤقّت."); return null; }
  } catch {
    cb.onError?.("تعذّر الاتصال بـ OpenAI — راجع الإنترنت.");
    return null;
  }

  // (٢) الميكروفون + رسم صوتي (PCM).
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { cb.onError?.("محتاج إذن الميكروفون."); return null; }

  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: 16000 }); }
  catch { try { ctx = new AC(); } catch { try { stream.getTracks().forEach((t) => t.stop()); } catch {} return null; } }
  const inRate = Math.round(ctx.sampleRate); // ممكن 16000 أو 48000 حسب المتصفح

  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); // gain=0 عشان الرسم يشتغل من غير صدى مسموع
  mute.gain.value = 0;

  // (٣) WebSocket — المفتاح المؤقّت في الـ subprotocol.
  const ws = new WebSocket(OPENAI_RT_URL, ["realtime", "openai-insecure-api-key." + ek]);
  let closed = false;
  let live = ""; // نص حي متراكم (الـ delta تراكمية)

  const teardownAudio = () => {
    try { proc.onaudioprocess = null; } catch {}
    try { source.disconnect(); } catch {}
    try { proc.disconnect(); } catch {}
    try { mute.disconnect(); } catch {}
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { void ctx.close(); } catch {}
  };

  ws.onopen = () => {
    if (closed) { try { ws.close(); } catch {} return; }
    // ضبط الجلسة: تفريغ عربي + VAD بسيط بيقطع تلقائياً بعد سكتة قصيرة.
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: OUT_RATE },
            transcription: { model: OPENAI_MODEL, language, prompt: PLATE_PROMPT },
            noise_reduction: { type: "near_field" },
            turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 300 },
          },
        },
      },
    }));
    // نبدأ نبعت الصوت فوراً (base64 جوه JSON، بعد resample لـ 24k).
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      const f32 = resampleLinear(e.inputBuffer.getChannelData(0), inRate, OUT_RATE);
      const i16 = floatToInt16(f32);
      try { ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm16ToBase64(i16) })); } catch {}
    };
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
    if (!msg) return;
    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        live = ""; // بداية جملة جديدة → صفّر التراكم
        break;
      case "conversation.item.input_audio_transcription.delta":
        live += msg.delta || "";
        if (live.trim()) cb.onPartial?.(live.trim());
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof msg.transcript === "string" && msg.transcript.trim()) cb.onFinal?.(msg.transcript.trim());
        live = "";
        break;
      case "conversation.item.input_audio_transcription.failed":
        cb.onError?.(`OpenAI: ${msg.error?.message || "فشل التفريغ"}`);
        break;
      case "error":
        cb.onError?.(`OpenAI: ${msg.error?.message || "خطأ"}`);
        break;
      default:
        break;
    }
  };

  ws.onerror = () => { if (!closed) cb.onError?.("خطأ في الاتصال بـ OpenAI — راجع المفتاح والإنترنت."); };

  return {
    stop: async () => {
      if (closed) return;
      closed = true;
      teardownAudio();
      // ننتظر شوية عشان ذيل آخر جملة يتفرّغ ويوصل .completed قبل ما نقفل.
      await new Promise((r) => setTimeout(r, 1500));
      try { ws.close(); } catch {}
    },
  };
}
