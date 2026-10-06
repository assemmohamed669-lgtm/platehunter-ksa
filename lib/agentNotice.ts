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

/**
 * 📣 رسالة خاصة **لكل المناديب** (المالك ٦ أكتوبر ٢٠٢٦: «او يحطها ل كل المناديب») — نفس شكل الخاصة
 * (بالأحمر، من غير زر إخفاء، لحد ما الأدمن يشيلها)، متخزّنة لوحدها فالرسايل الخاصة مابتتلمسش.
 * محتاجة `docs/sql/all-agents-notice.sql`.
 */
export function resolveAllAgentsNotice(raw: unknown): AgentNotice | null {
  const row = (Array.isArray(raw) ? raw[0] : raw) as { notice_text?: string | null; notice_at?: string | null } | null | undefined;
  const text = normalizeAgentNotice(row?.notice_text);
  return text ? { text, at: row?.notice_at ?? null } : null;
}

/** الرسالة اللي لكل المناديب (لو فيه). أي فشل/أوفلاين/لسه ماتعملتش = مافيش. */
export async function fetchAllAgentsNotice(): Promise<AgentNotice | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_all_agents_notice");
    if (error) return null;
    return resolveAllAgentsNotice(data);
  } catch {
    return null;
  }
}

/** ينشرها لكل المناديب أو يشيلها (نص فاضي). الأدمن بس — الدالة على السيرفر بتتحقق. */
export async function setAllAgentsNotice(text: string): Promise<{ ok: boolean; error?: string; setup?: boolean }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("set_all_agents_notice", { p_text: normalizeAgentNotice(text) ?? "" });
    if (error) {
      return { ok: false, error: error.message, setup: /set_all_agents_notice|PGRST202|42883/.test(`${error.code ?? ""} ${error.message ?? ""}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
