/**
 * 🔎 اختيار حساب بالاسم (مشترك أو أدمن) — لأداة «املأ الحي والشارع» (`components/AreaFillPanel.tsx`).
 *
 * المالك (١٩ أكتوبر ٢٠٢٦): «خلي الخيار اني اختار اسم المشترك او الادمن اللي هعمل معاه كدة». بدل لصق الـID:
 * مربع بحث واحد بيلاقي بالاسم (الهمزة والتاء المربوطة مابيفرقوش) أو الإيميل أو رقم التليفون (أرقام عربي أو
 * إنجليزي) أو الـID (كامل أو أوله).
 */
import { normalizeArabicKey } from "./sortingCols";

export interface PickAccount {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "agent" | string;
  is_super?: boolean | null;
  is_active?: boolean | null;
}

/** «٠٥٥» ⇒ «055» وأي حاجة غير أرقام بتتشال. */
function digitsOf(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

/** الحسابات اللي بتطابق البحث، بالترتيب الأبجدي. فاضي ⇒ الكل. */
export function pickAccounts(list: readonly PickAccount[], query: string, limit = 100): PickAccount[] {
  const raw = String(query ?? "").trim();
  const q = normalizeArabicKey(raw);
  const qDigits = digitsOf(raw);
  const qLower = raw.toLowerCase();
  const hits = (list ?? []).filter((a) => {
    if (!raw) return true;
    if (normalizeArabicKey(String(a.username ?? "")).includes(q)) return true;
    if (String(a.email ?? "").toLowerCase().includes(qLower)) return true;
    if (String(a.id ?? "").toLowerCase().startsWith(qLower)) return true;
    // الرقم: ٤ أرقام على الأقل عشان «1» مايطلّعش الكل
    if (qDigits.length >= 4 && qDigits.length === raw.replace(/[\s+\-()]/g, "").length
      && digitsOf(String(a.phone ?? "")).includes(qDigits)) return true;
    return false;
  });
  return hits
    .slice()
    .sort((x, y) => String(x.username ?? "").localeCompare(String(y.username ?? ""), "ar"))
    .slice(0, Math.max(1, limit));
}

/** «مشترك» / «أدمن» / «سوبر أدمن» (+ «مقفول» لو الحساب متوقف). */
export function accountRoleLabel(a: PickAccount): string {
  const base = a.role === "admin" ? (a.is_super ? "سوبر أدمن" : "أدمن") : "مشترك";
  return a.is_active === false ? `${base} · مقفول` : base;
}
