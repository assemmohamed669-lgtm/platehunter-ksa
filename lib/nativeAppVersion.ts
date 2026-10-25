/**
 * 📱 رقم التطبيق الحقيقي اللي على الموبايل (٢٥ أكتوبر ٢٠٢٦).
 *
 * المالك: «ليه ظاهر معايا … في القايمه الجانبيه … ان النسخه اللي عندي هيا 1.7 مش 1.8» · «اعمله علشان لو مندوب قال مش
 * شغال اشوف هو شغال علي اي نسخه بالظبط». الـ«1.7.0» ده `APP_VERSION` بتاع **الصفحات** (مكتوب بإيدينا) — مش رقم
 * التطبيق اللي نزل من البلاي/آب ستور.
 *  · القايمة الجانبية بتعرض الاتنين.
 *  · النبضة بتبعت «الصفحات|التطبيق» في نفس خانة `app_version` (من غير SQL جديد) ⇒ صفحة الأدمن بتفصلهم: «أحدث نسخة»
 *    من الصفحات زي الأول + رقم التطبيق جنبها. المتصفح ⇒ رقم الصفحات بس زي الأول بالحرف.
 */

export interface NativeAppInfo { version: string; build: string }

let cached: Promise<NativeAppInfo | null> | null = null;

/** رقم التطبيق والبيلد من أندرويد/آيفون — المتصفح أو أي غلط ⇒ null. مرة واحدة لكل فتحة. */
export function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return null;
        const { App } = await import("@capacitor/app");
        const i = await App.getInfo();
        return i?.version ? { version: String(i.version), build: String(i.build ?? "") } : null;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}

/** «1.8 (8)» — من غير بيلد ⇒ «1.8». */
export function nativeVersionLabel(i: NativeAppInfo | null): string | null {
  if (!i) return null;
  return i.build ? `${i.version} (${i.build})` : i.version;
}

/** اللي بيتبعت في `app_version`: «الصفحات|التطبيق» (المتصفح ⇒ الصفحات بس). */
export function heartbeatVersion(web: string, i: NativeAppInfo | null): string {
  const n = nativeVersionLabel(i);
  return n ? `${web}|${n}` : web;
}

/** صفحة الأدمن: بيفصل الرقمين (القديم من غير «|» = الصفحات بس). */
export function parseAgentVersion(v: string | null | undefined): { web: string | null; native: string | null } {
  if (!v) return { web: null, native: null };
  const [w, n] = String(v).split("|");
  return { web: w || null, native: n || null };
}
