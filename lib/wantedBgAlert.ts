/**
 * ══════════════════════════════════════════════════════════════════════
 *  🚨 العربية المطلوبة والمندوب **برّه البرنامج** — Voice PRO (المالك ٢٣ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «لما المندوب يبقي بيشيك ويطلع من البرنامج … راح علي الواتس اب والصوت شغال في الخلفيه … لما بيبقي فيها لوحه
 * مطلوبه مش بيظهر معاه وهو خارج البرنامج صوت التنبيه انها مطلوبه انا عايزة يظهر معاه اشعار برقم اللوحه وبيانات السيارة
 * ويدي تنبيه صوت عالي حسب ماهو مختار نغمه التنبيه».
 *
 * السبب: «مطلوبة» ⇒ `stop("wanted")` (المايك المفتوح بيوطّي الصفّارة — #461) ⇒ ومعاه `stopBackgroundRecording()`. والمندوب
 * برّه: أندرويد ممكن ينيّم البرنامج أول ما الخدمة تقف، والآيفون بيقطع الصوت على طول (`siren-2s ctx=interrupted`). ومفيش
 * إشعار خالص.
 *
 * الحل (من غير نسخة جديدة — كود الصفحة بس):
 *  · 🤖 أندرويد 1.8: «خدمة الخلفية» **تفضل شغّالة** لحد «تم» (المايك بيقف زي الأول) ⇒ الصفحة صاحية والنغمة المختارة ترن.
 *  · 🍏 آيفون 1.4: **المايك يفضل شغّال** لحد ما يرجع للبرنامج (ده اللي مخلّي الآيفون مصحّي البرنامج) ⇒ النغمة ترن (ممكن
 *    أوطى شوية)، وأول ما يرجع المايك يقف والنغمة بصوتها الكامل لحد «تم» زي الأول.
 *  · 🔔 الاتنين: إشعار فوق الشاشة لموبايله هو بس (`/api/wanted-self-push` — نفس Firebase بتاع إشعارات المجموعة) فيه اللوحة
 *    وبيانات العربية من ملف التشييك.
 *  · قدام الشاشة ⇒ ولا حاجة بتتغيّر.
 *  · 🔒 السوبر أدمن الأول (`WANTED_BG_ALERT_FOR_ALL`) — الفتح للكل بعد تجربة المالك.
 */

/** 🔒 السوبر أدمن الأول — المالك يجرّب، وبعدين `true` (من غير نسخة جديدة). */
export const WANTED_BG_ALERT_FOR_ALL = false;

/** أقصى وقت خدمة الخلفية تفضل ماسكة البرنامج صاحي من غير «تم» (الصفّارة نفسها بتلف لحد «تم»). */
export const WANTED_BG_HOLD_MAX_MS = 10 * 60_000;

/** الراوت اللي بيبعت الإشعار لموبايل المندوب نفسه. */
export const WANTED_SELF_PUSH_URL = "/api/wanted-self-push";

export function wantedBgAlertFor(isSuper: boolean): boolean {
  return WANTED_BG_ALERT_FOR_ALL || isSuper === true;
}

export interface WantedBgPlan {
  /** 🤖 خدمة الخلفية ماتتقفلش مع وقف المايك — لحد «تم». */
  holdService: boolean;
  /** 🍏 المايك مايقفش دلوقتي — بيقف لما المندوب يرجع للبرنامج. */
  keepMic: boolean;
  /** 🔔 إشعار فوق الشاشة لموبايله. */
  push: boolean;
}

const NONE: WantedBgPlan = { holdService: false, keepMic: false, push: false };

/**
 * المطلوبة اتأكّدت — نعمل إيه؟ `inBackground` من حالة التطبيق نفسه (`pageVisibility()` — أندرويد 1.8 بيقول للصفحة إنها
 * ظاهرة وهي مش ظاهرة). `bgActive` = خدمة/بلجن الخلفية شغّال (من غيره التسجيل كان هيقف لوحده لما يخرج).
 */
