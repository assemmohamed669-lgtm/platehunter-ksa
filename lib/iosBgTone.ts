/**
 * ══════════════════════════════════════════════════════════════════════
 *  🍏🔊 نغمة المطلوبة **عالية** على الآيفون والمندوب برّه البرنامج — من غير نسخة جديدة (المالك ٢٣ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «مفيش حل غير بناء نسخه جديدة دة مقرف … نغمه البرنامج طالعه معاه بس المشكله ان صوتها واطي» ⇒ «يلا» + «وانشر للكل».
 *
 * صندوق شريف فرج ايفون (٤:٥٢م): برّه البرنامج المايك متساب شغّال (`lib/wantedBgAlert.ts` — هو اللي مصحّي البرنامج)، والآيفون
 * وهو بيسجّل بيوطّي أي صوت تاني، والصفّارة (Web Audio) بتتقطع بعد ثانيتين (`siren-2s ctx=interrupted`).
 *
 * التجربة: **لحظة التنبيه بس** (التسجيل العادي مابيتلمسش عند حد) ⇒ عنصر صوت عادي (`<audio>`) بالنغمة المختارة، لفّة. لو
 * **فعلاً شغّال** ⇒ الصفحة توقّف المايك (مفيش توطية) وتمسك بلجن الخلفية لحد «تم». لو الآيفون رفضه ⇒ زي قبل كده بالحرف (المايك
 * يفضل + النغمة الواطية + الإشعار). الصندوق: `rv2-bg-tone` (اشتغل؟ ولسه شغّال بعد ثانيتين من وقف المايك؟).
 * الأندرويد مش محتاجه — الخدمة بتخلّي الصفّارة ترن عالي أصلاً.
 */
import { alertToneById } from "./alertTones";

/** 🟢 للكل — المالك: «وانشر للكل». الرجوع = false (من غير نسخة جديدة). */
export const IOS_BG_TONE_FOR_ALL = true;

/** «صفّارة البرنامج» مالهاش ملف (Web Audio) ⇒ أقرب نغمة ليها (قناص 1 — صفّارة غارة). */
export const BG_TONE_FALLBACK_FILE = "/tones/air-raid.mp3";

export function iosBgToneFor(platform: string): boolean {
  return IOS_BG_TONE_FOR_ALL && platform === "ios";
}

export function bgToneFile(toneId: string | null | undefined): string {
  return alertToneById(toneId).file ?? BG_TONE_FALLBACK_FILE;
}

type ToneEl = Pick<HTMLAudioElement, "src" | "loop" | "muted" | "paused" | "currentTime" | "play" | "pause">;

export class BgTone {
  private el: ToneEl | null = null;

  constructor(private readonly make: () => ToneEl | null = defaultMake) {}

  /** شغّالة دلوقتي ومش مكتومة؟ */
  get ringing(): boolean {
    const el = this.el;
    return !!el && !el.paused && !el.muted;
  }

  /** يشغّل النغمة لفّة من الأول. `true` = **فعلاً** شغّالة (الآيفون ماوقّفهاش). مابيرميش. */
  async ring(file: string): Promise<boolean> {
    try {
      if (!this.el) {
        const el = this.make();
        if (!el) return false;
        el.loop = true;
        el.src = file;
        this.el = el;
      }
      const el = this.el;
      el.muted = false;
      try { el.currentTime = 0; } catch { /* لسه مااتحمّلش — هيبدأ من الأول أصلاً */ }
      await el.play();
      if (el.paused) { this.stop(); return false; }
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(): void {
    const el = this.el;
    this.el = null;
    if (!el) return;
    try { el.pause(); } catch { /* ignore */ }
    try { el.src = ""; } catch { /* ignore */ }
  }
}

function defaultMake(): ToneEl | null {
  try {
    if (typeof Audio === "undefined") return null;
    const a = new Audio();
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    return a;
  } catch {
    return null;
  }
}
