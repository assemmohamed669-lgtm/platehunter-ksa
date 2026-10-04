// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { extensionDays, extensionLabel } from "@/lib/subscription";

/**
 * تعديلات صفحة الأدمن — المالك (٤ أكتوبر ٢٠٢٦):
 *  ① «زر شهادات السحب فحص الاتصال ب درايف خليه جوة صفحه احصائيات الشهايد»
 *  ② «مربع صوت فويس اكس كل المناديب مرة واحده مالوش لازم شيل المربع ده خالص»
 *  ③ «علامه قلم علشان اكتب ملاحظه قدام المندوب … تظهر في المربع عند المندوب دة ك ملاحظه
 *     باللون الاحمر و اقدر اشيل الملاحظه دي بعدين»
 *  ④ «صفحه حسابات المناديب الغيها كلها … واي حاجه مكتوبه فيه وظاهرة قدام المندوب الغيها»
 *     + «لما اجي امدد … يظهرلي تلقائي عدد الايام اللي هتتمدد قدامي قبل ما ادوس حفظ»
 *  ⑤ من غير شرح: عجلة الحظ · اشتراك كل خدمة · مفاتيح الصوت · رسالة خاصة — و«المجموعة» تتشال.
 *  «كل التعديلات دي اعملها بحذر ومش عايز حاجه تأثر على شغل صفحه الادمن او البرنامج نفسه».
 */
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
/** الكلام اللي بيظهر بس — من غير تعليقات الكود. */
const ui = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("① فحص اتصال درايف بقى جوّه صفحة إحصائيات الشهايد", () => {
  it("اتنقل من الصفحة الرئيسية لصفحة الإحصائيات — نفس الفحص", () => {
    const main = read("app/admin/page.tsx");
    expect(main).not.toMatch(/drive-health|فحص الاتصال بدرايف|runDriveHealth/);
    const certs = read("app/admin/certificates/page.tsx");
    expect(certs).toMatch(/\/api\/admin\/drive-health/);
    expect(certs).toMatch(/شهادات السحب — فحص الاتصال بدرايف/);
    expect(certs).toMatch(/driveHealthMessage\(/);
    expect(certs).toMatch(/افحص الاتصال/);
  });
});

describe("② مربع «صوت VoiceX — كل المناديب مرة واحدة» اتشال", () => {
  it("المربع راح — وأزرار الصوت/باقي الصفحات لكل مندوب زي ما هي", () => {
    const main = read("app/admin/page.tsx");
    expect(main).not.toMatch(/كل المناديب مرة واحدة|voicex-bulk|runVoicexBulk|bulkConfirm/);
    expect(main).toMatch(/toggleAgentFlag\(a, "setVoicexEnabled"/);
    expect(main).toMatch(/toggleAgentFlag\(a, "setRestPages"/);
  });
});

describe("③ ملاحظة بالقلم على كل مندوب", () => {
  it("🔴 قلم في مربع المندوب (سوبر أدمن الأول) · حفظ · شيل · والملاحظة بالأحمر في مربعه", () => {
    const main = read("app/admin/page.tsx");
    expect(main).toMatch(/isSuper && a\.role === "agent" && \(\s*<button[\s\S]{0,200}setNoteFor\(a\)/);
    expect(main).toMatch(/<Pencil /);
    expect(main).toMatch(/action: "setAdminNote"/);
    expect(main).toMatch(/isSuper && a\.admin_note && \(\s*<p[^>]*text-danger/);
    expect(main).toMatch(/شيل الملاحظة/);
    // الضغط على القلم مايفتحش صفحة المندوب
    expect(main).toMatch(/e\.stopPropagation\(\); setNoteFor\(a\)/);
  });

  it("عمود الملاحظة على صف المندوب (مرة واحدة على Supabase)", () => {
    expect(read("docs/sql/admin-note.sql")).toMatch(/alter table public\.profiles\s+add column if not exists admin_note text/);
  });
});

// ── السيرفر: setAdminNote ──
const updates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabaseAdmin", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: { role: "agent", is_super: false, username: "مندوب" } }),
    update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
  };
  return {
    supabaseAdmin: { from: () => chain },
    verifyAdminContext: async () => ({ id: "admin-1", isSuper: true }),
  };
});
vi.mock("@/lib/securityLogServer", () => ({ logSecurityEvent: () => {}, requestMeta: () => ({}) }));

describe("③ السيرفر: setAdminNote", () => {
  beforeEach(() => { updates.length = 0; });
  const post = async (body: object) => {
    const { POST } = await import("@/app/api/admin/manage-agent/route");
    return POST(new Request("http://localhost/api/admin/manage-agent", {
      method: "POST", headers: { Authorization: "Bearer x" }, body: JSON.stringify(body),
    }) as never);
  };

  it("🔴 بيحفظ الملاحظة على admin_note بس (ومابيلمسش رسالة المندوب)", async () => {
    const res = await post({ agentId: "a1", action: "setAdminNote", note: "  عليه 50 ريال — دفع 100  " });
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ admin_note: "عليه 50 ريال — دفع 100" }]);
  });

  it("🔴 «شيل الملاحظة» = فاضي ⇒ NULL", async () => {
    await post({ agentId: "a1", action: "setAdminNote", note: "" });
    expect(updates).toEqual([{ admin_note: null }]);
  });
});

