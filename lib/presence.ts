/**
 * منطق «حضور» المندوب — حالة النشاط من آخر ظهور، وقرار إرسال تحديث الموقع.
 * دوال نقية قابلة للاختبار (الوقت `now` يُمرَّر عشان الاختبار يكون ثابت).
 */
import { haversineKm } from "@/lib/gps";

export interface Presence {
  online: boolean;
  label: string;
  minsAgo: number | null;
}

/**
 * حالة نشاط المندوب من `last_seen`. «نشط» = فتح التطبيق من ٥ دقايق أو أقل.
 * نفس منطق لوحة الأدمن، بس الوقت قابل للحقن للاختبار.
 */
export function activityStatus(lastSeen: string | null, now: number = Date.now()): Presence {
  if (!lastSeen) return { online: false, label: "لم يفتح البرنامج", minsAgo: null };
  const t = new Date(lastSeen).getTime();
  if (!isFinite(t)) return { online: false, label: "لم يفتح البرنامج", minsAgo: null };
  const mins = Math.floor((now - t) / 60000);
  if (mins <= 5) return { online: true, label: "نشط الآن", minsAgo: mins < 0 ? 0 : mins };
  if (mins < 60) return { online: false, label: `آخر ظهور من ${mins} دقيقة`, minsAgo: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { online: false, label: `آخر ظهور من ${hrs} ساعة`, minsAgo: mins };
  return { online: false, label: `آخر ظهور من ${Math.floor(hrs / 24)} يوم`, minsAgo: mins };
}

/**
 * يقرّر هل نبعت تحديث موقع جديد للسيرفر: نبعت لو (أ) أول مرة، أو (ب) عدّت مدة
 * كافية من آخر إرسال (عشان last_seen يفضل حديث حتى لو المندوب واقف)، أو (ج)
 * المندوب اتحرك مسافة معتبرة. بيقلّل الكتابات على Supabase.
 */
export function shouldSendLocation(
  prev: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number },
  now: number,
  minMoveMeters = 25,
  minIntervalMs = 45000,
): boolean {
  if (!prev) return true;
  if (now - prev.at >= minIntervalMs) return true;
  const meters = haversineKm(prev.lat, prev.lng, next.lat, next.lng) * 1000;
  return meters >= minMoveMeters;
}
