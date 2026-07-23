/**
 * مفتاح جمع/تعلّم الصوت — إعداد مركزي على السيرفر، **السوبر أدمن بس** يغيّره،
 * وكل الأجهزة تقراه. الافتراضي **متوقّف (false)** — آمن: مفيش أي جمع/تعلّم
 * يشتغل من غير ما السوبر أدمن يفعّله صراحةً.
 *
 * يعتمد على app_settings (نفس نمط المفتاح المشترك). محتاج تشغيل SQL مرة واحدة:
 * docs/sql/learning-collection-toggle.sql
 */
// ملاحظة: supabase بيتستورد كسول (lazy) جوّه الدوال — عشان الدالة النقية
// resolveLearningEnabled تفضل قابلة للاستيراد/الاختبار من غير تهيئة عميل Supabase.

/** يحسم قيمة المفتاح. الافتراضي متوقّف؛ شغّال بس لو true/"1"/1/"true" صريح. */
export function resolveLearningEnabled(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** يقرا حالة المفتاح (لأي مستخدم مسجّل). false لو فشل/غير محدّد. */
export async function fetchLearningEnabled(): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_learning_enabled");
    if (error) return false;
    return resolveLearningEnabled(data);
  } catch {
    return false;
  }
}

/** يغيّر المفتاح (السوبر أدمن فقط — الدالة على السيرفر بتتحقق من is_super). */
export async function setLearningEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("set_learning_enabled", { p_enabled: enabled });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
