/**
 * 📧 اللي المندوب كتبه في خانة الدخول ⇒ الإيميل اللي بيتبعت لـSupabase.
 *
 * المالك (١٤ أكتوبر ٢٠٢٦، صورة): مندوب كاتب إيميل سليم والدخول اترفض بـ«الجزء المتبوع بالعلامة "@" يجب ألا يشتمل على
 * الرمز "."» — الكيبورد (عربي/إنجليزي) بيزوّد علامة اتجاه مخفية جنب النقطة. `cleanEmail` (#428) بيشيلها + الأرقام
 * العربية + المسافات + الحروف الكبيرة — نفس اللي بيتعمل وقت إضافة الحساب، فالاتنين بيتقابلوا.
 * اسم مستخدم من غير «@» (حسابات قديمة) ⇒ `@platehunter.local` زي الأول.
 */
import { cleanEmail } from "./cleanEmail";

export function usernameToEmail(username: string): string {
  const u = cleanEmail(username);
  return u.includes("@") ? u : `${u}@platehunter.local`;
}
