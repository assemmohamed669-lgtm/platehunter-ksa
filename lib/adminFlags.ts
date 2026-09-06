/**
 * علما صلاحيات المندوب اللي بيتحدّدوا **وقت الإنشاء**:
 *   • `voicex_enabled`      — يشتغل بصوت VoiceX (مقفول = ديبجرام).
 *   • `rest_pages_enabled`  — باقي صفحات البرنامج مفتوحة عنده (مقفول = صوت فقط).
 *
 * منفصلة عن مسار الـAPI عشان القاعدة نفسها تتقاس باختبار: الافتراضيات
 * (صوت مقفول · الصفحات مفتوحة) وقصر التحكّم على **السوبر أدمن** — نفس قاعدة
 * `manage-agent` بالظبط، عشان مايبقاش فيه باب خلفي في مسار الإنشاء يسمح لأدمن
 * عادي يفتح صوت أو يقفل صفحات وهو مش مصرّح له من الصفحة التانية.
 */

/** الافتراضي المتفق عليه: الصوت مقفول للكل، وباقي الصفحات مفتوحة للكل. */
const DEFAULTS = { voicex_enabled: false, rest_pages_enabled: true } as const;

export interface NewAgentFlags {
  voicex_enabled: boolean;
  rest_pages_enabled: boolean;
}

export function resolveNewAgentFlags(
  body: { voicexEnabled?: unknown; restPagesEnabled?: unknown },
  ctx: { isSuper: boolean; role: "agent" | "admin" },
): NewAgentFlags {
  // الأدمن مالوش العلمين دول (بيدخل كل حاجة أصلاً)، وغير السوبر مايتحكّمش فيهم.
  if (!ctx.isSuper || ctx.role !== "agent") return { ...DEFAULTS };

  return {
    // `=== true/false` مش cast — قيمة مش boolean (نص أو رقم) بتتجاهل وترجع
    // للافتراضي بدل ما تتحوّل ضمنياً لحاجة مش مقصودة.
    voicex_enabled: body.voicexEnabled === true,
    rest_pages_enabled: body.restPagesEnabled === false ? false : DEFAULTS.rest_pages_enabled,
  };
}
