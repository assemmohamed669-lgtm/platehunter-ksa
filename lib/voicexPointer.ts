/**
 * مصدر عنوان VoiceX — «المؤشّر» في Supabase (مش localStorage زي الطيّار).
 * =============================================================================
 * لينك نفق اللابتوب بيتغيّر كل إعادة تشغيل، فبدل ما كل جهاز يخزّن العنوان محلياً
 * زي `readJudgeEndpoint`، بنقراه من صف مفرد مقروء في Supabase (`voicex_pointer`)
 * ومضاف لـrealtime — فأول ما اللابتوب يبدّل النفق يوصل الجديد لحظياً بلا polling.
 *
 * العقد **فشل-مغلق** زي الطيّار بالحرف: أي التباس (نفق واقع · عنوان غلط · توكن
 * قصير/فيه سطر جديد · خطأ RPC · أوفلاين) = `null` ⇒ المنادي يكمّل بديبجرام لوحده.
 *
 *   • العنوان **مش سرّ** → في الجدول المقروء (`voicex_pointer.url`).
 *   • التوكن **سرّ** → عبر RPC `get_voicex_token` (app_settings بلا سياسة SELECT)،
 *     وبيتبعت في ترويسة `X-Plate-Token` بس — عمره ما يتحط في الـURL.
 *
 * التحقّق من صيغة العنوان/التوكن بيعيد استخدام مدقّقات الطيّار بالحرف
 * (`normalizeJudgeBase`/`normalizeJudgeToken`) — نفس قواعد https-إجباري،
 * لا-query، حدود التوكن، ومنع CR/LF.
 */

import {
  normalizeJudgeBase, normalizeJudgeToken, type JudgeEndpoint,
} from "./plateJudgeGate";

/** صف المؤشّر بعد الحسم — العنوان الخام + هل النفق معلَن شغّال. */
export interface VoicexPointerRow {
  url: string;
  isUp: boolean;
}

/**
 * يحسم صف المؤشّر الخام (من `select`) لـ`{url, isUp}`. **فشل-مغلق**: خطأ · صف
 * null/غير كائن · url مش سترنج = `null`. `is_up` غير `false` = يعتبر شغّال
 * (الافتراضي على مستوى الجدول `true`، فصف قديم بلا العمود مايتقفلش).
 */
export function resolvePointerRow(data: unknown, error: unknown): VoicexPointerRow | null {
  if (error) return null;
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  if (typeof o.url !== "string") return null;
  return { url: o.url, isUp: o.is_up !== false };
}

/**
 * يبني العنوان الكامل من العنوان الخام + التوكن الخام + حالة النفق. **نقية**
 * ومغطّاة باختبار. بيرجع `null` (فشل-مغلق) لو:
 *   • النفق معلَن واقع (`isUp === false`).
 *   • العنوان مش https سليم / فيه query / لاحقة نقطة نهاية (normalizeJudgeBase).
 *   • التوكن قصير/طويل/فيه حرف برّه ASCII المطبوع (normalizeJudgeToken).
 */
export function buildVoicexEndpoint(
  rawUrl: unknown,
  rawToken: unknown,
  isUp: boolean,
): JudgeEndpoint | null {
  if (isUp === false) return null;
  const base = normalizeJudgeBase(rawUrl);
  const token = normalizeJudgeToken(rawToken);
  if (!base || !token) return null;
  return { base, transcribeUrl: `${base}/transcribe`, token };
}

/**
 * يقرا صف المؤشّر من Supabase (قراءة مباشرة — الصف مقروء لأي مسجّل). بيرجع
 * `null` على أي خطأ. استيراد supabase كسول عشان الدوال النقية فوق تفضل قابلة
 * للاختبار بلا شبكة.
 */
export async function fetchVoicexPointer(): Promise<VoicexPointerRow | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase
      .from("voicex_pointer").select("url, is_up").eq("id", true).single();
    return resolvePointerRow(data, error);
  } catch {
    return null;
  }
}

/** يقرا توكن VoiceX (سرّ) عبر RPC. `null` على أي خطأ/غير محدّد. */
export async function fetchVoicexToken(): Promise<string | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_voicex_token");
    if (error) return null;
    return normalizeJudgeToken(data);
  } catch {
    return null;
  }
}

/**
 * يحسم العنوان الكامل الجاهز للاستخدام (العنوان من المؤشّر + التوكن من الـRPC).
 * `null` (فشل-مغلق) لو أي طرف ناقص/غلط أو النفق واقع ⇒ رجوع تلقائي لديبجرام.
 */
export async function resolveVoicexEndpoint(): Promise<JudgeEndpoint | null> {
  const [row, token] = await Promise.all([fetchVoicexPointer(), fetchVoicexToken()]);
  if (!row) return null;
  return buildVoicexEndpoint(row.url, token, row.isUp);
}

/**
 * يشترك على تغيّرات المؤشّر لحظياً (realtime). أول ما اللابتوب يبدّل النفق،
 * `onChange` بتتنده بالصف الجديد المحسوم. بيرجّع دالة إلغاء الاشتراك.
 * أي فشل في فتح القناة = بلا اشتراك (المنادي يفضل على آخر عنوان جلبه).
 */
export function subscribeVoicexPointer(
  onChange: (row: VoicexPointerRow | null) => void,
): () => void {
  let cleanup = () => {};
  (async () => {
    try {
      const { supabase } = await import("./supabaseClient");
      const channel = supabase
        .channel("voicex_pointer_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "voicex_pointer" },
          (payload: { new?: unknown }) => {
            onChange(resolvePointerRow(payload?.new ?? null, null));
          },
        )
        .subscribe();
      cleanup = () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
    } catch {
      /* realtime مش متاح — المنادي يفضل على آخر عنوان جلبه */
    }
  })();
  return () => cleanup();
}
