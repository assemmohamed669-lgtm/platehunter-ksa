/**
 * بوابة الطيّار — «الرأي التاني» من موديلنا المدرَّب (whisper-plates) جنب Deepgram.
 * =============================================================================
 * الملف ده **بوابة حصرية** مش مِيزة: كل حاجة هنا شغلتها إنها تقول «لأ» بأسرع
 * وأضمن طريقة. الميزة نفسها في `lib/plateJudgeClient.ts` (بيتحمّل كسول جوّه
 * الفرع المسموح بس) و`lib/plateJudgeLog.ts`.
 *
 * التلات طبقات، وكلها لازم تنجح — أي واحدة تفشل = الطيّار مقفول والسلوك يفضل
 * **زي النهاردة بالحرف** (Deepgram لوحده):
 *   ١. الهوية: `isPilotOwner(uid)` — المالك وحده.
 *   ٢. المفتاح المركزي: `fetchPlateJudgeEnabled()` — الافتراضي **مقفول** حتى له،
 *      وأي خطأ RPC أو استثناء = مقفول (نسخة حرفية من `lib/learningSettings.ts`).
 *   ٣. الإعداد على الجهاز: `readJudgeEndpoint()` — عنوان النفق + التوكن، والاتنين
 *      لازم يكونوا سليمين. **نص إعداد = مقفول**.
 *
 * ليه فحص شكل UUID على **الطرفين**؟ المراجعة العدائية صادت تلات أشكال «فشل
 * مفتوح» في المقارنة الساذجة `uid === OWNER`:
 *   (١) هوية لسه ماتحلّتش (`undefined`) قدّام ثابت غايب ⇒ `undefined == undefined`
 *       = true ⇒ كل الناس ملّاك. ده بيحصل فعلاً: `agentIdRef.current` بيفضل null
 *       عند التحميل لكل مستخدم، وبيفضل null الجلسة كلها لو أوفلاين.
 *   (٢) `"" === ""` بعد `?? ""` — نفس النتيجة.
 *   (٣) `["af40…"] == "af40…"` بترجع **true** في جافاسكريبت (Array.toString)،
 *       وكذلك أي كائن له toString — يعني قيمة جاية من JSON.parse تقدر تعدّي.
 * الشرطان تحت بيقفلوا التلاتة: لازم **سترنج بدائي** + شكل UUID على الطرفين،
 * وبعدين `===` صريح. مافيش trim ولا toLowerCase: التضييق مسموح، التوسيع لأ.
 *
 * ⚠️ ماتحوّلش أي حاجة هنا لمتغيّر `NEXT_PUBLIC_*` ولا تحطّها في الريبو: التوكن
 *    وعنوان النفق **أسرار جهاز** (نفس سابقة `ph:deepgram:apiKey`).
 */

/** شكل UUID (٨-٤-٤-٤-١٢ hex). غير حسّاس لحالة الحرف في **الفحص** بس. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** معرّف المالك في Supabase — أول مجرِّب. */
export const PILOT_OWNER_ID = "af40c1a6-5e30-49a3-bea2-8d8a5f3aec2d";

/**
 * قايمة المسموح لهم بالطيّار. مغلقة صراحةً — مافيش «فاضي = الكل».
 *
 * ليه قايمة مش ثابت واحد؟ التجربة محتاجة **صوت تانٍ** (أكبر نقطة ضعف عندنا
 * هي قلة الأصوات: ٤ بس في التدريب). فكل إضافة هنا = مجرِّب مقصود بالاسم.
 *
 * ⚠️ الحفاظ على «الفشل المغلق»: كل عنصر بيتفلتر بفحص شكل UUID، فأي عنصر فاضي
 *    أو null أو مكتوب غلط **يتشال** ومايفتحش الباب لحد. ولو القايمة كلها
 *    بقت فاضية بعد الفلترة، `isPilotOwner` بترجّع false للكل (مش true).
 *
 * 🔒 `Object.freeze` مقصود ومش تزيين: `readonly` بتاعة TypeScript بتتمحي وقت
 *    البناء، فبدون تجميد أي كود في نفس الحزمة يقدر يعمل
 *    `PILOT_ALLOWED_IDS.push(...)` ويفتح الطيّار لهوية مش مقصودة — وده اتأكّد
 *    باختبار فشل فعلاً قبل التجميد (الدخيل دخل، وكمان طرد المالك من مكانه).
 */
export const PILOT_ALLOWED_IDS: readonly string[] = Object.freeze([
  PILOT_OWNER_ID,
  "5659243d-8298-4e6d-88ef-42571491d162",   // أخو المالك — صوت تانٍ للقياس
  "7b4bc404-50e7-46ad-935f-aa65e293d6b8",   // مجرِّب تالت — صوت تالت للقياس
]);

