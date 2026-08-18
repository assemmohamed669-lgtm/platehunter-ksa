/**
 * batchAudio — الوصلات اللي بتربط خط التفريغ بالتطبيق الحقيقي.
 *
 * `runBatchTranscription` مالوش علاقة بالشبكة عن قصد (عشان يتغطّى باختبارات).
 * الملف ده بيدّيله الاتنين اللي محتاجهم فعلاً: تفريغ بالمحرك العام، وقراءة
 * مقطع لوحة واحدة بالموديل المدرّب.
 */

import { blobToBase64 } from "@/lib/excel";
import { authHeader } from "@/lib/authHeader";
import type { TimedSegment, ModelReading } from "@/lib/batchTranscript";
import { planChunks, offsetSegments, encodeWav, CHUNK_SEC, TARGET_SAMPLE_RATE } from "@/lib/audioChunks";

/** فوق كده بنقسّم — نفس منطق التسجيل الحي. */
const CHUNK_SECONDS = 90;

/** يبعت جزء واحد للسيرفر ويرجّع مقاطعه بتوقيتاتها **النسبية للجزء**. */
async function postOneChunk(part: Blob, apiKey: string): Promise<TimedSegment[]> {
  const base64 = await blobToBase64(part);
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ audio: base64, mimeType: part.type || "audio/webm", apiKey }),
  });
  if (!res.ok) {
    // الرسالة العامة «تأكد من الإنترنت» كانت بتخفي السبب الحقيقي وتخلّينا
    // ندوّر في المكان الغلط. كل حالة ليها سببها ومعاها الكود.
    let detail = "";
    try { detail = ((await res.json()) as { error?: string })?.error ?? ""; } catch { /* رد مش JSON */ }
    throw new Error(
      res.status === 401 ? "الجلسة انتهت — سجّل الدخول تاني."
      : res.status === 413 ? "الجزء ده أكبر من اللي السيرفر بيستقبله."
      : res.status === 429 ? "المحرك رفض — طلبات كتير في وقت قصير. استنى شوية وجرّب تاني."
      : detail === "missing_audio_or_key" ? "مفتاح المحرك مش موجود — كلّم الإدارة تظبّطهولك."
      : `تعذّر التفريغ (كود ${res.status}${detail ? " · " + detail : ""}).`,
    );
  }
  const data = await res.json() as { segments?: TimedSegment[]; text?: string };
  if (Array.isArray(data.segments) && data.segments.length) return data.segments;
  // محرك قديم مابيرجعش توقيتات → مقطع واحد، اللوحات هتاخد توقيت تقريبي
  const text = String(data.text ?? "").trim();
  return text ? [{ text, start: 0, end: 0 }] : [];
}

/**
 * يفرّغ الصوت كله بالمحرك العام ويرجّع المقاطع **بتوقيتاتها**.
 * التوقيت هو اللي بيدّي كل لوحة موقعها بعدين.
 *
 * التسجيل الطويل بيتفكّ لأجزاء دقيقة قبل الإرسال: السيرفر بيرفض أي طلب فوق
 * ٤٫٥ ميجا (مقيس على الإنتاج)، وملف واتساب عادي ٣٫٧ ميجا بيعدّي الحد بعد
 * التحويل النصي. كل جزء بيترجع لتوقيته الصح بـ`offsetSegments`.
 */
export async function transcribeWithEngine(
  audio: Blob,
  apiKey: string,
  onChunk?: (done: number, total: number) => void,
): Promise<TimedSegment[]> {
  const parts = await splitAudioForUpload(audio);
  if (parts.length <= 1) {
    onChunk?.(0, 1);
    const segs = await postOneChunk(parts[0]?.blob ?? audio, apiKey);
    onChunk?.(1, 1);
    return segs;
  }

  const all: TimedSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    onChunk?.(i, parts.length);
    const segs = await postOneChunk(parts[i].blob, apiKey);
    all.push(...offsetSegments(segs, parts[i].offsetSec));
    onChunk?.(i + 1, parts.length);
  }
  return all;
}

/**
 * بيفكّ الصوت ويرجّعه أجزاء WAV مونو ١٦ك جاهزة للإرسال.
 *
 * لو الفكّ فشل (صيغة الجهاز مش مدعومة في `decodeAudioData`) بنرجّع الملف زي
 * ما هو **جزء واحد**: أحسن محاولة أحسن من فشل مؤكّد، ولو كان كبير السيرفر
 * هيقول كده برسالة واضحة دلوقتي.
 */
