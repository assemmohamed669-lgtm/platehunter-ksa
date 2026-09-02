/**
 * استطلاع رأي للمناديب — الأدمن ينشئ سؤال + خيارات، وكل مندوب يصوّت خيار واحد
 * (يقدر يغيّره طول ما الاستطلاع نشط)، والأدمن يشوف مين اختار إيه بالاسم + العدّ.
 *
 * كله عبر دوال security definer في Supabase (زي نظام الإشعارات) —
 * الصلاحيات مضبوطة جوّه الدوال. محتاج تشغيل SQL مرة واحدة: docs/sql/polls.sql
 */

/** استطلاع نشط + صوت المستخدم الحالي (null = لسه ماصوّتش). */
export interface Poll {
  id: string;
  question: string;
  options: string[];
  createdAt: string | null;
  myChoice: number | null;
}

/** صوت مندوب واحد في النتايج (للأدمن). */
export interface PollVote {
  agentId: string;
  username: string | null;
  choice: number;
  votedAt: string | null;
}

/** مسح إخفاءات الاستطلاعات — بيتنادى وقت تسجيل الدخول عشان الاستطلاع النشط
 *  يرجع يظهر للمندوب حتى لو قفله قبل كده (زي رسالة الأدمن). */
export function clearPollDismissals(): void {
  try { localStorage.removeItem("ph:pollDismissed"); } catch { /* storage unavailable */ }
}

/** الاستطلاع النشط الحالي (لأي مسجّل دخول)، أو null لو مفيش. */
export async function fetchActivePoll(): Promise<Poll | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_active_poll");
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    const opts = r.options;
    return {
      id: String(r.id),
      question: String(r.question ?? ""),
      options: Array.isArray(opts) ? opts.map((o) => String(o)) : [],
      createdAt: (r.created_at as string) ?? null,
      myChoice: r.my_choice == null ? null : Number(r.my_choice),
    };
  } catch { return null; }
}

/** صوّت/غيّر صوتك على استطلاع نشط. بيرجّع true لو نجح. */
export async function submitVote(pollId: string, choice: number): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("submit_vote", { p_poll: pollId, p_choice: choice });
    return !error;
  } catch { return false; }
}

/** إنشاء استطلاع جديد (أدمن) — بيقفل القديم. بيرجّع id أو null. */
export async function createPoll(question: string, options: string[]): Promise<{ id: string | null; error?: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || clean.length < 2) return { id: null, error: "اكتب السؤال وخيارين على الأقل." };
    const { data, error } = await supabase.rpc("create_poll", { p_question: question, p_options: clean });
    if (error) {
      // رسالة مفهومة: لو الدالة مش موجودة يبقى الـSQL (docs/sql/polls.sql) لسه ماتشغّلش.
      const msg = /function .*create_poll.* does not exist|Could not find the function/i.test(error.message || "")
        ? "خدمة الاستطلاع مش مفعّلة على السيرفر — شغّل docs/sql/polls.sql على Supabase."
        : (error.message || "خطأ غير معروف");
      return { id: null, error: msg };
    }
    return { id: data ? String(data) : null };
  } catch (e) { return { id: null, error: e instanceof Error ? e.message : "خطأ" }; }
}

/** نتايج استطلاع (أدمن): مين اختار إيه بالاسم. */
export async function fetchPollResults(pollId: string): Promise<PollVote[]> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_poll_results", { p_poll: pollId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: Record<string, unknown>) => ({
      agentId: String(r.agent_id),
      username: (r.username as string) ?? null,
      choice: Number(r.choice),
      votedAt: (r.voted_at as string) ?? null,
    }));
  } catch { return []; }
}

/** قفل استطلاع (أدمن). */
export async function closePoll(pollId: string): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("close_poll", { p_poll: pollId });
    return !error;
  } catch { return false; }
}
