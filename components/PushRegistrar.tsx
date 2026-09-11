"use client";

/**
 * تسجيل الجهاز لإشعارات الهاتف (push).
 *
 * بيشتغل على التطبيق المثبَّت بس (أندرويد/آيفون) — على المتصفح مابيعملش حاجة
 * خالص. بياخد إذن الإشعارات، يسجّل الجهاز في FCM، ويحفظ التوكن في
 * `device_tokens` عشان السيرفر يعرف يبعت لباقي المجموعة والتطبيق مقفول.
 *
 * متركّب مرة واحدة في اللياوت (زي GroupFindNotifier).
 */
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/** قناة الإشعار على أندرويد — لازم تبقى نفس القيمة اللي السيرفر بيبعت بيها. */
export const PUSH_CHANNEL_ID = "wanted_finds";

export default function PushRegistrar() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // استيراد ديناميكي: على الويب المكتبة مش محتاجة تتحمّل أصلاً.
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      // قناة عالية الأهمية عشان الإشعار يطلع فوق الشاشة بصوت (أندرويد ٨+).
      if (Capacitor.getPlatform() === "android") {
        try {
          await PushNotifications.createChannel({
            id: PUSH_CHANNEL_ID,
            name: "لقطات المجموعة",
            description: "لما زميلك في المجموعة يلاقي سيارة مطلوبة",
            importance: 5,
            visibility: 1,
          });
        } catch { /* القناة موجودة أصلاً أو المنصّة مش أندرويد */ }
      }

      // الإذن: أندرويد ١٣+ والآيفون بيسألوا المستخدم. لو رفض، مافيش إشعارات
      // هاتف — الإشعار اللي جوّه التطبيق بيفضل شغّال زي ما هو.
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted" || cancelled) return;

      await PushNotifications.addListener("registration", (t) => {
        void saveToken(t.value, Capacitor.getPlatform());
      });
      await PushNotifications.addListener("registrationError", () => {
        /* مافيش اتصال بـFCM — نسيبها من غير ضجّة، الإشعار الداخلي شغّال */
      });

      await PushNotifications.register();
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}

async function saveToken(token: string, platform: string) {
  if (!token) return;
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  // نفس الجهاز ممكن يرجّع نفس التوكن كل مرة — upsert على المفتاح.
  await supabase.from("device_tokens").upsert(
    { token, agent_id: uid, platform, updated_at: new Date().toISOString() },
    { onConflict: "token" }
  );
}
