/**
 * 📄🔔 إشعار الشهايد الجديدة على موبايلات المشتركين — المالك (١٣ أكتوبر ٢٠٢٦): «اي شهايد جديده من اللي بتنزل يوميا
 * بمجرد ما تنزل عايز يروح لكل مشتركين البرنامج اشعار علي التليفون نفسه يبقي في شريط الاشعارات».
 *
 * قراراته: **إشعار واحد لكل دفعة** — الشهايد بتنزل على دفعات (٢٠–٣٠ ورا بعض)، فبنستنى لحد ما تبطّل تنزل ٥ دقايق
 * ونبعت عددها · **لكل اللي اشتراكهم شغّال** (نفس قاعدة الدخول `has_active_access`) · **العدد + أسامي الشركات** ·
 * الدوسة بتفتح «شهايد النهارده» (المطلوب، ولمشترك الصوت فقط تبويب «شهايد»).
 *
 * بيشتغل مع دورة الشهايد اليومية كل دقيقة (`/api/cron/cert-daily`). «آخر شهادة اتبعت عنها» بتتحفظ في
 * `cert_push_state` (docs/sql/cert-push.sql)، والعلامة بتتاخد **قبل** الإرسال بتحديث مشروط — دورتين مع بعض
 * مايبعتوش مرتين. الآيفون مافيهوش إشعارات (من غير مفتاح APNs) — أندرويد بس.
 */
import type { PushPayload, PushResult } from "./fcm";

/** الدفعة خلصت لما مافيش شهادة جديدة بقالها ٥ دقايق. */
export const CERT_PUSH_QUIET_MS = 5 * 60_000;

export type CertPushDecision =
  | { action: "init"; mark: string }
  | { action: "wait" }
  | { action: "none" }
  | { action: "send"; mark: string };

/**
 * `last` = آخر شهادة اتبعت عنها إشعار (وقت رفعها على درايف) · `newest` = أحدث شهادة النهارده.
 * أول مرة خالص ⇒ بنعلّم بس (مانبعتش عن اللي موجود قبل الميزة).
 */
export function decideCertPush(o: { last: string | null; newest: string | null; now: Date }): CertPushDecision {
  if (!o.newest) return { action: "none" };
  if (!o.last) return { action: "init", mark: o.newest };
  if (Date.parse(o.newest) <= Date.parse(o.last)) return { action: "none" };
  if (o.now.getTime() - Date.parse(o.newest) < CERT_PUSH_QUIET_MS) return { action: "wait" };
  return { action: "send", mark: o.newest };
}

const ar = (n: number) => n.toLocaleString("ar-EG");

/** «📄 نزل ٢٣ شهادة جديدة» + «الراجحي ١٥ · الأهلي ٨» (الأكتر الأول، أول ٣ شركات). */
export function buildCertPushText(uploaders: string[]): { title: string; body: string; count: number } {
  const count = uploaders.length;
  const by = new Map<string, number>();
  for (const u of uploaders) {
    const name = String(u ?? "").trim();
    if (name) by.set(name, (by.get(name) ?? 0) + 1);
  }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const parts = top.slice(0, 3).map(([n, c]) => `${n} ${ar(c)}`);
  if (top.length > 3) parts.push(`+${ar(top.length - 3)} شركات كمان`);
  return {
    title: count === 1 ? "📄 نزلت شهادة جديدة" : `📄 نزل ${ar(count)} شهادة جديدة`,
    body: parts.length ? parts.join(" · ") : "اضغط وافرز عليها",
    count,
  };
}

export interface SubscriberRow {
  role?: string | null;
  is_active?: boolean | null;
  is_trial?: boolean | null;
  subscription_end?: string | null;
  rest_pages_enabled?: boolean | null;
  is_super?: boolean | null;
}

