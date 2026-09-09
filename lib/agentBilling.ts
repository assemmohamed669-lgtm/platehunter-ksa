/**
 * agentBilling — خطة المندوب وسعره الشهري (لصفحة حسابات المناديب).
 *
 * الأسعار (بطلب المالك): كل الخدمات ٢٠٠ · الصوت فقط ١٥٠ · بدون الصوت ١٠٠.
 * الخطة بتتحدّد من علمين: voicex_enabled (الصوت) و rest_pages_enabled (باقي الصفحات).
 * لو المالك حطّ رسم مخصّص (monthly_fee) على المندوب، بيغلب على المقترح التلقائي.
 */
export type Plan = "all" | "voice" | "basic";

export const PLAN_LABEL: Record<Plan, string> = {
  all: "كل الخدمات",
  voice: "الصوت فقط",
  basic: "بدون الصوت",
};

export const PLAN_PRICE: Record<Plan, number> = {
  all: 200,
  voice: 150,
  basic: 100,
};

/** خطة المندوب من علمَي الصوت/الصفحات. بدون صوت = «بدون الصوت» مهما كانت الصفحات. */
export function agentPlan(voicex: boolean, rest: boolean): Plan {
  if (!voicex) return "basic";      // بدون صوت = ١٠٠
  return rest ? "all" : "voice";    // صوت + كل الصفحات = ٢٠٠ · صوت فقط = ١٥٠
}

export interface BillingFlags {
  voicex_enabled?: boolean | null;
  rest_pages_enabled?: boolean | null;
  monthly_fee?: number | null;
}

/** الرسم الشهري الفعلي: المخصّص لو موجود، وإلا المقترح من الخطة. */
export function effectiveFee(p: BillingFlags): number {
  if (p.monthly_fee != null && !Number.isNaN(Number(p.monthly_fee))) return Number(p.monthly_fee);
  const rest = p.rest_pages_enabled !== false; // undefined/null → مفتوح (الافتراضي)
  return PLAN_PRICE[agentPlan(p.voicex_enabled === true, rest)];
}

/** خطة المندوب (للعرض/الشارة). */
export function agentPlanOf(p: BillingFlags): Plan {
  return agentPlan(p.voicex_enabled === true, p.rest_pages_enabled !== false);
}

/** مفتاح الشهر YYYY-MM. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** أول وآخر يوم في الشهر (YYYY-MM-DD) — لفلترة الدفعات على السيرفر. */
export function monthRange(mk: string): { start: string; end: string } {
  const [y, m] = mk.split("-").map((n) => parseInt(n, 10));
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
}
