/**
 * مفاتيح محرك الصوت + المحرك النشط.
 * المصدر الأساسي = بروفايل المندوب في Supabase (بيحطّه الأدمن)؛ بيتزامن للجهاز
 * (localStorage) أول ما التطبيق يفتح عبر applyServiceKeys، فكل كود الصوت الحالي
 * (اللي بيقرا من localStorage) يشتغل من غير تغيير. المحرك النشط حصري: تشغيل
 * واحد بيوقف التاني.
 *
 * المحركات:
 *  - deepgram / speechmatics: تفريغ لحظي (streaming).
 *  - groq: Whisper large-v3 — تسجيل ثم تحليل (بيستخدم مفتاح Groq اللي المندوب
 *    حاطه من صفحة المفاتيح — مش بيتدار من هنا).
 *  - elevenlabs: Scribe — تسجيل ثم تحليل (مفتاح خاص بيحطّه الأدمن).
 */
import { setDeepgramKey, setDeepgramEnabled, getDeepgramKey } from "./deepgramKey";

export const LS_SPEECHMATICS_API_KEY = "ph:speechmatics:apiKey";
export const LS_ELEVENLABS_API_KEY = "ph:elevenlabs:apiKey";
export const LS_VOICE_ENGINE = "ph:voice:engine";
// مفتاح Groq بيتدار من صفحة المفاتيح (GroqKeyEditor) — بنقراه بس هنا.
const LS_GROQ_API_KEY = "ph:registration:groqApiKey";

export type VoiceEngine = "deepgram" | "speechmatics" | "groq" | "elevenlabs";

export interface ServiceKeys {
  deepgram?: string;
  speechmatics?: string;
  elevenlabs?: string;
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

export function getElevenlabsKey(): string {
  if (typeof window === "undefined") return "";
  try { return (window.localStorage.getItem(LS_ELEVENLABS_API_KEY) || "").trim(); } catch { return ""; }
}
export function setElevenlabsKey(v: string): void {
  try {
    if (v.trim()) window.localStorage.setItem(LS_ELEVENLABS_API_KEY, v.trim());
    else window.localStorage.removeItem(LS_ELEVENLABS_API_KEY);
  } catch { /* storage unavailable */ }
}

/** مفتاح Groq المحفوظ على الجهاز (اللي المندوب حاطه من صفحة المفاتيح). */
export function getGroqKey(): string {
  if (typeof window === "undefined") return "";
  try { return (window.localStorage.getItem(LS_GROQ_API_KEY) || "").trim(); } catch { return ""; }
}

const VOICE_ENGINES: VoiceEngine[] = ["deepgram", "speechmatics", "groq", "elevenlabs"];
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
  const engine: VoiceEngine = VOICE_ENGINES.includes(o.engine as VoiceEngine)
    ? (o.engine as VoiceEngine)
    : "deepgram";
  return {
    deepgram: typeof o.deepgram === "string" ? o.deepgram.trim() : "",
    speechmatics: typeof o.speechmatics === "string" ? o.speechmatics.trim() : "",
    elevenlabs: typeof o.elevenlabs === "string" ? o.elevenlabs.trim() : "",
    engine,
    email: typeof o.email === "string" ? o.email : "",
    password: typeof o.password === "string" ? o.password : "",
  };
}

/**
 * يطبّق مفاتيح البروفايل (اللي حطّها الأدمن) على الجهاز — البروفايل مصدر الحقيقة.
 * لو service_keys فاضية/null بنسيب المحلي زي ما هو (فترة انتقالية / الأدمن نفسه).
 * المحرك الحصري: Deepgram مفعّل بس لو هو المحرك المختار.
 * ملاحظة: مفتاح Groq مش بيتلمس هنا — بيتدار من صفحة المفاتيح بتاعة المندوب.
 */
export function applyServiceKeys(sk: unknown): void {
  if (sk == null) return;
  const n = normalizeServiceKeys(sk);
  setDeepgramKey(n.deepgram || "");
  setSpeechmaticsKey(n.speechmatics || "");
  setElevenlabsKey(n.elevenlabs || "");
  setVoiceEngine(n.engine || "deepgram");
  setDeepgramEnabled(n.engine === "deepgram"); // Deepgram شغّال بس لو هو المختار (حصري)
}

/** المفتاح النشط للمحرك المختار. */
export function getActiveVoiceKey(): { engine: VoiceEngine; key: string } {
  const engine = getVoiceEngine();
  const key = engine === "speechmatics" ? getSpeechmaticsKey()
    : engine === "elevenlabs" ? getElevenlabsKey()
    : engine === "groq" ? getGroqKey()
    : getDeepgramKey();
  return { engine, key };
}