describe("④ صفحة حسابات المناديب اتلغت كلها", () => {
  it("الصفحة وراوت الدفعات وحساب الخطط اتشالوا", () => {
    expect(existsSync("app/admin/accounts/page.tsx")).toBe(false);
    expect(existsSync("app/api/admin/payments/route.ts")).toBe(false);
    expect(existsSync("lib/agentBilling.ts")).toBe(false);
  });
  it("مفيش زر «حسابات المناديب» ولا شارات «عليه/دفع» قدام المندوب", () => {
    const main = read("app/admin/page.tsx");
    expect(main).not.toMatch(/admin\/accounts|حسابات المناديب|owed_amount|api\/admin\/payments|paidByAgent/);
  });
});

describe("④ عدد أيام التمديد قبل الحفظ", () => {
  const today = "2026-10-04";
  it("🔴 اشتراك لسه شغّال ⇒ من نهايته", () => {
    expect(extensionDays("2026-10-10", "2026-11-10", today)).toEqual({ days: 31, fromToday: false });
  });
  it("🔴 منتهي أو مفيش ⇒ من النهارده", () => {
    expect(extensionDays("2026-09-01", "2026-10-14", today)).toEqual({ days: 10, fromToday: true });
    expect(extensionDays(null, "2026-10-06", today)).toEqual({ days: 2, fromToday: true });
  });
  it("تاريخ أقرب من النهاية ⇒ بالسالب · تاريخ بايظ ⇒ null", () => {
    expect(extensionDays("2026-11-10", "2026-11-01", today)).toEqual({ days: -9, fromToday: false });
    expect(extensionDays("2026-11-10", "", today)).toBeNull();
  });
  it("🔴 الكلام اللي بيظهر", () => {
    expect(extensionLabel({ days: 31, fromToday: false })).toBe("هيتمدد 31 يوم");
    expect(extensionLabel({ days: 10, fromToday: true })).toBe("هيتمدد 10 أيام (من النهارده)");
    expect(extensionLabel({ days: 1, fromToday: false })).toBe("هيتمدد يوم");
    expect(extensionLabel({ days: 2, fromToday: false })).toBe("هيتمدد يومين");
    expect(extensionLabel({ days: -9, fromToday: false })).toBe("هيقلّ 9 أيام");
  });
  it("🔴 بيظهر في مربع الاشتراك وفي كل خدمة على حدة — قبل الحفظ", () => {
    const page = read("app/admin/[id]/page.tsx");
    expect(page).toMatch(/extensionDays\(p\.subscription_end, end/);
    expect(page).toMatch(/extensionDays\(svc\.until, svc\.value/);
  });
});

describe("⑤ من غير شرح · المجموعة اتشالت من صفحة المندوب", () => {
  const page = ui("app/admin/[id]/page.tsx");
  it("عجلة الحظ — الزرار وآخر لفّة زي ما هم", () => {
    expect(page).not.toMatch(/بعد ما تمدّد اشتراكه، دوس هنا/);
    expect(page).toMatch(/فعّل عجلة الحظ/);
    expect(page).toMatch(/آخر لفّة/);
  });
  it("اشتراك كل خدمة على حدة", () => {
    expect(page).not.toMatch(/كل خدمة أيامها لوحدها/);
    expect(page).toMatch(/اشتراك كل خدمة على حدة/);
  });
  it("مربع «المجموعة» اتشال (المجموعات من صفحة المجموعات)", () => {
    expect(page).not.toMatch(/saveTeam|"setTeam"|اسم\/رقم المجموعة|نفس المجموعة بيوصلهم/);
  });
  it("رسالة خاصة للمندوب — الرسالة والإرسال والشيل زي ما هم", () => {
    expect(page).not.toMatch(/بتظهر عنده <b/);
    expect(page).toMatch(/رسالة خاصة للمندوب/);
    expect(page).toMatch(/إرسال الرسالة/);
    expect(page).toMatch(/ظاهرة عنده دلوقتي/);
  });
  it("مفاتيح الصوت — من غير شرح، والمفتاح والاختبار والحفظ زي ما هم", () => {
    const keys = ui("components/AgentVoiceKeys.tsx");
    expect(keys).not.toMatch(/المحرك النشط للمندوب|بعد ما تدوس حفظ|لحظي — أدق للحروف|تسجيل ثم تحليل|مافيش مفتاح هنا|ينزل لجهاز المندوب تلقائياً/);
    expect(keys).toMatch(/engineBtn\("deepgram"/);
    expect(keys).toMatch(/engineBtn\("groq"/);
    expect(keys).toMatch(/testDeepgram/);
    expect(keys).toMatch(/حفظ مفاتيح المندوب/);
  });
});
