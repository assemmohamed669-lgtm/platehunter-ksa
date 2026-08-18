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

/** فوق كده بنقسّم — نفس منطق التسجيل الحي. */
const CHUNK_SECONDS = 90;

/**
 * يفرّغ الصوت كله بالمحرك العام ويرجّع المقاطع **بتوقيتاتها**.
 * التوقيت هو اللي بيدّي كل لوحة موقعها بعدين.
 */
export async function transcribeWithEngine(
  audio: Blob,
  apiKey: string,
): Promise<TimedSegment[]> {
  const base64 = await blobToBase64(audio);
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ audio: base64, mimeType: audio.type || "audio/webm", apiKey }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401
      ? "الجلسة انتهت — سجّل الدخول تاني."
      : "تعذّر التفريغ — تأكد من الإنترنت وجرّب تاني.");
  }
  const data = await res.json() as { segments?: TimedSegment[]; text?: string };
  if (Array.isArray(data.segments) && data.segments.length) return data.segments;
  // محرك قديم مابيرجعش توقيتات → مقطع واحد، اللوحات هتاخد توقيت تقريبي
  const text = String(data.text ?? "").trim();
  return text ? [{ text, start: 0, end: 0 }] : [];
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
): Promise<ModelReading | null> {
  const from = Math.max(0, startSec - 0.6);
  const to = startSec + 3.2;
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
