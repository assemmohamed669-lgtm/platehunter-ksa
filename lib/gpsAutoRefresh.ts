import type { GpsCoords } from "@/lib/gps";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📍 تحديث الموقع لوحده كل ٣ ثواني — صفحة «الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٤ سبتمبر ٢٠٢٦): «عايز الجي بي اس يعمل تحديث لنفسه كل ٣ ثواني».
 * المتتبّع الحيّ (`watchPosition`) بيستنى الموبايل يبعت قراية — وهو واقف مكانه
 * الموبايل ساعات مابيبعتش، فالموقع بيبان قديم لحد ما المندوب يدوس «تحديث».
 * ده نفس الزرار بس لوحده.
 *
 * · **قراية واحدة في المرة**: لو الإشارة ضعيفة والقراية طوّلت أكتر من ٣ث، مفيش
 *   طلب تاني فوقها (الطلبات كانت هتتراكم وتصرف بطارية على الفاضي).
 * · الفشل (رفض/شبكة) مابيوقفش التحديث ومابيبلّغش بحاجة — الموقع اللي قبله يفضل.
 * · مالوش علاقة بالداتابيز: إرسال موقع المندوب للسيرفر ليه حدّ زمني منفصل
 *   (`shouldSendLocation`: مرة كل ١٥ث على الأكتر) مهما القرايات كترت.
 */
export const GPS_AUTO_REFRESH_MS = 3000;

export function startGpsAutoRefresh(opts: {
  getFix: () => Promise<GpsCoords | null>;
  onFix: (c: GpsCoords) => void;
  intervalMs?: number;
}): () => void {
  let inFlight = false;
  let stopped = false;
  const id = setInterval(() => {
    if (inFlight || stopped) return;
    inFlight = true;
    opts.getFix()
      .then((c) => { if (c && !stopped) opts.onFix(c); })
      .catch(() => { /* رفض أو شبكة — الموقع اللي قبله يفضل */ })
      .finally(() => { inFlight = false; });
  }, opts.intervalMs ?? GPS_AUTO_REFRESH_MS);
  return () => { stopped = true; clearInterval(id); };
}
