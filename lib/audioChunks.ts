/**
 * audioChunks — بيقطّع التسجيل الطويل لأجزاء يقدر السيرفر يستقبلها.
 *
 * **ليه ده موجود أصلاً (مقيس، مش مفترض):** السيرفر بيرفض أي طلب أكبر من
 * ٤٫٥ ميجا بـ`FUNCTION_PAYLOAD_TOO_LARGE` — اتقاس على الإنتاج: ٤ ميجا عدّت،
 * ٥ ميجا اترفضت. والصوت بيتحوّل لنص (base64) قبل الإرسال فبيكبر الثلث. يعني
 * ملف واتساب عادي ٣٫٧ ميجا بيبقى ٤٫٩ ميجا ⇒ مرفوض قبل ما يوصل للكود.
 *
 * الطلب كان صريح: «مهما كان عدد اللوحات يتفرّغ». تسجيل نص ساعة ماينفعش يتبعت
 * مرة واحدة، فبنفكّه لأجزاء دقيقة، نبعت كل جزء لوحده، ونرجّع التوقيتات لمكانها
 * الصح من أول التسجيل.
 *
 * التوقيت مش تفصيلة: منه بييجي **موقع كل عربية**. جزء بتوقيت غلط = لوحات في
 * أماكن غلط، وده أسوأ من إننا مانفرّغش أصلاً.
 *
 * المنطق هنا نقي وقابل للاختبار؛ فكّ الصوت نفسه (AudioContext) في batchAudio.
 */

/**
 * طول الجزء بالثواني.
 *
 * الحساب: ٦٠ ث × ١٦٠٠٠ عيّنة × ٢ بايت = ١٫٩٢ ميجا، وبعد التحويل النصي ٢٫٥٦
 * ميجا — أقل من سقف السيرفر بهامش مريح حتى لو الترويسات كبرت.
 */
export const CHUNK_SEC = 60;

/** معدّل العيّنات اللي الموديل والمحرك متدربين عليه. */
export const TARGET_SAMPLE_RATE = 16000;

export interface ChunkRange {
  /** بداية الجزء بالثواني من أول التسجيل. */
  start: number;
  end: number;
}

export interface TimedSegment {
  text: string;
  start: number;
  end: number;
}

/**
 * بيقسّم تسجيل طوله `totalSec` لأجزاء متتابعة بلا فجوة ولا تداخل.
 *
 * أي طول مش منطقي (صفر · سالب · NaN) بيرجّع ليستة فاضية — أحسن من إننا
 * نبعت أجزاء مخترعة للسيرفر.
 */
export function planChunks(totalSec: number, chunkSec: number = CHUNK_SEC): ChunkRange[] {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return [];
  const step = Number.isFinite(chunkSec) && chunkSec > 0 ? chunkSec : CHUNK_SEC;
  const out: ChunkRange[] = [];
  for (let start = 0; start < totalSec; start += step) {
    out.push({ start, end: Math.min(start + step, totalSec) });
  }
  return out;
}

/**
 * بيرجّع توقيتات مقاطع الجزء لمكانها من **أول التسجيل**.
 *
 * المحرك بيدّي توقيت نسبي لبداية الجزء اللي بعتناهوله (٢ ثانية = الثانية
 * التانية في الجزء ده هو). من غير الإزاحة دي كل لوحات الجزء التالت هتبان
 * وكأنها اتقالت في أول دقيقة — والموقع بتاعها يطلع غلط.
 */
export function offsetSegments(segments: TimedSegment[], offsetSec: number): TimedSegment[] {
  if (!offsetSec) return segments;
  return segments.map((s) => ({ ...s, start: s.start + offsetSec, end: s.end + offsetSec }));
}

/**
 * بيحوّل عيّنات الصوت لملف WAV مونو ١٦-بت — الصيغة اللي المحرك والموديل
 * متدربين عليها، ومافيهاش ضغط يحتاج مكتبة زيادة.
 *
 * العيّنة الأعلى من المدى **بتتقص** مش بتلفّ: `Math.round(2 * 32767)` بيطلع
 * رقم بره حدود ١٦-بت، والكتابة بتاخد أقل بايتين فبيتحوّل لصوت سالب ⇒ طقطقة
 * تخبط تفريغ اللوحة.
 */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) dv.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  dv.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  dv.setUint32(16, 16, true);                 // طول كتلة fmt
  dv.setUint16(20, 1, true);                  // PCM بلا ضغط
  dv.setUint16(22, 1, true);                  // مونو
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);     // بايت في الثانية
  dv.setUint16(32, 2, true);                  // بايت لكل إطار
  dv.setUint16(34, 16, true);                 // بت للعيّنة
  ascii(36, "data");
  dv.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([buf], { type: "audio/wav" });
}
