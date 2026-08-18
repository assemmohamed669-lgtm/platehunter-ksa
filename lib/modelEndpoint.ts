/**
 * عنوان خدمة الموديل المدرّب — بيتقرا من الإعدادات بدل ما يتحط في كل تليفون.
 *
 * الخدمة شغالة على جهاز الأدمن وبتتعرض عبر نفق **مؤقت**، فالرابط بيتغيّر كل
 * مرة الجهاز يشتغل. كان لازم يتحط يدوي في كل تليفون — يعني أي إعادة تشغيل
 * توقّف كل المناديب لحد ما تعدّي عليهم واحد واحد.
 *
 * دلوقتي الخدمة بتسجّل رابطها في `app_settings` أول ما تشتغل، والتطبيق
 * بيقراه. منطق الاختيار هنا نقي عشان يتغطّى باختبارات.
 */

/** الرابط المسجّل بيتعتبر ميت بعد كده — النفق الواقع رابطه بيفضل مكتوب. */
export const MODEL_URL_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // ١٢ ساعة

export interface RegisteredModelUrl {
  url: string | null | undefined;
  /** ISO — آخر مرة الخدمة سجّلت نفسها. */
  at: string | null | undefined;
}

function clean(u: string | null | undefined): string | null {
  const s = String(u ?? "").trim().replace(/\/+$/, "");
  if (!s) return null;
  // https بس: التطبيق نفسه https، وأي http هيتمنع من المتصفح.
  if (!/^https:\/\/[^\s/]+/i.test(s)) return null;
  return s;
}

/**
 * بيختار أساس الرابط: **اليدوي أولاً** (الأدمن بيجرّب حاجة معيّنة)، وإلا
 * المسجّل لو لسه حديث. `null` معناها مافيش خدمة — نروح على البديل.
 */
export function pickModelBase(
  registered: RegisteredModelUrl | null | undefined,
  manual: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const m = clean(manual);
  if (m) return m;
  const r = clean(registered?.url);
  if (!r) return null;
  const at = registered?.at ? Date.parse(registered.at) : NaN;
  if (!Number.isFinite(at)) return null;          // بلا تاريخ = مانعرفش هي حية ولا لأ
  if (nowMs - at > MODEL_URL_MAX_AGE_MS) return null;
  return r;
}