/**
 * هل المستخدم ده مسموح له بالطيّار؟ **فشل مغلق** في كل الحالات الملتبسة:
 * فاضي، null، undefined، مسافات، هوية لسه ماتحلّتش، أوفلاين، خطأ كتابة،
 * قيمة مش سترنج، بادئة/لاحقة، وحروف كبيرة (Supabase بيرجّع صغير دايماً).
 *
 * الاسم فضل `isPilotOwner` عشان كل نداءات الاستدعاء تفضل زي ما هي.
 */
export function isPilotOwner(uid: string | null | undefined): boolean {
  if (typeof uid !== "string" || !UUID_RE.test(uid)) return false;
  if (!Array.isArray(PILOT_ALLOWED_IDS)) return false;
  // الفلترة قبل المقارنة: عنصر مش سترنج أو مش UUID مايشاركش في القرار خالص.
  const allowed = PILOT_ALLOWED_IDS.filter(
    (x): x is string => typeof x === "string" && UUID_RE.test(x),
  );
  if (allowed.length === 0) return false;      // قايمة فاضية = مقفول للكل
  return allowed.includes(uid);
}

// ─────────────────────────────────────────────────────────────────────────────
// المفتاح المركزي — نسخة حرفية من نمط lib/learningSettings.ts:13-27
// (نفس القايمة المسموحة، نفس «false على خطأ»، نفس «false على استثناء»،
//  ونفس استيراد supabase الكسول عشان الدوال النقية تفضل قابلة للاختبار).
// محتاج تشغيل SQL مرة واحدة: docs/sql/plate-judge-toggle.sql
// ─────────────────────────────────────────────────────────────────────────────

/** يحسم قيمة المفتاح. الافتراضي مقفول؛ شغّال بس لو true/"1"/1/"true" صريح. */
export function resolvePlateJudgeEnabled(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** أي خطأ من الـRPC = مقفول، حتى لو الداتا بتقول شغّال. */
export function resolveJudgeRpc(data: unknown, error: unknown): boolean {
  if (error) return false;
  return resolvePlateJudgeEnabled(data);
}

/** يقرا حالة مفتاح الطيّار. false لو فشل/غير محدّد/الـSQL لسه ماتشغّلش. */
export async function fetchPlateJudgeEnabled(): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_plate_judge_enabled");
    return resolveJudgeRpc(data, error);
  } catch {
    return false;
  }
}

/** يغيّر المفتاح (السوبر أدمن فقط — الدالة على السيرفر بتتحقق من is_super). */
export async function setPlateJudgeEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("set_plate_judge_enabled", { p_enabled: enabled });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// إعداد الجهاز: عنوان النفق + التوكن. نفس سابقة `ph:deepgram:apiKey` —
// المالك بيلزقهم في مربّع صغير مايظهرش لغيره، ومافيش أي أثر في الريبو.
// ─────────────────────────────────────────────────────────────────────────────

/** مفتاح localStorage لعنوان خدمة الموديل (أساس النفق، بلا مسار /transcribe). */
export const LS_JUDGE_URL = "ph:plateJudge:url";
/** مفتاح localStorage للتوكن المشترك (نفس اللي الخدمة قامت بيه). */
export const LS_JUDGE_TOKEN = "ph:plateJudge:token";

/** أقصر توكن مقبول — **نفس** الحد اللي `serving/plate_server.py:896` بيفرضه. */
export const JUDGE_MIN_TOKEN_LEN = 12;
/** أطول توكن مقبول — سقف عقلاني لقيمة ترويسة. */
export const JUDGE_MAX_TOKEN_LEN = 256;

export interface JudgeEndpoint {
  /** الأساس المطبَّع (بلا شرطة أخيرة). */
  base: string;
  /** العنوان الكامل للاستنتاج. */
  transcribeUrl: string;
  token: string;
}

/** مضيف محلي = التجربة على المكتب، وهي الحالة الوحيدة اللي http مسموح فيها. */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/**
 * نقاط النهاية اللي الخدمة بتعرفها (`serving/plate_server.py:716-747`). أي أساس
 * بينتهي بواحدة منهم = **لزقة غلط**، مش أساس: بيتشال وقت التطبيع.
 */
const JUDGE_ENDPOINT_SEGMENTS = ["ping", "health", "transcribe"];

