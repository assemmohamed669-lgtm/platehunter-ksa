"use client";

/**
 * بيحط كلاس نظام الجهاز على <html> (`platform-ios` / `platform-android` /
 * `platform-web`) عشان الـCSS يقدر يفرّق. الاستخدام الأساسي: مسافات المنطقة
 * الآمنة (safe-area) تتطبّق على iOS بس — لأن على أندرويد المحتوى أصلاً بينزل
 * تحت شريط الحالة، فأي مسافة env زيادة كانت بتعمل جاب مضاعف.
 */
import { useEffect } from "react";

export default function PlatformClass() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let platform = "web";
      try {
        const { Capacitor } = await import("@capacitor/core");
        platform = Capacitor.getPlatform(); // "ios" | "android" | "web"
      } catch {
        /* المكتبة مش موجودة — نفضل web */
      }
      if (cancelled) return;
      const el = document.documentElement;
      // ملاحظة: على iOS الكلاس + viewport-fit=cover بيتحطّوا قبل الرسم من السكريبت
      // المضمّن في اللياوت (أموثق). هنا بنضمن الكلاس لأندرويد/الويب (وإعادة تأكيد iOS).
      if (!el.classList.contains(`platform-${platform}`)) {
        el.classList.remove("platform-ios", "platform-android", "platform-web");
        el.classList.add(`platform-${platform}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
