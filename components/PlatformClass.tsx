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
      el.classList.remove("platform-ios", "platform-android", "platform-web");
      el.classList.add(`platform-${platform}`);

      // viewport-fit=cover على الآيفون بس — عشان تتفعّل متغيّرات env(safe-area)
      // ويتحطّ الشريط العلوي تحت النوتش. على الأندرويد cover بيرسم المحتوى تحت
      // شريط الحالة (تخبيص)، فمابنحطّهوش هناك.
      if (platform === "ios") {
        try {
          const vp = document.querySelector('meta[name="viewport"]');
          const c = vp?.getAttribute("content") ?? "";
          if (vp && !/viewport-fit/i.test(c)) {
            vp.setAttribute("content", `${c}, viewport-fit=cover`);
          }
        } catch {
          /* تجاهل */
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
