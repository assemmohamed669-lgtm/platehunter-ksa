/**
 * مفتاح Deepgram — لتفريغ صوتي streaming دقيق (موديل nova-3، لهجة مصرية ar-EG).
 * يتخزّن على الجهاز فقط (localStorage)، وبيتبعت مباشرة لـ Deepgram عبر WebSocket
 * (مش بيمرّ على سيرفرنا) — فالاستخدام على حساب المندوب نفسه.
 */
export const LS_DEEPGRAM_API_KEY = "ph:deepgram:apiKey";

export function getDeepgramKey(): string {
  if (typeof window === "undefined") return "";
  try { return (window.localStorage.getItem(LS_DEEPGRAM_API_KEY) || "").trim(); } catch { return ""; }
}

export function setDeepgramKey(v: string): void {
  try {
    if (v.trim()) window.localStorage.setItem(LS_DEEPGRAM_API_KEY, v.trim());
    else window.localStorage.removeItem(LS_DEEPGRAM_API_KEY);
  } catch { /* storage unavailable */ }
}

// ─── إيقاف/تشغيل مؤقت ────────────────────────────────────────────────────
// المستخدم يقدر يوقف Deepgram مؤقتاً من غير ما يفقد المفتاح (يفضل محفوظ).
// وقت الإيقاف، صفحات الصوت بتستخدم getActiveDeepgramKey() اللي بترجّع فاضي →
// فبترجع للمحرك التاني (Groq/المحلي) تلقائياً.
export const LS_DEEPGRAM_ENABLED = "ph:deepgram:enabled";

/** الحالة الافتراضية "شغّال" (null/غير محدّد = true)؛ "0" بس = متوقّف. */
export function parseEnabledFlag(raw: string | null): boolean {
  return raw !== "0";
}

/** المفتاح النشط = المفتاح لو شغّال، وإلا فاضي (مع تشذيب الفراغات). */
export function resolveActiveDeepgramKey(key: string, enabled: boolean): string {
  return enabled ? key.trim() : "";
}

export function isDeepgramEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try { return parseEnabledFlag(window.localStorage.getItem(LS_DEEPGRAM_ENABLED)); } catch { return true; }
}

export function setDeepgramEnabled(v: boolean): void {
  try {
    if (v) window.localStorage.removeItem(LS_DEEPGRAM_ENABLED); // الافتراضي = شغّال
    else window.localStorage.setItem(LS_DEEPGRAM_ENABLED, "0");
  } catch { /* storage unavailable */ }
}

/** يستخدمه مسار الصوت: يحترم حالة الإيقاف المؤقت. */
export function getActiveDeepgramKey(): string {
  return resolveActiveDeepgramKey(getDeepgramKey(), isDeepgramEnabled());
}

// حروف اللوحات السعودية بالنطق — نمرّرها كـ keyterms لـ Deepgram عشان الموديل
// يتحيّز ليها ويقلّل غلط التهجئة (بند دقّة أساسي لحالتنا).
export const PLATE_LETTER_KEYTERMS = [
  "ألف", "باء", "حاء", "دال", "راء", "سين", "صاد", "طاء",
  "عين", "قاف", "كاف", "لام", "ميم", "نون", "هاء", "واو", "ياء",
];
