/**
 * عميل Speechmatics للتفريغ الفوري (Real-Time) من المتصفح.
 * الفرق عن Deepgram: (١) مصادقة بمفتاح مؤقّت (JWT) بيتعمل من المفتاح الأساسي
 * (متاح من المتصفح — CORS مسموح)؛ (٢) الصوت لازم PCM خام (pcm_s16le) — بنلتقطه
 * بـ Web Audio (ScriptProcessor) ونحوّله Int16؛ (٣) بروتوكول StartRecognition +
 * AddTranscript.
 *
 * الاستخدام معزول عن باقي الكود: بيرجّع handle فيه stop()، والصفحة بتوصّل
 * onPartial (نص حي) و onFinal (جملة نهائية) لمحلّلها الحالي.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const SM_MINT_URL = "https://mp.speechmatics.com/v1/api_keys?type=rt";
const SM_RT_URL = "wss://eu.rt.speechmatics.com/v2";

export interface SpeechmaticsCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
  language?: string; // افتراضي "ar"
}

export interface SpeechmaticsHandle {
  stop: () => Promise<void>;
}

/** محتوى أول بديل في نتيجة/توكن Speechmatics. */
function smContent(r: any): string {
  const c = r?.alternatives?.[0]?.content;
  return typeof c === "string" ? c : "";
}

/**
 * يستخرج نص الجملة من رسالة AddTranscript/AddPartialTranscript.
 *
 * الأهم (إصلاح عكس الأرقام): Speechmatics بيحوّل الأرقام المنطوقة لصيغة رقمية
 * منسّقة (ITN)، وفي العربي (RTL) بيعكس ترتيبها — المندوب يقول ٢٥٧٨ فتطلع "87 5 2".
 * لكن مع enable_entities كل رقم بيرجع كـ entity فيه **spoken_form** = الكلمات زي
 * ما اتقالت بالترتيب الصح. فبنبني النص من الكلمات المنطوقة بدل الصيغة الرقمية:
 *   • الترتيب يرجع صح (مفيش عكس)،
 *   • والأرقام المركّبة («ثلاث ستات») تفضل كلمات فالقاموس بتاعنا يحوّلها.
 *
 * نبني من results أولاً (مع spoken_form للـentities)؛ لو مفيش results نرجع لـ
 * metadata.transcript. (ملاحظة v2: النص في metadata.transcript مش في جذر الرسالة.)
 * دالة نقية — قابلة للاختبار.
 */
export function speechmaticsTranscript(msg: any): string {
  if (Array.isArray(msg?.results)) {
    const parts: string[] = [];
    for (const r of msg.results) {
      // رقم منسّق (entity): استخدم الكلمات المنطوقة بدل الصيغة الرقمية المعكوسة.
      if (r?.type === "entity" && Array.isArray(r.spoken_form) && r.spoken_form.length) {
        for (const sf of r.spoken_form) {
          const c = smContent(sf);
          if (c) parts.push(c);
        }
      } else {
        const c = smContent(r);
        if (c) parts.push(c);
      }
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined) return joined;
  }
  const t = msg?.metadata?.transcript ?? msg?.transcript;
  if (typeof t === "string" && t.trim()) return t.trim();
  return "";
}

/** يبدأ جلسة تفريغ فوري بـ Speechmatics. بيرجّع handle أو null لو فشل البدء. */
export async function startSpeechmatics(
  apiKey: string,
  cb: SpeechmaticsCallbacks,
): Promise<SpeechmaticsHandle | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC || typeof AC !== "function") return null;

  // (١) مفتاح مؤقّت (JWT) من المفتاح الأساسي.
  let jwt = "";
  try {
    const r = await fetch(SM_MINT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 }),
    });
    if (!r.ok) { cb.onError?.("مفتاح Speechmatics مرفوض — راجعه."); return null; }
    const j = await r.json().catch(() => ({}));
    jwt = j.key_value || j.jwt || j.token || "";
    if (!jwt) { cb.onError?.("تعذّر إنشاء مفتاح مؤقّت لـ Speechmatics."); return null; }
  } catch {
    cb.onError?.("تعذّر الاتصال بـ Speechmatics — راجع الإنترنت.");
    return null;
  }

  // (٢) الميكروفون + رسم صوتي (PCM).
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { cb.onError?.("محتاج إذن الميكروفون."); return null; }

  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: 16000 }); }
  catch { try { ctx = new AC(); } catch { try { stream.getTracks().forEach((t) => t.stop()); } catch {} return null; } }
  const sampleRate = Math.round(ctx.sampleRate); // نبعت المعدّل الفعلي للسيرفر

  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); // gain=0 عشان الرسم يشتغل من غير صدى مسموع
  mute.gain.value = 0;

  const ws = new WebSocket(`${SM_RT_URL}?jwt=${encodeURIComponent(jwt)}`);
  ws.binaryType = "arraybuffer";

  let started = false;
  let seqNo = 0;
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
    ws.send(JSON.stringify({
      message: "StartRecognition",
      audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: sampleRate },
      transcription_config: {
        language: cb.language || "ar",
        operating_point: "enhanced",
        enable_partials: true,
        // اللوحة بتتقال حرف-بحرف على مدى ٣-٤ث؛ max_delay قصير (٢) كان بيقفل
        // الجملة في نصّها فتتفتّت لكذا نتيجة نهائية (واحد. / دال / هي.) والحروف
        // تتفصل عن أرقامها فتضيع. ٤ (الأقصى) + flexible = يجمّع اللوحة كلها في
        // نتيجة واحدة ومايقطعش مجموعة الأرقام في نصّها.
        max_delay: 4,
        max_delay_mode: "flexible",
        // إيقاف الترقيم — النقط بتفتّت النص وتزوّد حدود النتائج النهائية بلا داعي.
        punctuation_overrides: { permitted_marks: [] },
        // تفعيل الـentities — عشان الأرقام ترجع بصيغة النطق (spoken_form) مش الصيغة
        // الرقمية المنسّقة اللي بتتعكس في العربي. speechmaticsTranscript بيستخدم
        // الكلمات المنطوقة → الترتيب صح + القاموس بتاعنا يشتغل على الأرقام المركّبة.
        enable_entities: true,
      },
    }));
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
    if (!msg) return;
    switch (msg.message) {
      case "RecognitionStarted": {
        started = true;
        proc.onaudioprocess = (e: AudioProcessingEvent) => {
          if (closed || !started || ws.readyState !== WebSocket.OPEN) return;
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
        break;
      }
      case "AudioAdded":
        if (typeof msg.seq_no === "number") seqNo = msg.seq_no;
        break;
      case "AddPartialTranscript": {
        const t = speechmaticsTranscript(msg); // النص في metadata.transcript
        if (t) cb.onPartial?.(t);
        break;
      }
      case "AddTranscript": {
        const t = speechmaticsTranscript(msg); // النص في metadata.transcript
        if (t) cb.onFinal?.(t);
        break;
      }
      case "Error":
        cb.onError?.(`Speechmatics: ${msg.reason || msg.type || "خطأ"}`);
        break;
      default:
        break;
    }
  };

  ws.onerror = () => { if (!closed) cb.onError?.("خطأ في الاتصال بـ Speechmatics."); };

  return {
    stop: async () => {
      if (closed) return;
      closed = true;
      teardownAudio();
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: seqNo })); } catch {}
      await new Promise((r) => setTimeout(r, 350));
      try { ws.close(); } catch {}
    },
  };
}
