/**
 * 🧮 مين يشوف المجمّع («التسجيل») — ١٨ أكتوبر ٢٠٢٦.
 *
 * المالك: «هيكون متاح مبدأيا ل اللي مشترك في كل خدمات البرنامج يظهر معاه تلقائي لكن اللي مشترك
 * صوت بس واللي مشترك فرز بس ميظهرش معاهم».
 *
 * كل الخدمات = **الصوت** (`voiceTabVisible`: `voicex_enabled` + `voicex_until` سارية) **و**
 * **باقي البرنامج** (`rest_pages_enabled` مش مقفول + `rest_until` سارية) — نفس الشرطين اللي
 * الشريط والتشييك بيقفلوا بيهم. السوبر أدمن دايماً.
 *
 * `MUJAMMAA_FOR_DELEGATES`: مفتاح رجوع سريع — false ⇒ السوبر أدمن بس زي ما كان.
 */
import { serviceActive } from "@/lib/subscription";
import { voiceTabVisible } from "@/lib/voiceAccess";

export const MUJAMMAA_FOR_DELEGATES = true;

export interface AccessProfile {
  is_super?: boolean | null;
  voicex_enabled?: boolean | null;
  voicex_until?: string | null;
  rest_pages_enabled?: boolean | null;
  rest_until?: string | null;
}

export function hasAllServices(p: AccessProfile | null | undefined): boolean {
  if (!p) return false;
  if (p.is_super === true) return true;
  const voice = voiceTabVisible(p, null);
  const rest = p.rest_pages_enabled !== false && serviceActive(p.rest_until ?? null);
  return voice && rest;
}

export function canUseMujammaa(p: AccessProfile | null | undefined): boolean {
  if (p?.is_super === true) return true;
  return MUJAMMAA_FOR_DELEGATES && hasAllServices(p);
}
