/**
 * ترجمة أحداث سجل الأمان لعربي مفهوم.
 *
 * السيرفر بيسجّل التفصيلة بصيغة تقنية مختصرة (`setVoicexEnabled=on`،
 * `create_agent role=agent trial`، `DENIED super_only:delete`) عشان تفضل
 * ثابتة وقابلة للبحث. العرض للأدمن لازم يبقى جملة عربية: عمل إيه، لمين،
 * وليه اتمنع لو اتمنع.
 *
 * ليه ملف منفصل: (١) الترجمة تتقاس باختبار من غير ما نشغّل الصفحة، (٢) نفس
 * الدوال بتستخدمها الصفحة والسيرفر — `buildActionDetail` بتتنادى وقت الكتابة
 * و`describeSecurityEvent` وقت العرض، فلو الصيغة اتغيّرت بتتغيّر في مكان واحد.
 */

/** إجراءات بتتسجّل قيمتها مع اسمها (on/off أو تاريخ أو دور). */
const VALUE_OF: Record<string, (b: Record<string, unknown>) => string | null> = {
  setVoicexEnabled: (b) => (b.enabled ? "on" : "off"),
  setRestPages: (b) => (b.enabled ? "on" : "off"),
  setActive: (b) => (b.active ? "on" : "off"),
  setDeviceExempt: (b) => (b.exempt ? "on" : "off"),
  setRole: (b) => (typeof b.role === "string" ? b.role : null),
  extendSubscription: (b) => (typeof b.newEnd === "string" ? b.newEnd : null),
};

/**
 * التفصيلة اللي تتكتب في السجل لإجراء أدمن.
 *
 * ⚠️ الإجراءات الحسّاسة (`setPassword`, `setKeys`, `updateContact`) **مالهاش
 * قيمة هنا أبداً** — سجل الأمان بيتقرا من لوحة الأدمن، وكتابة كلمة مرور أو
 * مفتاح خدمة فيه بيحوّل السجل نفسه لتسريب.
 */
export function buildActionDetail(action: string, body: Record<string, unknown>): string {
  const v = VALUE_OF[action]?.(body);
  return v ? `${action}=${v}` : action;
}

export interface EventDescription {
  /** الجملة الأساسية — إيه اللي حصل. */
  action: string;
  /** تفصيلة إضافية (تاريخ، عدد، مسار، سبب المنع) لو فيه. */
  note?: string;
}

const ON_OFF: Record<string, EventDescription> = {
  "setVoicexEnabled=on": { action: "فتح صوت VoiceX للمندوب" },
  "setVoicexEnabled=off": { action: "قفل صوت VoiceX (رجّعه لديبجرام)" },
  "setRestPages=on": { action: "فتح باقي صفحات البرنامج للمندوب" },
  "setRestPages=off": { action: "قفل باقي الصفحات (صوت فقط)" },
  "setActive=on": { action: "فتح الحساب تاني" },
  "setActive=off": { action: "قفل الحساب مؤقتاً" },
  "setDeviceExempt=on": { action: "إعفاء المندوب من ربط الجهاز" },
  "setDeviceExempt=off": { action: "رجّع ربط الجهاز للمندوب" },
};

/** إجراءات بلا قيمة. */
const PLAIN: Record<string, string> = {
  setPassword: "تغيير كلمة مرور المندوب",
  updateContact: "تعديل بيانات التواصل (اسم/تليفون)",
  resetDevice: "تصفير الجهاز المربوط (يقدر يدخل من موبايل جديد)",
  setKeys: "تعديل مفاتيح الصوت للمندوب",
  delete: "حذف الحساب",
  setVoicexEnabled: "تغيير صوت VoiceX للمندوب",
  setRestPages: "تغيير صفحات البرنامج للمندوب",
  setActive: "تغيير حالة الحساب",
  setDeviceExempt: "تغيير إعفاء الجهاز",
};

/** أنواع الأحداث اللي مالهاش تفصيلة — النوع نفسه هو الجملة. */
const BY_TYPE: Record<string, string> = {
  login_device_mismatch: "حاول يدخل من تليفون مختلف",
  login_account_disabled: "حاول يدخل بحساب موقوف",
  login_cut_off: "حاول يدخل باشتراك منتهي",
  api_unauthorized: "نداء للسيرفر بلا تصريح",
  api_rate_limited: "تعدّى حد الاستهلاك",
};

function describeAction(detail: string): EventDescription | null {
  if (ON_OFF[detail]) return ON_OFF[detail];

  // حساب جديد: create_agent role=agent [trial]
  const create = detail.match(/^create_agent role=(agent|admin)(\s+trial)?$/);
  if (create) {
    if (create[2]) return { action: "إنشاء حساب تجربة مجانية" };
    return { action: create[1] === "admin" ? "إنشاء حساب أدمن جديد" : "إنشاء حساب مندوب جديد" };
  }

  const extend = detail.match(/^extendSubscription=(.+)$/);
  if (extend) return { action: "تمديد الاشتراك", note: `الاشتراك بقى لحد ${extend[1]}` };

  const role = detail.match(/^setRole=(.+)$/);
  if (role) {
    return {
      action: role[1] === "admin" ? "ترقية الحساب لأدمن" : "تحويل الحساب لمندوب عادي",
    };
  }

  const bulk = detail.match(/^voicexBulk:(on|off)(?:\s+count=(\d+))?$/);
  if (bulk) {
    return {
      action: bulk[1] === "on" ? "فتح صوت VoiceX لكل المناديب" : "قفل صوت VoiceX عن كل المناديب",
      note: bulk[2] ? `اتأثّر ${bulk[2]} مندوب` : undefined,
    };
  }

  const denied = detail.match(/^DENIED super_only:(.+)$/);
  if (denied) {
    const inner = describeAction(denied[1]) ?? { action: PLAIN[denied[1]] ?? denied[1] };
    return {
      action: "محاولة مرفوضة — الإجراء للسوبر أدمن بس",
      note: `حاول: ${inner.action}`,
    };
  }

  if (PLAIN[detail]) return { action: PLAIN[detail] };
  return null;
}

export function describeSecurityEvent(type: string, detail: string | null): EventDescription {
  const d = (detail ?? "").trim();

  if (type === "admin_action") {
    const found = d ? describeAction(d) : null;
    if (found) return found;
    return { action: "إجراء أدمن", note: d || undefined };
  }

  const byType = BY_TYPE[type];
  if (byType) return { action: byType, note: d || undefined };

  // نوع جديد اتضاف على السيرفر ولسه ماترجمناهوش — نعرض الخام بدل ما نبلعه.
  return { action: type, note: d || undefined };
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** «6 سبتمبر 2026 · 3:45 م» — تاريخ ووقت كاملين بنظام ١٢ ساعة. */
export function formatEventTime(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  const h24 = dt.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const period = h24 < 12 ? "ص" : "م";
  return `${dt.getDate()} ${AR_MONTHS[dt.getMonth()]} ${dt.getFullYear()} · ${h12}:${mm} ${period}`;
}
