"use client";

/**
 * 📍 **الموقع يصحى من أول ما البرنامج يفتح — للي يقدر يستخدم المجمّع بس** (١٩ أكتوبر ٢٠٢٦).
 *
 * لوحة المالك اتفرّغت من غير موقع: فتح «التسجيل» وداس على طول والـGPS لسه بارد. المناديب (`agent`)
 * موقعهم شغّال من أول البرنامج أصلاً (`AgentPresenceReporter`)، بس السوبر أدمن لأ. فهنا خدمة موقع
 * التطبيق نفسها (`gpsService` — نفس المتتبّع بالعدّاد، مش مراقبة جديدة) بتشتغل طول ما البرنامج مفتوح
 * لـ`canUseMujammaa` بس، فلما يفتح المجمّع يلاقي الموقع صاحي.
 */
import { useEffect } from "react";
import { gpsService } from "@/lib/gps";

export default function MujammaaGpsWarmup({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    gpsService.startTracking().catch(() => {});
    return () => gpsService.stopTracking();
  }, [enabled]);
  return null;
}
