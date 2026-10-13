/**
 * 🔔 «نغمة التحصيل» — المالك (١٤ أكتوبر ٢٠٢٦): «عايزك تضيف نغمات الرنين … وحط في صفحه الخلفيه والنمط خيار اسمه
 * نغمه التحصيل … بحيث ان المندوب لو حب يختار واحده فيهم تبقي نغمه يسمعها لما يلاقي سيارة مطلوبه».
 *
 * الملفات في `public/tones/` — متحوّلة من ملفات المالك لـ mono ‏٩٦ كيلوبت، أقصاها ٣٠ ثانية، من غير السكوت اللي في
 * أولها، وبعلو صوت متقارب. السبب: النغمة بتتحمّل **كلها في الذاكرة** وهي بترن (Web Audio)، والنغمة الأصلية الطويلة
 * (دقيقتين ستيريو) كانت هتاخد ~٤٠ ميجا على الآيفون. وهي بتلف لحد «تم» أصلاً، فـ٣٠ ثانية كفاية.
 *
 * الاختيار بيتحفظ على الموبايل نفسه (localStorage). الافتراضي = صفّارة البرنامج زي ما هي (من غير ملف — بتشتغل أوفلاين).
 */
export interface AlertTone {
  id: string;
  name: string;
  /** null = صفّارة البرنامج (Web Audio، من غير ملف). */
  file: string | null;
}

export const DEFAULT_ALERT_TONE = "siren";

/** 🛑 السوبر أدمن الأول — `true` = الخيار يظهر للكل («انشر للكل»). */
export const ALERT_TONES_FOR_ALL = false;

export const ALERT_TONES: AlertTone[] = [
  { id: "siren", name: "صفّارة البرنامج (الافتراضي)", file: null },
  { id: "air-raid", name: "صفّارة غارة", file: "/tones/air-raid.mp3" },
  { id: "alarm", name: "إنذار", file: "/tones/alarm.mp3" },
  { id: "military", name: "رنين إنذار عسكرية", file: "/tones/military.mp3" },
  { id: "best-alarm", name: "أفضل رنين منبّه", file: "/tones/best-alarm.mp3" },
  { id: "classic-alarm", name: "المنبّه الكلاسيكي", file: "/tones/classic-alarm.mp3" },
  { id: "classic-phone", name: "الهاتف الكلاسيكي", file: "/tones/classic-phone.mp3" },
  { id: "robot", name: "استيقظ الروبوت", file: "/tones/robot.mp3" },
  { id: "samsung", name: "استيقظ سامسونج", file: "/tones/samsung.mp3" },
  { id: "turkish", name: "تركية", file: "/tones/turkish.mp3" },
  { id: "funny", name: "نغمة مضحكة جداً", file: "/tones/funny.mp3" },
  { id: "r114", name: "نغمة R114", file: "/tones/r114.mp3" },
  { id: "r33", name: "نغمة R33", file: "/tones/r33.mp3" },
];

const KEY = "ph:alertTone";

/** نغمة مش موجودة (اتشالت مثلاً) ⇒ الصفّارة — التنبيه عمره ما يسكت. */
export function alertToneById(id: string | null | undefined): AlertTone {
  return ALERT_TONES.find((t) => t.id === id) ?? ALERT_TONES[0];
}

export function loadAlertToneId(): string {
  try {
    return alertToneById(localStorage.getItem(KEY)).id;
  } catch {
    return DEFAULT_ALERT_TONE;
  }
}

export function saveAlertToneId(id: string): void {
  try { localStorage.setItem(KEY, alertToneById(id).id); } catch { /* التخزين مقفول — يفضل الافتراضي */ }
}
