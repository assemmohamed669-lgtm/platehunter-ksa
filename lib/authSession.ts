/**
 * authSession — «هل المندوب داخل؟» من غير ما نعتمد على الشبكة.
 *
 * **قاعدة المالك: البرنامج مايخرجش المندوب إلا لو هو سجّل خروج بنفسه.**
 *
 * اللي كان بيكسرها: `supabase.auth.getUser()` بيعمل نداء شبكة لـ`/auth/v1/user`
 * في كل مرة. ولما النداء يفشل (نت ضعيف · التطبيق رجع من الخلفية على iOS ·
 * واي فاي بوابة) المكتبة بترجّع `{ user: null }` **من غير ما تفرّق** بينها
 * وبين «الجلسة انتهت فعلاً» — لأن خطأ الشبكة نوعه `AuthRetryableFetchError`
 * وهو `AuthError`، فبيتبلع في نفس مسار الخطأ. والصفحات كانت بتعمل
 * `if (!data.user) router.replace("/login")` ⇒ المندوب يلاقي نفسه على شاشة
 * الدخول وجلسته لسه سليمة.
 *
 * الحل: نسأل `getSession()` — بيقرا من التخزين المحلي، بلا نداء شبكة —
 * و**مانعتبرش الخروج حصل إلا لو مافيش جلسة ومفيش خطأ**.
 */

/** الشكل اللي بيرجع من `supabase.auth.getSession()` (المهم منه بس). */
export interface SessionProbe {
  session?: { user?: { id?: string } | null } | null;
  error?: { message?: string } | null;
}

export interface SessionState {
  /** معرّف المندوب، أو null لو مش متاح دلوقتي. */
  userId: string | null;
  /** خارج **فعلاً** — دي الحالة الوحيدة اللي بنوديه فيها لشاشة الدخول. */
  signedOut: boolean;
}

/**
 * بيحوّل رد `getSession` لقرار. أي شك = **مش خروج** — أسوأ نتيجة للشك في
 * الاتجاه ده إن المندوب يفضل داخل لحظة زيادة، والاتجاه التاني إنه يفقد شغله.
 */
export function resolveSession(probe: SessionProbe | null | undefined): SessionState {
  if (!probe) return { userId: null, signedOut: false };
  const userId = probe.session?.user?.id ?? null;
  if (userId) return { userId, signedOut: false };
  // مافيش جلسة: خروج حقيقي **بس** لو القراءة نجحت ومالقتش حاجة.
  if (probe.error) return { userId: null, signedOut: false };
  if (probe.session === null) return { userId: null, signedOut: true };
  return { userId: null, signedOut: false };
}

/** نداء جاهز: بيسأل Supabase محلياً ويرجّع القرار. */
export async function currentSession(): Promise<SessionState> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.auth.getSession();
    return resolveSession({ session: data?.session ?? null, error: error ?? null });
  } catch {
    return { userId: null, signedOut: false };   // فشل غير متوقّع ≠ خروج
  }
}
