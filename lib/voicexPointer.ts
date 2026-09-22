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

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔀 توزيع المناديب على أكتر من صندوق
 * ══════════════════════════════════════════════════════════════════════
 *
 * **ليه** (مقيس ٢٣ سبتمبر ٢٠٢٦): الصندوق طاقته **٣.٣ نافذة/ث**،
 * والمندوب الحقيقي بيبعت **١٠.٦ نافذة/دقيقة** — مقيس على **٣٠ مندوب
 * و٣٣ ألف نافذة** من حصاد كوريا (الوسيط ١٠.٠ = يتكلم ٢٥٪ من الوقت).
 * ⇒ **~١٥-١٨ مندوب للصندوق**. والمتوقّع ٢٠-٢٥ ⇒ صندوقين.
 *
 * 🔴 وقبل كده المؤشّر كان **عنوان واحد لكل المناديب**، فأي صندوق إضافي
 *    مكانش هيشوف ولا مندوب.
 *
 * **التوافق**: العمود الإضافي اختياري. صف قديم بلا العمود = قايمة فيها
 * الصندوق الأساسي بس = **نفس سلوك النهاردة بالحرف**.
 */

/** صندوق واحد في القايمة. */
export interface VoicexServer {
  url: string;
  isUp: boolean;
}

/**
 * بيبني قايمة الصناديق: الأساسي (`url`/`is_up`) وبعده الإضافيين.
 * الصفوف البايظة بتتشال، والمكرّر بيتشال (صندوق مرّتين كان هياخد ضعف
 * المناديب). `is_up` الناقص = شغّال — زي افتراضي الجدول بالظبط.
 */
export function parseServers(
  url: unknown,
  isUp: unknown,
  extra: unknown,
): VoicexServer[] {
  const out: VoicexServer[] = [];
  const seen = new Set<string>();
  const add = (u: unknown, up: unknown) => {
    if (typeof u !== "string") return;
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ url: t, isUp: up !== false });
  };
  add(url, isUp);
  if (Array.isArray(extra)) {
    for (const e of extra) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      add(o.url, o.is_up);
    }
  }
  return out;
}

/** تجزئة ثابتة (FNV-1a) — نفس المندوب يدّي نفس الرقم على كل جهاز. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * صندوق المندوب ده.
 *
 * · **ثابت**: نفس المندوب ⇒ نفس الصندوق كل مرة (الكارت يفضل ساخن).
 * · **الوقوع بيحرّك اللي عليه بس**: بنبدأ من المكان المحسوب على القايمة
 *   **الكاملة** وبنمشي قدام لأول شغّال — فلو صندوق وقع، اللي عليه بس
 *   هما اللي يتحوّلوا والباقي مكانهم. (لو قسمنا على الشغّالين بس كان كل
 *   المناديب هيتخلطوا مع كل وقعة.)
 * · **فشل-مغلق**: مافيش شغّال ⇒ `null` ⇒ المنادي يرجع لديبجرام.
 * · بلا معرّف مندوب ⇒ أول شغّال (سلوك محدَّد، مش عشوائي).
 */
export function pickVoicexServer(
  servers: readonly VoicexServer[],
  agentId: string | null | undefined,
): VoicexServer | null {
  const all = servers ?? [];
  if (all.length === 0) return null;
  const id = String(agentId ?? "").trim();
  const start = id ? hash(id) % all.length : 0;
  for (let i = 0; i < all.length; i++) {
    const c = all[(start + i) % all.length];
    if (c && c.isUp) return c;
  }
  return null;
}