/**
 * يتحقّق من عنوان الخدمة ويطبّعه. بيرجع null لو:
 * فاضي · مش URL · بروتوكول غير https (إلا localhost بـhttp للتجربة) ·
 * فيه استعلام أو fragment (التوكن **ممنوع** في الـquery — بيتسرّب في سجلات
 * الوسطاء ولوحة Cloudflare؛ نفس تحذير `serving/plate_server.py:50-52`).
 *
 * ليه https إجباري على الإنترنت؟ الـWebView بيحمّل التطبيق من
 * `https://platehunter-ksa.vercel.app`، فأي طلب `http://` بيتقفل كـmixed-content
 * قبل ما يخرج من الجهاز — يعني إعداد http = طيّار ميّت بصمت. الأحسن نرفضه هنا.
 *
 * ⚠️ وبيشيل مقطع نقطة النهاية من آخر المسار (`/ping` · `/health` · `/transcribe`).
 * ده **مش تجميل**: دفتر التشغيل بيطلب من المالك يفتح `<العنوان>/ping` في متصفّح
 * التليفون للتأكّد من النفق (`docs/pilot-runbook.md:166`)، وأقرب حاجة يلزقها بعد
 * كده هي اللي في شريط العنوان. الأساس ساعتها بيبقى `…/ping` — بيعدّي كل التحقّقات
 * التانية فالمربّع بيكتب «متوصّل»، والطلب بيروح `…/ping/transcribe` والخدمة
 * بتقارن المسار بالحرف (`serving/plate_server.py:745-747`) ⇒ **٤٠٤**. والـ٤٠٤
 * بيرجع **قبل** أي تسجيل (مافيش `_audit`، ومافيش `bump("n_total")` اللي بيحصل بعد
 * التوثيق في :753، و`log_message` مسكّتة في :555) ⇒ الخدمة تبان مستلمة **صفر
 * طلبات** والطيّار ميّت بصمت تام. مافيش أساس شرعي بينتهي بالتلاتة دول.
 */
export function normalizeJudgeBase(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 512) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalHost(u.hostname))) return null;
  if (!u.hostname) return null;
  if (u.search || u.hash) return null;
  if (u.username || u.password) return null;
  let path = u.pathname.replace(/\/+$/, "");
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash >= 0 && JUDGE_ENDPOINT_SEGMENTS.includes(path.slice(lastSlash + 1).toLowerCase())) {
    path = path.slice(0, lastSlash);
  }
  return `${u.origin}${path}`;
}

/**
 * يتحقّق من التوكن. بيرجع null لو فاضي · أقصر من حد السيرفر · أطول من السقف ·
 * فيه أي حرف برّه ASCII المطبوع (مسافة/تاب/سطر جديد/عربي).
 * السطر الجديد مهم أمنياً: قيمة ترويسة فيها CR/LF = حقن ترويسات.
 */
export function normalizeJudgeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length < JUDGE_MIN_TOKEN_LEN || t.length > JUDGE_MAX_TOKEN_LEN) return null;
  if (!/^[\x21-\x7E]+$/.test(t)) return null;
  return t;
}

/**
 * يقرا إعداد الجهاز. **نص إعداد = null** (الطيّار مقفول) — لأن نص إعداد معناه
 * إما طلب بلا توكن (٤٠١ وضجيج في قياس الطيّار) أو توكن بلا عنوان (مافيش وين يروح).
 */
export function readJudgeEndpoint(): JudgeEndpoint | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const base = normalizeJudgeBase(localStorage.getItem(LS_JUDGE_URL));
    const token = normalizeJudgeToken(localStorage.getItem(LS_JUDGE_TOKEN));
    if (!base || !token) return null;
    return { base, transcribeUrl: `${base}/transcribe`, token };
  } catch {
    return null;           // التخزين مقفول/ممتلئ — الطيّار مقفول، والباقي زي النهاردة
  }
}

/** يحفظ الإعداد بعد التحقّق. بيرجع false ومابيكتبش حاجة لو أي طرف غلط. */
export function saveJudgeEndpoint(url: string, token: string): boolean {
  const base = normalizeJudgeBase(url);
  const tok = normalizeJudgeToken(token);
  if (!base || !tok) return false;
  try {
    localStorage.setItem(LS_JUDGE_URL, base);
    localStorage.setItem(LS_JUDGE_TOKEN, tok);
    return true;
  } catch {
    return false;
  }
}

/** يمسح الإعداد (إيقاف فوري للطيّار من الجهاز). */
export function clearJudgeEndpoint(): void {
  try {
    localStorage.removeItem(LS_JUDGE_URL);
    localStorage.removeItem(LS_JUDGE_TOKEN);
  } catch { /* التخزين مقفول — مافيش حاجة تتمسح */ }
}
