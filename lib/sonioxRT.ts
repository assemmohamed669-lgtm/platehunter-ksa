/**
 * عميل Soniox للتفريغ الفوري (Real-Time) من المتصفح.
 * أبسط من Speechmatics: المفتاح بيتبعت **جوه رسالة البدء على الـ WebSocket**
 * مباشرة (مفيش مفتاح مؤقّت ولا REST ولا CORS). الصوت PCM خام (s16le) — بنلتقطه
 * بـ Web Audio زي Speechmatics. بروتوكول: رسالة config أول، بعدين PCM binary،
 * والردود {tokens:[{text,is_final}]}.
 *
 * معزول: بيرجّع handle فيه stop()، والصفحة بتوصّل onPartial/onFinal لمحلّلها.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const SONIOX_RT_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const SONIOX_MODEL = "stt-rt-v5";

export interface SonioxCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
  language?: string; // افتراضي "ar"
}

export interface SonioxHandle {
  stop: () => Promise<void>;
}

/** يبدأ جلسة تفريغ فوري بـ Soniox. بيرجّع handle أو null لو فشل البدء. */
export async function startSoniox(
  apiKey: string,
  cb: SonioxCallbacks,
): Promise<SonioxHandle | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC || typeof AC !== "function") return null;

  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { cb.onError?.("محتاج إذن الميكروفون."); return null; }

  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: 16000 }); }
  catch { try { ctx = new AC(); } catch { try { stream.getTracks().forEach((t) => t.stop()); } catch {} return null; } }
  const sampleRate = Math.round(ctx.sampleRate);

  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const ws = new WebSocket(SONIOX_RT_URL);
  ws.binaryType = "arraybuffer";
  let closed = false;

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
    // رسالة البدء: المفتاح + الموديل + صيغة الصوت + تلميح اللغة.
    ws.send(JSON.stringify({
      api_key: apiKey,
      model: SONIOX_MODEL,
      audio_format: "s16le",
      sample_rate: sampleRate,
      num_channels: 1,
      language_hints: [cb.language || "ar"],
    }));
    // نبدأ نبعت الصوت فوراً (Soniox مش محتاج ack).
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      try { ws.send(i16.buffer); } catch {}
    };
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
    if (!msg) return;
    if (msg.error_code || msg.error_message) {
      cb.onError?.(`Soniox: ${msg.error_message || msg.error_code}`);
      return;
    }
    if (Array.isArray(msg.tokens)) {
      // النهائي = التوكنز اللي is_final؛ الحي = كل التوكنز للعرض.
      const finalText = msg.tokens.filter((t: any) => t?.is_final).map((t: any) => t?.text ?? "").join("");
      const allText = msg.tokens.map((t: any) => t?.text ?? "").join("");
      if (allText.trim()) cb.onPartial?.(allText.trim());
      if (finalText.trim()) cb.onFinal?.(finalText.trim());
    }
    // msg.finished === true → السيرفر خلّص؛ مفيش إجراء إضافي مطلوب.
  };

  ws.onerror = () => { if (!closed) cb.onError?.("خطأ في الاتصال بـ Soniox — راجع المفتاح والإنترنت."); };

  return {
    stop: async () => {
      if (closed) return;
      closed = true;
      teardownAudio();
      // إشارة نهاية البث = فريم فاضي.
      try { if (ws.readyState === WebSocket.OPEN) ws.send(""); } catch {}
      await new Promise((r) => setTimeout(r, 350));
      try { ws.close(); } catch {}
    },
  };
}
