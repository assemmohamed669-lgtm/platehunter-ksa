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

// حروف اللوحات السعودية بالنطق — نمرّرها كـ keyterms لـ Deepgram عشان الموديل
// يتحيّز ليها ويقلّل غلط التهجئة (بند دقّة أساسي لحالتنا).
export const PLATE_LETTER_KEYTERMS = [
  "ألف", "باء", "حاء", "دال", "راء", "سين", "صاد", "طاء",
  "عين", "قاف", "كاف", "لام", "ميم", "نون", "هاء", "واو", "ياء",
];
