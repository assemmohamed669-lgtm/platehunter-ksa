/**
 * 🔁 **مافيش صفحة تحبس المندوب في لفّة** — المالك (٣ أكتوبر ٢٠٢٦).
 *
 * آيفون ١١ لمندوب «صوت فقط»: «لما بيدخل علي الابلكيشن يجيبلو جاري التحقق وياخر شوي
 * وبعدين يفتح وبعدين يجيلو جاري التحقق… لحد ما الصفحة تعمل فريز وتهنج». الصفحة
 * بتقع (ذاكرة) ⇒ الموبايل بيحمّل **نفس الصفحة** تاني — والبرنامج كمان بيفتح على آخر
 * صفحة (#340) — فتقع تاني… والمندوب محبوس.
 *
 * `bootGuard` بيتنده **قبل أي كود تاني** في كل تحميل للصفحة (سكربت صغير في أول الـHTML،
 * `BOOT_GUARD_SCRIPT`) — قبل React وقبل ما الصفحة التقيلة تبدأ: بيعدّ تحميلات نفس
 * الصفحة اللي **ماثبتتش** (الصفحة بتعلّم «ثبتت» لو عاشت `BOOT_STABLE_MS`). التالت ورا
 * بعض (في دقيقة ونص) ⇒ بيحوّل على «التشييك» (أو «المساعدة» لو التشييك هي اللي بتلفّ)،
 * والصفحة بتقول للمندوب حصل إيه (`takeBootGuardHit`).
 *
 * التنقّل جوّه البرنامج مش تحميل ⇒ مابيتعدّش. تحديث عادي بعد ما الصفحة ثبتت ⇒ العدّ
 * بيبدأ من الأول. أي رمية ⇒ ولا حاجة (الصفحة بتتحمّل عادي).
 */

export const BOOT_GUARD_KEY = "ph:bootGuard";
export const BOOT_GUARD_HIT_KEY = "ph:bootGuardHit";
/** الصفحة تعتبر «ثبتت» لو عاشت المدة دي من غير ما البرنامج يقع. */
export const BOOT_STABLE_MS = 30_000;

/**
 * القرار نفسه — بيرجّع المسار اللي نروحله بدل الصفحة دي لو هي في لفّة، وإلا `null`.
 *
 * ⚠️ **لازم تفضل مكتفية بنفسها وبصياغة قديمة** (var، من غير spread ولا `?.`): بتتحوّل لنص
 * بـ`toString()` جوّه `BOOT_GUARD_SCRIPT` وبتشتغل في أول الـHTML على أي موبايل قديم. فمفيش
 * أي استيراد ولا ثابت من برّه — الأرقام والأسماء مكررة هنا عن قصد.
 */
export function bootGuard(path: string, storage: Storage, now: number): string | null {
  var KEY = "ph:bootGuard", HIT = "ph:bootGuardHit", WINDOW = 90000, LOOP = 3;
  // صفحات الحساب بس (مجلدات app/(app)) — شاشة البداية والدخول برّه العدّ
  var APP = ["appearance", "backup", "data-upload", "groq", "group-activity", "group-records",
    "group-sort", "help", "instant-check", "keys", "list", "maps", "registration",
    "registration-v2", "sorting", "wanted"];
  try {
    var seg = String(path || "").split("?")[0].split("#")[0].split("/")[1] || "";
    if (APP.indexOf(seg) < 0) return null;
    var prev: { p?: string; c?: number; t?: number; ok?: boolean } | null = null;
    try { prev = JSON.parse(storage.getItem(KEY) || "null"); } catch (e) { prev = null; }
    var age = prev && typeof prev.t === "number" ? now - prev.t : -1;
    var count = prev && prev.p === path && !prev.ok && age >= 0 && age < WINDOW ? (Number(prev.c) || 0) + 1 : 1;
    if (count >= LOOP) {
      var to = seg === "instant-check" ? "/help" : "/instant-check";
      storage.setItem(KEY, JSON.stringify({ p: to, c: 0, t: now, ok: true }));
      storage.setItem(HIT, path);
      return to;
    }
    storage.setItem(KEY, JSON.stringify({ p: path, c: count, t: now, ok: false }));
    return null;
  } catch (e) {
    return null;
  }
}

/** السكربت اللي في أول الـHTML — بيحوّل **قبل** ما الصفحة تبدأ (`app/layout.tsx`). */
export const BOOT_GUARD_SCRIPT =
  "(function(){try{var to=(" + bootGuard.toString() + ")(location.pathname,localStorage,Date.now());" +
  "if(to)location.replace(to);}catch(e){}})();";

/** الصفحة عاشت `BOOT_STABLE_MS` ⇒ التحميل الجاي لنفس الصفحة بيبدأ عدّ جديد. */
export function markBootStable(storage: Storage): void {
  try {
    const s = JSON.parse(storage.getItem(BOOT_GUARD_KEY) || "null") as Record<string, unknown> | null;
    if (s && !s.ok) storage.setItem(BOOT_GUARD_KEY, JSON.stringify({ ...s, ok: true }));
  } catch { /* تخزين مقفول — مافيش عدّ أصلاً */ }
}

/** الصفحة اللي كانت بتلفّ (لو اتحوّلنا منها دلوقتي) — بتتقال مرة واحدة. */
export function takeBootGuardHit(storage: Storage): string | null {
  try {
    const p = storage.getItem(BOOT_GUARD_HIT_KEY);
    if (p) storage.removeItem(BOOT_GUARD_HIT_KEY);
    return p || null;
  } catch {
    return null;
  }
}

const LABELS: Record<string, string> = {
  "registration-v2": "الجديد", "registration": "التسجيل", "instant-check": "التشييك",
  "sorting": "الفرز", "wanted": "المطلوب", "maps": "الخرائط", "data-upload": "رفع داتا",
  "group-sort": "فرز المجموعة", "group-records": "سجلات المجموعة", "group-activity": "نشاط المجموعة",
  "list": "القائمة", "keys": "المفاتيح", "help": "المساعدة", "appearance": "المظهر",
  "backup": "النسخة الاحتياطية", "groq": "مفتاح الصوت",
};

/** اسم الصفحة اللي المندوب يعرفه. */
export function pageLabel(path: string): string {
  const seg = String(path || "").split("?")[0].split("/")[1] || "";
  return LABELS[seg] ?? path;
}
