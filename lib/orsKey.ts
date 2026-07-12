/**
 * مفتاح OpenRouteService (اختياري) — لحساب وقت الوصول الدقيق بالطرق الفعلية.
 * يتخزّن على الجهاز فقط (localStorage) ويُستخدم عبر /api/ors-matrix.
 */
export const LS_ORS_API_KEY = "ph:ors:apiKey";

export function getOrsKey(): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(LS_ORS_API_KEY) || ""; } catch { return ""; }
}

export function setOrsKey(v: string): void {
  try {
    if (v.trim()) window.localStorage.setItem(LS_ORS_API_KEY, v.trim());
    else window.localStorage.removeItem(LS_ORS_API_KEY);
  } catch { /* storage unavailable */ }
}
