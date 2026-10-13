import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decideCertPush, buildCertPushText, isActiveSubscriber, certPushUrl, certPushTick, CERT_PUSH_QUIET_MS,
  type CertPushDeps,
} from "@/lib/certPush";

/**
 * 📄🔔 إشعار الشهايد الجديدة — المالك (١٣ أكتوبر ٢٠٢٦): «اي شهايد جديده من اللي بتنزل يوميا بمجرد ما تنزل عايز يروح
 * لكل مشتركين البرنامج اشعار علي التليفون نفسه يبقي في شريط الاشعارات». قراراته: إشعار واحد لكل دفعة (لما تبطّل
 * تنزل ٥ دقايق) · لكل اللي اشتراكهم شغّال · العدد + أسامي الشركات · للكل على طول.
 */
const T = (m: number) => new Date(Date.UTC(2026, 9, 13, 9, m)).toISOString();

describe("⏱️ إمتى يتبعت", () => {
  const now = new Date(Date.UTC(2026, 9, 13, 9, 30));
  it("🔴 أول مرة خالص ⇒ مايبعتش عن الموجود (بيعلّم بس)", () => {
    expect(decideCertPush({ last: null, newest: T(20), now })).toEqual({ action: "init", mark: T(20) });
  });
  it("🔴 الدفعة لسه بتنزل (آخر شهادة من أقل من ٥ دقايق) ⇒ يستنى", () => {
    expect(decideCertPush({ last: T(0), newest: T(27), now })).toEqual({ action: "wait" });
  });
  it("🔴 الدفعة خلصت (مافيش جديد ٥ دقايق) ⇒ يبعت", () => {
    expect(decideCertPush({ last: T(0), newest: T(24), now })).toEqual({ action: "send", mark: T(24) });
    expect(CERT_PUSH_QUIET_MS).toBe(5 * 60_000);
  });
  it("مافيش جديد ⇒ ولا حاجة", () => {
    expect(decideCertPush({ last: T(24), newest: T(24), now })).toEqual({ action: "none" });
    expect(decideCertPush({ last: T(24), newest: null, now })).toEqual({ action: "none" });
  });
});

describe("✉️ الإشعار بيقول إيه", () => {
  it("🔴 العدد + أسامي الشركات (الأكتر الأول)", () => {
    const up = [...Array(15).fill("الراجحي"), ...Array(8).fill("الأهلي")];
    const t = buildCertPushText(up);
    expect(t.title).toBe("📄 نزل ٢٣ شهادة جديدة");
    expect(t.body).toBe("الراجحي ١٥ · الأهلي ٨");
  });
  it("أكتر من ٣ شركات ⇒ أول ٣ و«+N كمان»", () => {
    const t = buildCertPushText(["أ", "أ", "أ", "ب", "ب", "ج", "د", "هـ"]);
    expect(t.body).toBe("أ ٣ · ب ٢ · ج ١ · +٢ شركات كمان");
  });
  it("شهادة واحدة / شركة من غير اسم", () => {
    expect(buildCertPushText(["الإنماء"]).title).toBe("📄 نزلت شهادة جديدة");
    expect(buildCertPushText(["", ""]).body).toBe("اضغط وافرز عليها");
  });
});

describe("👥 لمين", () => {
  const today = "2026-10-13";
  it("🔴 اشتراكه شغّال ⇒ أيوه · خلص ⇒ لأ · موقوف ⇒ لأ", () => {
    expect(isActiveSubscriber({ role: "agent", is_active: true, subscription_end: "2026-11-01" }, today)).toBe(true);
    expect(isActiveSubscriber({ role: "agent", is_active: true, subscription_end: "2026-09-01" }, today)).toBe(false);
    expect(isActiveSubscriber({ role: "agent", is_active: false, subscription_end: "2026-11-01" }, today)).toBe(false);
  });
  it("نفس سماح الدخول بالظبط (يوم للعادي، صفر للتجربة + يوم فرق توقيت)", () => {
    expect(isActiveSubscriber({ role: "agent", is_active: true, subscription_end: "2026-10-11" }, today)).toBe(true);
    expect(isActiveSubscriber({ role: "agent", is_active: true, subscription_end: "2026-10-10" }, today)).toBe(false);
    expect(isActiveSubscriber({ role: "agent", is_active: true, is_trial: true, subscription_end: "2026-10-12" }, today)).toBe(true);
    expect(isActiveSubscriber({ role: "agent", is_active: true, is_trial: true, subscription_end: "2026-10-11" }, today)).toBe(false);
  });
  it("من غير تاريخ اشتراك / أدمن ⇒ أيوه", () => {
    expect(isActiveSubscriber({ role: "agent", is_active: true, subscription_end: null }, today)).toBe(true);
    expect(isActiveSubscriber({ role: "admin", is_active: true, subscription_end: "2020-01-01" }, today)).toBe(true);
  });
  it("🔴 الدوسة: مشترك الصوت فقط ⇒ تبويب «شهايد» · غيره ⇒ صفحة المطلوب", () => {
    expect(certPushUrl({ rest_pages_enabled: false })).toBe("/instant-check?tab=cert");
    expect(certPushUrl({ rest_pages_enabled: true })).toBe("/wanted");
    expect(certPushUrl({ rest_pages_enabled: false, is_super: true })).toBe("/wanted");
  });
});

