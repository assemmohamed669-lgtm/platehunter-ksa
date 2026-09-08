/**
 * رسالة خاصة لمندوب واحد — الأدمن بيكتبها من صفحة المندوب، وتظهر عنده هو
 * **لوحده** بالأحمر لحد ما الأدمن يشيلها.
 *
 * غير `app_notice` (البانر العام اللي بيروح لكل المناديب) — دي موجّهة لصفّه
 * هو في `profiles`، فمحدش غيره بيقراها (RLS: المندوب بيقرا صفّه بس).
 */
/** حد طول الرسالة — بيتقصّ عنده بدل ما الحفظ يترفض. */
export const AGENT_NOTICE_MAX = 500;

/**
 * تطبيع الرسالة قبل الحفظ. الفاضي بيرجع `null` (= مافيش رسالة) مش نص فاضي —
 * وإلا البانر بيظهر عند المندوب فاضي وهو مالوش زر إخفاء.
 */
export function normalizeAgentNotice(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const v = text.trim();
  if (!v) return null;
  return v.length > AGENT_NOTICE_MAX ? v.slice(0, AGENT_NOTICE_MAX) : v;
}

export interface AgentNotice {
  text: string;
  at: string | null;
}

/** رسالة المندوب الحالي (لو فيه). أي فشل/أوفلاين = مافيش رسالة. */
export async function fetchAgentNotice(): Promise<AgentNotice | null> {
  try {
    // استيراد كسول: الملف ده بيتقرا في الاختبارات كمان، وعميل Supabase بيطلب
    // متغيّرات بيئة وقت الاستيراد — فبنجيبه وقت النداء بس.
    const { supabase } = await import("./supabaseClient");
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("profiles")
      .select("agent_notice, agent_notice_at")
      .eq("id", uid)
      .single();
    const row = data as { agent_notice?: string | null; agent_notice_at?: string | null } | null;
    const text = normalizeAgentNotice(row?.agent_notice);
    return text ? { text, at: row?.agent_notice_at ?? null } : null;
  } catch {
    return null;   // أوفلاين أو العمود لسه ماتضافش — مافيش رسالة
  }
}
