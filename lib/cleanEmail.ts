/**
 * 📧 تنضيف الإيميل قبل ما يتبعت لـSupabase — المالك (١٣ أكتوبر ٢٠٢٦): `fayezmohmad0303@gmail.com` اترفض بـ«Unable to
 * validate email address: invalid format» وهو سليم. كيبورد أندرويد في خانة جنبها عربي بيحط **علامات اتجاه مخفية**
 * (LRM/RLM/ALM وغيرها) أو مسافات من غير عرض أو أرقام عربية — مابتبانش على الشاشة وSupabase بيرفضها.
 */

/** علامات الاتجاه والتنسيق المخفية + المسافات من غير عرض. */
const INVISIBLE = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function cleanEmail(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")                                                // حروف عريضة ⇒ عادية
    .replace(INVISIBLE, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))   // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))   // ۰-۹
    .replace(/\s+/g, "")                                              // الإيميل مافيهوش مسافات خالص
    .toLowerCase();
}