describe("🔁 الدورة", () => {
  function deps(o: Partial<CertPushDeps> & { last?: string | null; newest?: string | null } = {}) {
    const sent: { tokens: string[]; title: string; body: string; url: string }[] = [];
    const marks: (string | null)[] = [];
    const { last: lastIn, newest: newestIn, ...rest } = o;
    let last = lastIn === undefined ? T(0) : lastIn;
    const d: CertPushDeps = {
      now: () => new Date(Date.UTC(2026, 9, 13, 9, 30)),
      today: () => "2026-10-13",
      readMark: async () => last,
      newest: async () => (newestIn === undefined ? T(20) : newestIn),
      claim: async (prev, next) => { if (prev !== last) return false; last = next; marks.push(next); return true; },
      uploadersBetween: async () => ["الراجحي", "الراجحي", "الأهلي"],
      recipients: async () => [
        { url: "/wanted", tokens: ["t1", "t2"] },
        { url: "/instant-check?tab=cert", tokens: ["t3"] },
      ],
      send: async (tokens, p) => { sent.push({ tokens, title: p.title, body: p.body, url: p.data?.url ?? "" }); return { sent: tokens.length, dead: [] }; },
      dropDead: async () => {},
      ...rest,
    };
    return { d, sent, marks };
  }
  it("🔴 دفعة خلصت ⇒ إشعار لكل مجموعة بالدوسة بتاعتها", async () => {
    const { d, sent, marks } = deps();
    const r = await certPushTick(d);
    expect(r).toMatchObject({ action: "send", count: 3, devices: 3 });
    expect(marks).toEqual([T(20)]);
    expect(sent).toEqual([
      { tokens: ["t1", "t2"], title: "📄 نزل ٣ شهادة جديدة", body: "الراجحي ٢ · الأهلي ١", url: "/wanted" },
      { tokens: ["t3"], title: "📄 نزل ٣ شهادة جديدة", body: "الراجحي ٢ · الأهلي ١", url: "/instant-check?tab=cert" },
    ]);
  });
  it("🔴 دورتين مع بعض ⇒ واحدة بس اللي تبعت (التانية ماتقدرش تاخد العلامة)", async () => {
    const { d, sent } = deps({ claim: async () => false });
    expect((await certPushTick(d)).action).toBe("busy");
    expect(sent).toEqual([]);
  });
  it("🔴 أول تشغيل ⇒ مايبعتش عن شهايد النهارده الموجودة", async () => {
    const { d, sent, marks } = deps({ last: null });
    expect((await certPushTick(d)).action).toBe("init");
    expect(sent).toEqual([]);
    expect(marks).toEqual([T(20)]);
  });
  it("الدفعة لسه بتنزل ⇒ مايبعتش", async () => {
    const { d, sent } = deps({ newest: T(28) });
    expect((await certPushTick(d)).action).toBe("wait");
    expect(sent).toEqual([]);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 دورة الشهايد اليومية بتشغّل الإشعار — وغلطه مايوقفش الدورة", () => {
    expect(read("app/api/cron/cert-daily/route.ts")).toMatch(/const push = await runCertPush\(\)\.catch\(\(e\) => \(\{ action: "error", error: String\(\(e as Error\)\?\.message \?\? e\) \}\)\);/);
  });
  it("🔴 الدوسة على الإشعار بتفتح صفحة الشهايد", () => {
    const r = read("components/PushRegistrar.tsx");
    expect(r).toMatch(/if \(url\.startsWith\("\/group-find"\) \|\| url\.startsWith\("\/wanted"\) \|\| url\.startsWith\("\/instant-check"\)\) router\.push\(url\);/);
    expect(read("app/(app)/instant-check/page.tsx")).toMatch(/new URLSearchParams\(window\.location\.search\)\.get\("tab"\) === "cert"/);
  });
  it("🔴 الجدول الجديد ليه صلاحية السيرفر (Supabase بطّل يدّيها لوحده)", () => {
    expect(read("docs/sql/cert-push.sql")).toMatch(/grant select, insert, update on public\.cert_push_state to service_role;/);
  });
});
