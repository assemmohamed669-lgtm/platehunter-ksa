/**
 * مفاتيح محرك الصوت (Deepgram / Speechmatics) + المحرك النشط.
 * المصدر الأساسي = بروفايل المندوب في Supabase (بيحطّه الأدمن)؛ بيتزامن للجهاز
 * (localStorage) أول ما التطبيق يفتح عبر applyServiceKeys، فكل كود الصوت الحالي
 * (اللي بيقرا من localStorage) يشتغل من غير تغيير. المحرك النشط حصري: تشغيل
 * واحد بيوقف التاني.
 */
import { setDeepgramKey, setDeepgramEnabled, getDeepgramKey } from "./deepgramKey";

export const LS_SPEECHMATICS_API_KEY = "ph:speechmatics:apiKey";
export const LS_SONIOX_API_KEY = "ph:soniox:apiKey";
export const LS_VOICE_ENGINE = "ph:voice:engine";

export type VoiceEngine = "deepgram" | "speechmatics" | "soniox";

export interface ServiceKeys {
  deepgram?: string;
  speechmatics?: string;
  soniox?: string;
  engine?: VoiceEngine;
  // بيانات حساب الخدمة للمندوب (سجل للأدمن بس — مش بتنزل لجهاز المندوب).
  email?: string;
  password?: string;
}

export function getSpeechmaticsKey(): string {
  if (typeof window === "undefined") return "";
  try { return (window.localStorage.getItem(LS_SPEECHMATICS_API_KEY) || "").trim(); } catch { return ""; }
}
export function setSpeechmaticsKey(v: string): void {
  try {
    if (v.trim()) window.localStorage.setItem(LS_SPEECHMATICS_API_KEY, v.trim());
    else window.localStorage.removeItem(LS_SPEECHMATICS_API_KEY);
  } catch { /* storage unavailable */ }
}

export function getSonioxKey(): string {
  if (typeof window === "undefined") return "";
  try { return (window.localStorage.getItem(LS_SONIOX_API_KEY) || "").trim(); } catch { return ""; }
}
export function setSonioxKey(v: string): void {
  try {
    if (v.trim()) window.localStorage.setItem(LS_SONIOX_API_KEY, v.trim());
    else window.localStorage.removeItem(LS_SONIOX_API_KEY);
  } catch { /* storage unavailable */ }
}

const VOICE_ENGINES: VoiceEngine[] = ["deepgram", "speechmatics", "soniox"];
export function getVoiceEngine(): VoiceEngine {
  if (typeof window === "undefined") return "deepgram";
  try {
    const v = window.localStorage.getItem(LS_VOICE_ENGINE);
    return VOICE_ENGINES.includes(v as VoiceEngine) ? (v as VoiceEngine) : "deepgram";
  } catch { return "deepgram"; }
}
export function setVoiceEngine(e: VoiceEngine): void {
  try { window.localStorage.setItem(LS_VOICE_ENGINE, e); } catch { /* storage unavailable */ }
}

/** يطبّع كائن service_keys الجاي من البروفايل لشكل موحّد. دالة نقية. */
export function normalizeServiceKeys(sk: unknown): ServiceKeys {
  if (!sk || typeof sk !== "object") return {};
  const o = sk as Record<string, unknown>;
  const engine: VoiceEngine =
    o.engine === "speechmatics" ? "speechmatics" : o.engine === "soniox" ? "soniox" : "deepgram";
  return {
    deepgram: typeof o.deepgram === "string" ? o.deepgram.trim() : "",
    speechmatics: typeof o.speechmatics === "string" ? o.speechmatics.trim() : "",
    soniox: typeof o.soniox === "string" ? o.soniox.trim() : "",
    engine,
    email: typeof o.email === "string" ? o.email : "",
    password: typeof o.password === "string" ? o.password : "",
  };
}

/**
 * يطبّق مفاتيح البروفايل (اللي حطّها الأدمن) على الجهاز — البروفايل مصدر الحقيقة.
 * لو service_keys فاضية/null بنسيب المحلي زي ما هو (فترة انتقالية / الأدمن نفسه).
 * المحرك الحصري: Deepgram مفعّل بس لو هو المحرك المختار.
 */
export function applyServiceKeys(sk: unknown): void {
  if (sk == null) return;
  const n = normalizeServiceKeys(sk);
  setDeepgramKey(n.deepgram || "");
  setSpeechmaticsKey(n.speechmatics || "");
  setSonioxKey(n.soniox || "");
  setVoiceEngine(n.engine || "deepgram");
  setDeepgramEnabled(n.engine === "deepgram"); // Deepgram شغّال بس لو هو المختار (حصري)
}

/** المفتاح النشط للمحرك المختار (للاستخدام في مسار الصوت لاحقاً). */
export function getActiveVoiceKey(): { engine: VoiceEngine; key: string } {
  const engine = getVoiceEngine();
  const key = engine === "speechmatics" ? getSpeechmaticsKey() : engine === "soniox" ? getSonioxKey() : getDeepgramKey();
  return { engine, key };
}
