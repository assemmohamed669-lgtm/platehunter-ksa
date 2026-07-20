/**
 * مفتاح Deepgram مشترك: السوبر أدمن يحطّه مرة واحدة، وكل المناديب ياخدوه تلقائياً.
 * التخزين في جدول app_settings (صف مفرد) عبر دوال RPC (لأن الجدول بدون سياسة
 * select مباشرة). المفتاح بيتقرا client-side لأن المناديب بيستخدموه مباشرة مع
 * Deepgram (نفس تعريض المفتاح المحلي الحالي).
 *
 * محتاج تشغيل SQL مرة واحدة: docs/sql/shared-deepgram-key.sql
 */
import { supabase } from "./supabaseClient";

/** يقرأ المفتاح المشترك (لأي مستخدم مسجّل). "" لو مفيش أو فشل. */
export async function fetchSharedDeepgramKey(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("get_shared_deepgram_key");
    if (error) return "";
    return typeof data === "string" ? data.trim() : "";
  } catch {
    return "";
  }
}

/** يحطّ/يغيّر المفتاح المشترك (أدمن فقط — الدالة على السيرفر بتتحقق). */
export async function setSharedDeepgramKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc("set_shared_deepgram_key", { p_key: key });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