/** صف المؤشّر بعد الحسم — العنوان الخام + هل النفق معلَن شغّال. */
export interface VoicexPointerRow {
  url: string;
  isUp: boolean;
  /** كل الصناديق (الأساسي + الإضافيين). صف قديم ⇒ الأساسي بس. */
  servers: VoicexServer[];
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
  return {
    url: o.url,
    isUp: o.is_up !== false,
    // `servers` عمود jsonb اختياري: [{url, is_up}, …]
    servers: parseServers(o.url, o.is_up, o.servers),
  };
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
    /**
     * 🔴 `select("*")` **عن قصد**: لو سمّينا عمود `servers` وهو لسه مش
     * موجود في الجدول، Supabase بترجّع **خطأ** والمؤشّر كله يفشل ⇒ كل
     * المناديب يرجعوا لديبجرام. بالنجمة الصف بييجي بالأعمدة الموجودة
     * مهما كانت، والعمود الناقص بيتعامل كـ`undefined`.
     */
    const { data, error } = await supabase
      .from("voicex_pointer").select("*").eq("id", true).single();
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
export async function resolveVoicexEndpoint(
  agentId?: string | null,
): Promise<JudgeEndpoint | null> {
  const [row, token] = await Promise.all([fetchVoicexPointer(), fetchVoicexToken()]);
  if (!row) return null;
  // 🔀 صندوق المندوب ده. بصندوق واحد ده بيرجّع الأساسي = سلوك النهاردة.
  const pick = pickVoicexServer(row.servers, agentId);
  if (!pick) return null;
  return buildVoicexEndpoint(pick.url, token, pick.isUp);
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

/**
 * مدد إعادة المحاولة لما جلب العنوان يفشل. بتتباعد عشان مانضربش سيرفر تعبان.
 * الأولى بعد ١٠ ثواني عشان الرجوع يبقى سريع لو العطل كان لحظة.
 */
export const RETRY_DELAYS_MS = [10_000, 30_000, 120_000, 300_000];

/**
 * بيعيد محاولة جلب عنوان VoiceX لما المحاولة الأولى تفشل.
 *
 * 🐞 ليه: لما Supabase تتعثّر، عنوان VoiceX وتوكنه (الاتنين متخزّنين فيها)
 * مابيتقروش، فالتطبيق بيرجع **صامت** لديبجرام — وبيفضل عليه لحد ما المندوب
 * يقفل البرنامج ويفتحه، حتى بعد ما الداتابيز ترجع بساعات. وديبجرام أضعف من
 * الموديل المدرَّب في قراءة اللوحات السعودية، يعني **دقة الفرز** بتتأثر مش
 * السرعة بس. (انقطاع ٢٠٢٦-٠٩-١٣: ٣٤ دقيقة، والمناديب فضلوا على الاحتياطي بعده.)
 *
 * ⚠️ التصميم مقصود إنه **مالوش أي أثر في الحالة الطبيعية**: لو المحاولة الأصلية
 * نجحت، الدالة دي مابتتندهش أصلاً. فالكود بيمشي حرف بحرف زي ما كان لكل مندوب
 * وضعه سليم — والإضافة بتشتغل بس في الحالة اللي هي أصلاً مكسورة.
 *
 * الجدولة قابلة للحقن عشان الاختبار مايستناش دقايق حقيقية.
 * بيرجّع دالة إلغاء — تتنده لما المندوب يقفل الصفحة.
 */
export function retryVoicexEndpoint(
  resolve: () => Promise<JudgeEndpoint | null>,
  onResolved: (endpoint: JudgeEndpoint) => void,
  delays: number[] = RETRY_DELAYS_MS,
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
): () => void {
  let cancelled = false;
  let i = 0;
  const attempt = () => {
    if (cancelled || i >= delays.length) return;
    const wait = delays[i++];
    schedule(() => {
      if (cancelled) return;
      void (async () => {
        let ep: JudgeEndpoint | null = null;
        try { ep = await resolve(); } catch { ep = null; }
        if (cancelled) return;
        if (ep) onResolved(ep);      // نجح — نبطّل
        else attempt();              // لسه — نجرّب تاني بعد مدة أطول
      })();
    }, wait);
  };
  attempt();
  return () => { cancelled = true; };
}