function dayMinusIso(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** نفس قاعدة الدخول بالظبط (`has_active_access`): موقوف ⇒ لأ؛ أدمن/من غير تاريخ ⇒ أيوه؛ سماح يوم للعادي وصفر للتجربة + يوم. */
export function isActiveSubscriber(p: SubscriberRow, today: string): boolean {
  if (p.is_active === false) return false;
  if (p.role && p.role !== "agent") return true;
  if (!p.subscription_end) return true;
  const grace = (p.is_trial ? 0 : 1) + 1;
  return p.subscription_end >= dayMinusIso(today, grace);
}

/** الدوسة على الإشعار: مشترك الصوت فقط ⇒ تبويب «شهايد» في التشييك · غيره ⇒ صفحة المطلوب (فيها «شهايد النهارده»). */
export function certPushUrl(p: SubscriberRow): string {
  return p.rest_pages_enabled === false && p.is_super !== true ? "/instant-check?tab=cert" : "/wanted";
}

export interface CertPushDeps {
  now(): Date;
  /** النهارده بتوقيت السعودية (YYYY-MM-DD). */
  today(): string;
  readMark(): Promise<string | null>;
  newest(today: string): Promise<string | null>;
  /** بياخد العلامة لو لسه زي ما قريناها (وإلا دورة تانية سبقت) ⇒ true. */
  claim(prev: string | null, next: string): Promise<boolean>;
  uploadersBetween(afterIso: string, untilIso: string): Promise<string[]>;
  recipients(today: string): Promise<{ url: string; tokens: string[] }[]>;
  send(tokens: string[], p: PushPayload): Promise<PushResult>;
  dropDead(tokens: string[]): Promise<void>;
}

export type CertPushResult =
  | { action: "init" | "wait" | "none" | "busy" }
  | { action: "send"; count: number; devices: number; sent: number };

export async function certPushTick(d: CertPushDeps): Promise<CertPushResult> {
  const today = d.today();
  const last = await d.readMark();
  const decision = decideCertPush({ last, newest: await d.newest(today), now: d.now() });
  if (decision.action === "wait" || decision.action === "none") return { action: decision.action };
  if (!(await d.claim(last, decision.mark))) return { action: "busy" };
  if (decision.action === "init") return { action: "init" };

  const uploaders = await d.uploadersBetween(last as string, decision.mark);
  if (uploaders.length === 0) return { action: "none" };
  const text = buildCertPushText(uploaders);
  let devices = 0, sent = 0;
  for (const g of await d.recipients(today)) {
    if (!g.tokens.length) continue;
    devices += g.tokens.length;
    const r = await d.send(g.tokens, {
      title: text.title, body: text.body,
      data: { url: g.url, kind: "certs", count: String(text.count) },
    });
    sent += r.sent;
    if (r.dead.length) await d.dropDead(r.dead);
  }
  return { action: "send", count: text.count, devices, sent };
}

/**
 * 🧪 نتيجة «جرّب إشعار الشهايد على موبايلي» (السوبر أدمن) — المالك (١٣ أكتوبر ٢٠٢٦): «يشوف من خلاله ان فيه اشعارات
 * بالفعل بتيجي حتي لو اي اشعار وهمي».
 */
export function certPushTestMessage(r: { configured: boolean; devices: number; sent: number; dead: number }):
  { level: "ok" | "warn" | "error"; text: string } {
  if (!r.configured) return { level: "error", text: "❌ إشعارات الموبايل مش متظبّطة على السيرفر (FCM_SERVICE_ACCOUNT في Vercel)." };
  if (r.devices === 0) {
    return { level: "warn", text: "⚠️ مافيش موبايل مسجّل باسمك — افتح التطبيق المتثبّت (APK) على موبايلك ووافق على الإشعارات، وجرّب تاني." };
  }
  if (r.sent === 0) {
    return { level: "error", text: r.dead > 0
      ? "❌ الموبايل المسجّل رفض الإشعار (غالباً التطبيق اتمسح أو اتعمله تحديث) — افتح التطبيق تاني عشان يتسجّل من جديد."
      : "❌ الإشعار مااتبعتش — جرّب تاني بعد دقيقة." };
  }
  return { level: "ok", text: `✅ اتبعت على ${ar(r.sent)} جهاز — بص على شريط الإشعارات في موبايلك.` };
}
