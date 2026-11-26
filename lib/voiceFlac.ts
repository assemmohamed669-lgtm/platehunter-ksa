/**
 * ══════════════════════════════════════════════════════════════════════
 *  🗜️ صوت Voice PRO مضغوط **من غير أي فقد** قبل ما يطلع للنت (المالك ٢٦ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «البرنامج بيستهلك انترنت كتير جدا … اكتر من ٥٢ جيجا» ⇒ «انا عايز المضمون ميأثرش علي الشغل ابدا وفي نفس الوقت
 * نقلل بقدر المستطاع … تقيس وتعمل الصح بدون ما البرنامج يتأثر».
 *
 * مقيس قبل التعديل:
 *  · ~٣٠٠ ميجا لكل ساعة تسجيل (نافذة WAV ‏١٧٢٨٤٤ بايت كل ١.٥ث وهو بيتكلم). حامد: ١٧ ساعة في ٣ أيام ⇒ ~٥.٥ جيجا.
 *  · FLAC (`lib/flac.ts`) على ٤٩ نافذة ميدانية حقيقية: ١٠٠٧٦١ بايت (٥٨٪ ⇒ توفير ~٤٢٪)، ونفس العيّنات **بالبِت** بعد فك ffmpeg.
 *  · على السيرفرين الحقيقيين (اللوحات `sf.read` · النوع ffmpeg): نفس اللوحة ونفس النوع ٧/٧ — والفرق في الخانة الثامنة
 *    من الثقة ظهر برضه لما نفس الـWAV اتبعت مرتين (تجميع الكارت)، يعني مش من الصيغة.
 *
 * الأمان: التحويل في **لحظة الإرسال بس** — كل حاجة تانية في البرنامج (الذاكرة، أسئلة النوع، الإعادة، الحجم) لسه على نفس الـWAV.
 * أي غلطة في التحويل ⇒ الـWAV نفسه. السيرفر رفض FLAC (٤٠٠/٤١٥) ⇒ نفس النافذة تتبعت WAV، وباقي الجلسة WAV.
 */
import { wavBytesToFlac } from "./flac";

/** 🔒 السوبر أدمن الأول — المالك يسجّل شوية، الصندوق يقيس (`rv2-bytes`)، وبعدين `true` (من غير نسخة جديدة). */
export const VOICE_FLAC_FOR_ALL = false;

export function voiceFlacFor(isSuper: boolean): boolean {
  return VOICE_FLAC_FOR_ALL || isSuper === true;
}

/** WAV ⇒ FLAC بنفس العيّنات. أي حاجة غلط ⇒ نفس الـWAV (مابيرميش). */
export async function toFlacBody(wav: Blob): Promise<Blob> {
  try {
    const flac = wavBytesToFlac(new Uint8Array(await wav.arrayBuffer()));
    if (!flac || flac.length >= wav.size) return wav;   // مابيصغرش ⇒ مالوش لازمة
    // `encodeFlac` بيرجّع نسخة ليها ArrayBuffer خاص بيها (`.slice()`) — آمنة كـBlobPart
    return new Blob([flac as BlobPart], { type: "audio/flac" });
  } catch {
    return wav;
  }
}

/** السيرفر رفض الصيغة نفسها؟ ⇒ نرجع للـWAV. (الأعطال التانية — نت/٥٠٣/توكن — مالهاش علاقة بالصيغة.) */
export function formatRefused(code: string | null | undefined): boolean {
  return code === "http_400" || code === "http_415";
}

/** عدّاد الجلسة: حجم الـWAV اللي كان هيتبعت · اللي اتبعت فعلاً — للصندوق (`rv2-bytes`). */
export class NetBytes {
  wav = 0;
  sent = 0;
  windows = 0;
  add(wavSize: number, sentSize: number) {
    this.wav += wavSize;
    this.sent += sentSize;
    this.windows++;
  }
  snapshot(): { wavKB: number; sentKB: number; windows: number; pct: number } {
    return {
      wavKB: Math.round(this.wav / 1024),
      sentKB: Math.round(this.sent / 1024),
      windows: this.windows,
      pct: this.wav ? Math.round((100 * this.sent) / this.wav) : 100,
    };
  }
}
