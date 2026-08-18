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

// ── القراءة من الإعدادات ───────────────────────────────────────────────────

/**
 * بيجيب العنوان المسجّل من الإعدادات (عبر RPC — الجدول مالوش سياسة قراءة
 * للمناديب)، ويرجّع `null` بهدوء لو الدالة مش موجودة أو النت قاطع.
 *
 * الفشل هنا **مش خطأ**: معناه بس إن الخدمة مش متاحة، والتفريغ بيروح على
 * البديل زي ما هو.
 */
export async function fetchRegisteredModelUrl(): Promise<RegisteredModelUrl | null> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data, error } = await supabase.rpc("get_plate_model_endpoint");
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { url: (row as { url?: string }).url, at: (row as { at?: string }).at };
  } catch {
    return null;
  }
}

/** أساس عنوان الخدمة الجاهز للاستخدام — المسجّل أو اليدوي أو `null`. */
export async function resolveModelBase(manual?: string | null): Promise<string | null> {
  const m = String(manual ?? "").trim();
  if (m) return pickModelBase(null, m);          // اليدوي بيغلب — مانضربش نداء
  return pickModelBase(await fetchRegisteredModelUrl(), null);
}
