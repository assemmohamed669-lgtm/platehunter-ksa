/**
 * مفاتيح محرك الصوت (Deepgram / Speechmatics) + المحرك النشط.
 * المصدر الأساسي = بروفايل المندوب في Supabase (بيحطّه الأدمن)؛ بيتزامن للجهاز
 * (localStorage) أول ما التطبيق يفتح عبر applyServiceKeys، فكل كود الصوت الحالي
 * (اللي بيقرا من localStorage) يشتغل من غير تغيير. المحرك النشط حصري: تشغيل
 * واحد بيوقف التاني.
 */
import { setDeepgramKey, setDeepgramEnabled, getDeepgramKey } from "./deepgramKey";

export const LS_SPEECHMATICS_API_KEY = "ph:speechmatics:apiKey";
export const LS_VOICE_ENGINE = "ph:voice:engine";

export type VoiceEngine = "deepgram" | "speechmatics";

export interface ServiceKeys {
  deepgram?: string;
  speechmatics?: string;
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

export function getVoiceEngine(): VoiceEngine {
  if (typeof window === "undefined") return "deepgram";
  try { return window.localStorage.getItem(LS_VOICE_ENGINE) === "speechmatics" ? "speechmatics" : "deepgram"; }
  catch { return "deepgram"; }
}
export function setVoiceEngine(e: VoiceEngine): void {
  try { window.localStorage.setItem(LS_VOICE_ENGINE, e); } catch { /* storage unavailable */ }
}

/** يطبّع كائن service_keys الجاي من البروفايل لشكل موحّد. دالة نقية. */
export function normalizeServiceKeys(sk: unknown): ServiceKeys {
  if (!sk || typeof sk !== "object") return {};
  const o = sk as Record<string, unknown>;
  return {
    deepgram: typeof o.deepgram === "string" ? o.deepgram.trim() : "",
    speechmatics: typeof o.speechmatics === "string" ? o.speechmatics.trim() : "",
    engine: o.engine === "speechmatics" ? "speechmatics" : "deepgram",
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
  setVoiceEngine(n.engine || "deepgram");
  setDeepgramEnabled(n.engine !== "speechmatics");
}

/** المفتاح النشط للمحرك المختار (للاستخدام في مسار الصوت لاحقاً). */
export function getActiveVoiceKey(): { engine: VoiceEngine; key: string } {
  const engine = getVoiceEngine();
  return { engine, key: engine === "speechmatics" ? getSpeechmaticsKey() : getDeepgramKey() };
}
