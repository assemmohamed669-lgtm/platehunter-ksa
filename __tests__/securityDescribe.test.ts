import { describe, it, expect } from "vitest";
import { describeSecurityEvent, buildActionDetail, formatEventTime } from "@/lib/securityDescribe";

/**
 * سجل الأمان كان بيعرض التفصيلة زي ما السيرفر كتبها: `setVoicexEnabled`،
 * `create_agent role=agent`، `DENIED super_only:delete`. المالك عايز يقرا
 * الحدث بالعربي على طول: مين عمل إيه لمين وإمتى.
 *
 * والأهم: `detail` كان بيسجّل **اسم الإجراء بس** من غير القيمة — يعني
 * «setVoicexEnabled» مش معروف منها اتفتح ولا اتقفل. `buildActionDetail`
 * بتضيف القيمة، و`describeSecurityEvent` بتترجمها.
 */
describe("buildActionDetail — القيمة تتسجّل مع الإجراء", () => {
  it("الصوت: بيفرّق بين الفتح والقفل", () => {
    expect(buildActionDetail("setVoicexEnabled", { enabled: true })).toBe("setVoicexEnabled=on");
    expect(buildActionDetail("setVoicexEnabled", { enabled: false })).toBe("setVoicexEnabled=off");
  });

  it("باقي الصفحات والتفعيل وإعفاء الجهاز", () => {
    expect(buildActionDetail("setRestPages", { enabled: false })).toBe("setRestPages=off");
    expect(buildActionDetail("setActive", { active: true })).toBe("setActive=on");
    expect(buildActionDetail("setDeviceExempt", { exempt: true })).toBe("setDeviceExempt=on");
  });

  it("التمديد بيسجّل التاريخ الجديد، والدور بيسجّل الدور", () => {
    expect(buildActionDetail("extendSubscription", { newEnd: "2026-10-06" }))
      .toBe("extendSubscription=2026-10-06");
    expect(buildActionDetail("setRole", { role: "admin" })).toBe("setRole=admin");
  });

  it("🔒 الإجراءات الحسّاسة مابتسجّلش قيمها أبداً", () => {
    expect(buildActionDetail("setPassword", { password: "s3cret!" })).toBe("setPassword");
    expect(buildActionDetail("setKeys", { serviceKeys: { deepgram: "dg_live_xxx" } })).toBe("setKeys");
    expect(buildActionDetail("updateContact", { phone: "0551234567" })).toBe("updateContact");
  });

  it("إجراء مش معروف بيرجع زي ما هو", () => {
    expect(buildActionDetail("delete", {})).toBe("delete");
  });
});

describe("describeSecurityEvent — الحدث بالعربي", () => {
  const d = (type: string, detail: string | null) => describeSecurityEvent(type, detail);

  it("فتح وقفل الصوت", () => {
    expect(d("admin_action", "setVoicexEnabled=on").action).toBe("فتح صوت VoiceX للمندوب");
    expect(d("admin_action", "setVoicexEnabled=off").action).toBe("قفل صوت VoiceX (رجّعه لديبجرام)");
  });

  it("فتح وقفل باقي خدمات البرنامج", () => {
    expect(d("admin_action", "setRestPages=on").action).toBe("فتح باقي صفحات البرنامج للمندوب");
    expect(d("admin_action", "setRestPages=off").action).toBe("قفل باقي الصفحات (صوت فقط)");
  });

  it("تمديد الاشتراك بيبيّن التاريخ الجديد", () => {
    const r = d("admin_action", "extendSubscription=2026-10-06");
    expect(r.action).toBe("تمديد الاشتراك");
    expect(r.note).toContain("2026-10-06");
  });

  it("حساب جديد — مندوب وأدمن وتجربة", () => {
    expect(d("admin_action", "create_agent role=agent").action).toBe("إنشاء حساب مندوب جديد");
    expect(d("admin_action", "create_agent role=admin").action).toBe("إنشاء حساب أدمن جديد");
    expect(d("admin_action", "create_agent role=agent trial").action).toBe("إنشاء حساب تجربة مجانية");
  });

  it("باقي إجراءات الأدمن", () => {
    expect(d("admin_action", "setPassword").action).toBe("تغيير كلمة مرور المندوب");
    expect(d("admin_action", "resetDevice").action).toBe("تصفير الجهاز المربوط (يقدر يدخل من موبايل جديد)");
    expect(d("admin_action", "setActive=off").action).toBe("قفل الحساب مؤقتاً");
    expect(d("admin_action", "setActive=on").action).toBe("فتح الحساب تاني");
    expect(d("admin_action", "delete").action).toBe("حذف الحساب");
    expect(d("admin_action", "setRole=admin").action).toBe("ترقية الحساب لأدمن");
    expect(d("admin_action", "setKeys").action).toBe("تعديل مفاتيح الصوت للمندوب");
    expect(d("admin_action", "updateContact").action).toBe("تعديل بيانات التواصل (اسم/تليفون)");
  });

  it("الإجراء الجماعي على الصوت بيبيّن العدد", () => {
    const r = d("admin_action", "voicexBulk:on count=12");
    expect(r.action).toBe("فتح صوت VoiceX لكل المناديب");
    expect(r.note).toContain("12");
  });

  it("محاولة مرفوضة بتتقال صراحة", () => {
    const r = d("admin_action", "DENIED super_only:delete");
    expect(r.action).toContain("مرفوضة");
    expect(r.note).toContain("حذف الحساب");
  });

  it("محاولات الدخول", () => {
    expect(d("login_device_mismatch", null).action).toBe("حاول يدخل من تليفون مختلف");
    expect(d("login_account_disabled", null).action).toBe("حاول يدخل بحساب موقوف");
    expect(d("login_cut_off", null).action).toBe("حاول يدخل باشتراك منتهي");
  });

  it("نداءات بلا تصريح وتعدّي الحد بيسيبوا المسار في الملاحظة", () => {
    const r = d("api_unauthorized", "/api/admin/manage-agent — no token");
    expect(r.action).toBe("نداء للسيرفر بلا تصريح");
    expect(r.note).toContain("/api/admin/manage-agent");
    expect(d("api_rate_limited", "/api/read-plate").action).toBe("تعدّى حد الاستهلاك");
  });

  it("نوع أو تفصيلة مش معروفة مابتكسرش — بترجع الخام", () => {
    const r = d("something_new", "raw detail");
    expect(r.action).toBe("something_new");
    expect(r.note).toBe("raw detail");
  });
});

describe("formatEventTime — تاريخ ووقت بالعربي", () => {
  it("بيكتب اليوم والشهر بالعربي والسنة والوقت بنظام ١٢ ساعة", () => {
    // 2026-09-06T15:45:00 محلي
    const s = formatEventTime(new Date(2026, 8, 6, 15, 45).toISOString());
    expect(s).toContain("6 سبتمبر 2026");
    expect(s).toContain("3:45");
    expect(s).toContain("م");
  });

  it("الصبح بيبقى «ص»، ونص الليل ١٢", () => {
    expect(formatEventTime(new Date(2026, 0, 1, 9, 5).toISOString())).toContain("9:05 ص");
    expect(formatEventTime(new Date(2026, 0, 1, 0, 30).toISOString())).toContain("12:30 ص");
  });

  it("تاريخ باظ مايكسرش الصفحة", () => {
    expect(formatEventTime("مش تاريخ")).toBe("—");
  });
});