export function wantedBgPlan(o: { platform: string; inBackground: boolean; bgActive: boolean; enabled: boolean }): WantedBgPlan {
  if (!o.enabled || !o.inBackground) return NONE;
  if (o.platform === "android") return { holdService: o.bgActive, keepMic: false, push: true };
  if (o.platform === "ios") return { holdService: false, keepMic: o.bgActive, push: true };
  return NONE;   // المتصفح: مفيش خدمة ولا إشعار هاتف
}

/**
 * 🤖 خدمة الخلفية ممسوكة بعد وقف المايك عشان الصفّارة ترن — بتتساب مع «تم»/أي بداية جديدة/قفل الصفحة، أو لوحدها بعد
 * `maxMs` لو المندوب مارجعش (مانسيبش إشعار «قناص بيسجّل» والموبايل صاحي للأبد).
 */
export class WantedBgHold {
  private held = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly stopService: () => void, private readonly maxMs: number = WANTED_BG_HOLD_MAX_MS) {}

  get isHeld(): boolean {
    return this.held;
  }

  hold(): void {
    this.held = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.release(); }, this.maxMs);
  }

  /** `true` = كانت ممسوكة واتقفلت دلوقتي. */
  release(): boolean {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.held) return false;
    this.held = false;
    try { this.stopService(); } catch { /* الجسر مش موجود — مفيش حاجة تتقفل */ }
    return true;
  }
}

const DIGITS = /[0-9٠-٩]/;

/** «رلع7528» ⇒ «ر ل ع 7528» (زي ما اللوحة مكتوبة). */
export function spacedPlate(plate: string): string {
  const s = String(plate ?? "").replace(/\s+/g, "");
  const letters = [...s].filter((c) => !DIGITS.test(c));
  const digits = [...s].filter((c) => DIGITS.test(c)).join("");
  if (!letters.length || !digits) return String(plate ?? "").trim();
  return `${letters.join(" ")} ${digits}`;
}

const MAX_LINES = 8;
const MAX_BODY = 600;
const MAX_VALUE = 80;
/** عمود اللوحة نفسها (عربي/بنكي) — اللوحة في العنوان أصلاً. */
const PLATE_KEY = /لوح|plate/i;

export interface WantedPush {
  title: string;
  body: string;
  data: Record<string, string>;
}

/** الإشعار: العنوان باللوحة، والجسم بيانات العربية «المفتاح: القيمة» سطر لكل واحدة. */
export function wantedPushPayload(plate: string, info: [string, string][]): WantedPush {
  const lines: string[] = [];
  let len = 0;
  for (const [k, v] of info) {
    const key = String(k ?? "").trim();
    const val = String(v ?? "").trim();
    if (!key || !val || PLATE_KEY.test(key)) continue;
    const line = `${key}: ${val.length > MAX_VALUE ? `${val.slice(0, MAX_VALUE)}…` : val}`;
    if (lines.length >= MAX_LINES || len + line.length + 1 > MAX_BODY) break;
    lines.push(line);
    len += line.length + 1;
  }
  return {
    title: `🚨 عربية مطلوبة: ${spacedPlate(plate)}`,
    body: lines.length ? lines.join("\n") : "افتح البرنامج ودوس «تم»",
    data: { kind: "self-wanted", plate: String(plate ?? "").trim() },
  };
}

export type SelfPushResult = { ok: boolean; sent: number; why?: string; skipped?: string };

/** بيطلب الإشعار من السيرفر — مابيرميش أبداً (التنبيه جوّه البرنامج شغّال في كل الأحوال). */
export async function postWantedSelfPush(
  plate: string,
  info: [string, string][],
  accessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SelfPushResult> {
  if (!accessToken) return { ok: false, sent: 0, why: "no-session" };
  try {
    const res = await fetchImpl(WANTED_SELF_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ plate, info }),
    });
    const j = (await res.json().catch(() => ({}))) as Partial<SelfPushResult>;
    if (!res.ok) return { ok: false, sent: 0, why: `http_${res.status}` };
    return { ok: j.ok === true, sent: Number(j.sent ?? 0), ...(j.skipped ? { skipped: j.skipped } : {}) };
  } catch {
    return { ok: false, sent: 0, why: "network" };
  }
}
