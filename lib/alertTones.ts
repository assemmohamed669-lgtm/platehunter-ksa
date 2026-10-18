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

/** 🔓 «انشر للكل» (المالك ١٤ أكتوبر ٢٠٢٦) — الخيار ظاهر لكل المناديب. `false` = يرجع للسوبر أدمن بس. */
export const ALERT_TONES_FOR_ALL = true;

// الأسامي «قناص 1…12» بالترتيب — المالك (١٤ أكتوبر ٢٠٢٦): «غير اسمائهم سميهم بالترتيب قناص 1 قناص 2 وهكذا».
// الـid اسم الملف الأصلي (الاختيار المحفوظ على الموبايلات بيفضل زي ما هو).
export const ALERT_TONES: AlertTone[] = [
  { id: "siren", name: "صفّارة البرنامج (الافتراضي)", file: null },
  { id: "air-raid", name: "قناص 1", file: "/tones/air-raid.mp3" },
  { id: "alarm", name: "قناص 2", file: "/tones/alarm.mp3" },
  { id: "military", name: "قناص 3", file: "/tones/military.mp3" },
  { id: "best-alarm", name: "قناص 4", file: "/tones/best-alarm.mp3" },
  { id: "classic-alarm", name: "قناص 5", file: "/tones/classic-alarm.mp3" },
  { id: "classic-phone", name: "قناص 6", file: "/tones/classic-phone.mp3" },
  { id: "robot", name: "قناص 7", file: "/tones/robot.mp3" },
  { id: "samsung", name: "قناص 8", file: "/tones/samsung.mp3" },
  { id: "turkish", name: "قناص 9", file: "/tones/turkish.mp3" },
  { id: "funny", name: "قناص 10", file: "/tones/funny.mp3" },
  { id: "r114", name: "قناص 11", file: "/tones/r114.mp3" },
  { id: "r33", name: "قناص 12", file: "/tones/r33.mp3" },
  // المالك (١٨ أكتوبر ٢٠٢٦): «ضيفها علي النغمات … بس متثبتهاش للكل خليها ك خيار» — خيار زي الباقي، والافتراضي فاضل الصفّارة.
  { id: "gemini-music", name: "قناص 13", file: "/tones/gemini-music.mp3" },
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