export async function splitAudioForUpload(
  audio: Blob,
): Promise<{ blob: Blob; offsetSec: number }[]> {
  try {
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return [{ blob: audio, offsetSec: 0 }];

    const ctx = new Ctx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await audio.arrayBuffer());
    } finally {
      try { await ctx.close(); } catch { /* بعض المتصفحات بتقفلها لوحدها */ }
    }

    const mono = toMono16k(decoded);
    const ranges = planChunks(mono.length / TARGET_SAMPLE_RATE, CHUNK_SEC);
    if (ranges.length <= 1) {
      return [{ blob: encodeWav(mono), offsetSec: 0 }];
    }
    return ranges.map((r) => ({
      blob: encodeWav(mono.subarray(
        Math.round(r.start * TARGET_SAMPLE_RATE),
        Math.round(r.end * TARGET_SAMPLE_RATE),
      )),
      offsetSec: r.start,
    }));
  } catch {
    return [{ blob: audio, offsetSec: 0 }];
  }
}

/**
 * بيعمل قارئ لوحات بيبعت **نافذة اللوحة بس** بدل التسجيل كله.
 *
 * `readPlateSliceWithModel` بتبعت الملف كامل مع كل لوحة وتسيب الخدمة تقصّه.
 * ده كان مقبول لتسجيل ثانيتين، لكن مع ملف ٣٫٧ ميجا و٢٠ لوحة يبقى ٧٤ ميجا رفع
 * من موبايل على بيانات — بطيء لدرجة إنه يبان معطّل.
 *
 * هنا بنفكّ الصوت **مرة واحدة**، وكل لوحة بتاخد نافذتها كـWAV صغير (٤ ثواني
 * ≈ ١٢٨ كيلو). لو الفكّ فشل بنرجع للسلوك القديم بدل ما نوقف.
 */
export function makeSliceReader(
  audio: Blob,
): (audio: Blob, startSec: number, base: string, token: string) => Promise<ModelReading | null> {
  let monoPromise: Promise<Float32Array | null> | null = null;

  const getMono = () => {
    if (!monoPromise) {
      monoPromise = (async () => {
        try {
          const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
            ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctx) return null;
          const ctx = new Ctx();
          try {
            return toMono16k(await ctx.decodeAudioData(await audio.arrayBuffer()));
          } finally {
            try { await ctx.close(); } catch { /* اتقفلت لوحدها */ }
          }
        } catch {
          return null;                       // مش قادرين نفكّه — نرجع للطريقة القديمة
        }
      })();
    }
    return monoPromise;
  };

  return async (full, startSec, base, token) => {
    const mono = await getMono();
    if (!mono) return readPlateSliceWithModel(full, startSec, base, token);

    const from = Math.max(0, startSec - 0.6);
    const to = startSec + 3.2;
    const slice = mono.subarray(
      Math.round(from * TARGET_SAMPLE_RATE),
      Math.min(mono.length, Math.round(to * TARGET_SAMPLE_RATE)),
    );
    if (slice.length < TARGET_SAMPLE_RATE / 10) return null;   // أقل من عُشر ثانية

    // بعتنا النافذة نفسها، فالخدمة تقراها كلها من غير ما تقصّ تاني.
    return readPlateSliceWithModel(encodeWav(slice), 0, base, token, 0, slice.length / TARGET_SAMPLE_RATE);
  };
}

/** بيجمع القنوات في قناة واحدة وينزّل المعدّل لـ١٦ك (أخذ أقرب عيّنة). */
function toMono16k(buf: AudioBuffer): Float32Array {
  const chans = buf.numberOfChannels;
  const srcLen = buf.length;
  const mixed = new Float32Array(srcLen);
  for (let c = 0; c < chans; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < srcLen; i++) mixed[i] += data[i] / chans;
  }
  if (buf.sampleRate === TARGET_SAMPLE_RATE) return mixed;

  const ratio = buf.sampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(srcLen / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = mixed[Math.floor(i * ratio)];
  return out;
}

/**
 * يقرا لوحة واحدة من مقطعها بالموديل المدرّب.
 *
 * بنقص نافذة حوالين الثانية اللي اتقالت فيها اللوحة — الخدمة مصمّمة لمقطع
 * قصير (ميزانيتها ١٠ ثواني)، فمينفعش نبعتلها التسجيل كله.
 */
export async function readPlateSliceWithModel(
  audio: Blob,
  startSec: number,
  base: string,
  token: string,
  fromOverride?: number,
  toOverride?: number,
): Promise<ModelReading | null> {
  const from = fromOverride ?? Math.max(0, startSec - 0.6);
  const to = toOverride ?? startSec + 3.2;
  const url = `${base}/transcribe?start_ms=${Math.round(from * 1000)}&end_ms=${Math.round(to * 1000)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      // التوكن في ترويسة بس — الـquery بيتسرّب في سجلات الوسطاء
      "X-Plate-Token": token,
      "Content-Type": audio.type || "application/octet-stream",
    },
    body: audio,
  });
  if (!res.ok) return null;
  const body = await res.json() as {
    plate?: string; plate_norm?: string; accepted?: boolean; mean_logprob?: number;
  };
  const norm = String(body.plate_norm ?? body.plate ?? "").trim();
  if (!norm) return null;
  return {
    normalized: norm,
    accepted: body.accepted !== false,
    meanLogprob: typeof body.mean_logprob === "number" ? body.mean_logprob : null,
  };
}

export { CHUNK_SECONDS };
