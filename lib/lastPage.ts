/**
 * lastPage — يرجّع المندوب لآخر صفحة كان واقف عليها.
 *
 * 🔴 **المشكلة:** المندوب بيتنقل لتطبيق تاني ويرجع، فيلاقي البرنامج فتح على
 * صفحة **غير** اللي كان فيها (بلاغ المالك ٢٧ سبتمبر ٢٠٢٦).
 *
 * **السبب:** نظام التليفون بيعيد تحميل الـWebView لما التطبيق يفضل في الخلفية
 * (ضغط ذاكرة على الآيفون تحديداً). التحميل بيبدأ من `/`، وشاشة البداية كانت
 * بتعمل `router.replace("/sorting")` **ثابتة** مهما كان واقف فين — فالمندوب
 * اللي كان بيشيّك بيلاقي نفسه في الفرز ولازم يرجع بنفسه كل مرة.
 *
 * الحل: نفتكر المسار مع كل تنقّل، وشاشة البداية تفتح عليه.
 */

export const LAST_PAGE_KEY = "ph:lastPage";

/**
 * صفحات التطبيق المسموح الرجوع لها.
 *
 * ⚠️ **قايمة بيضا مقصودة، مش فحص شكل.** القيمة جاية من تخزين المتصفّح وأي حاجة
 * فيه ممكن تتعدّل — فلو قبلنا أي نص شكله مسار، قيمة زي `//evil.example` تبقى
 * تحويل خارجي. الأسماء دي هي مجلدات `app/(app)/` بالظبط.
 */
const APP_PAGES = [
  "appearance", "backup", "data-upload", "groq", "group-activity", "group-records",
  "group-sort", "help", "instant-check", "keys", "list", "maps",
  "registration", "registration-v2", "sorting", "wanted",
] as const;

/** المسار ده صفحة تطبيق حقيقية؟ (بيتجاهل معاملات البحث في المقارنة) */
function isAppPage(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const head = path.slice(1).split(/[?#]/)[0].split("/")[0];
  return (APP_PAGES as readonly string[]).includes(head);
}

/**
 * يفتكر الصفحة الحالية. بيتنده مع كل تنقّل.
 *
 * ⚠️ صفحات الدخول (`/login` · `/auth/*`) وشاشة البداية (`/`) **مابتتحفظش** —
 *    الأولى هترجّعه لشاشة تسجيل دخول وهو داخل أصلاً، والتانية بتلفّ في حلقة.
 *    الفلتر هو `isAppPage` نفسه، فالاتنين بيتستبعدوا تلقائياً.
 */
export function rememberPage(path: string): void {
  if (!isAppPage(path)) return;
  try {
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ p: path, t: Date.now() }));
  } catch { /* تخزين مقفول */ }
}

/** يقرا المحفوظ بالشكلين: الجديد `{p,t}` والقديم (نص خام). */
function readSaved(): { p: string; t: number } | null {
  let v: string | null = null;
  try { v = localStorage.getItem(LAST_PAGE_KEY); } catch { return null; }
  if (!v) return null;
  // ⚠️ نسخ قديمة كانت بتحفظ المسار **نص خام** — لازم تفضل شغّالة وإلا المندوب
  //    اللي مافتحش التطبيق من قبل التحديث يفقد صفحته مرة واحدة بلا داعي.
  if (!v.startsWith("{")) return isAppPage(v) ? { p: v, t: 0 } : null;
  try {
    const o = JSON.parse(v) as { p?: unknown; t?: unknown };
    const p = typeof o.p === "string" ? o.p : "";
    if (!isAppPage(p)) return null;
    return { p, t: typeof o.t === "number" ? o.t : 0 };
  } catch { return null; }
}

/** آخر صفحة محفوظة، أو `null` لو مافيش/مش صالحة. */
export function lastPage(): string | null {
  return readSaved()?.p ?? null;
}

/**
 * ⏱️ **رجوع من الخلفية ولا فتح جديد؟**
 *
 * إعادة تحميل الـWebView نفسها قرار نظام التليفون ومانقدرش نمنعها من الكود.
 * اللي بيخلّي المندوب حاسس إنه «فتح من أول وجديد» هو **شاشة البداية
 * (ثانيتين)**. فبنفرّق:
 *   · آخر تنقّل من دقايق  ⇒ رجوع من الخلفية ⇒ نعدّي الشاشة ونفتح على صفحته
 *   · آخر تنقّل من ساعات ⇒ فتح حقيقي ⇒ الشاشة تفضل زي ما هي
 *
 * الافتراضي **٣٠ دقيقة** — أطول من أي تنقّل بين تطبيقات، وأقصر من فترة راحة
 * أو يوم عمل جديد.
 */
export function isWarmResume(maxIdleMs = 30 * 60_000): boolean {
  const s = readSaved();
  if (!s || !s.t) return false;          // مافيش وقت (قيمة قديمة) = فتح جديد
  const age = Date.now() - s.t;
  return age >= 0 && age < maxIdleMs;
}
