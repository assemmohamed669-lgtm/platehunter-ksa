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
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { setCheckTab } from "@/lib/checkTab";
import { foregroundBannerOf, claimPushListeners, nativeShowsForegroundPush, PUSH_BANNER_EVENT } from "@/lib/foregroundPush";

/** قناة الإشعار على أندرويد — لازم تبقى نفس القيمة اللي السيرفر بيبعت بيها. */
export const PUSH_CHANNEL_ID = "wanted_finds";

export default function PushRegistrar() {
  const router = useRouter();
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

      // المستمعين مرة واحدة في عمر التطبيق (`PushRegistrar` في صفحات التطبيق ولوحة الأدمن) — وإلا كل حاجة بتتكرّر.
      if (claimPushListeners()) {
      await PushNotifications.addListener("registration", (t) => {
        void saveToken(t.value, Capacitor.getPlatform());
      });
      await PushNotifications.addListener("registrationError", () => {
        /* مافيش اتصال بـFCM — نسيبها من غير ضجّة، الإشعار الداخلي شغّال */
      });
      // 🔔 الضغط على إشعار «لقى سيارة مطلوبة» بيفتح صفحة تفاصيلها (المالك ١١ أكتوبر ٢٠٢٦) — العربية بموقعها ومين لقاها
      //    وإمتى. البلجن بيحتفظ بالضغطة لحد ما المستمع ده يتسجّل، فبتشتغل حتى لو البرنامج كان مقفول خالص.
      await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
        const url = String((a.notification?.data as { url?: unknown } | undefined)?.url ?? "");
        // 📄🔔 «شهايد جديدة»: المطلوب، أو تبويب «شهايد» لمشترك الصوت فقط (حتى لو صفحة التشييك مفتوحة أصلاً)
        if (url.includes("tab=cert")) setCheckTab("cert");
        if (url.startsWith("/group-find") || url.startsWith("/wanted") || url.startsWith("/instant-check")) router.push(url);
      });
      // 🔔 الإشعار وصل والتطبيق **مفتوح** ⇒ النسخ القديمة (لحد 1.5) مابتعرضهوش في الشريط — بنعرضه شريط فوق الشاشة
      //    (الشهايد بس؛ «لقى سيارة مطلوبة» ليها تنبيه جوّه التطبيق أصلاً). من 1.6 أندرويد بيعرضه بنفسه، فمانكرّرش.
      //    `lib/foregroundPush.ts`
      let nativeShown = false;
      try {
        const { App } = await import("@capacitor/app");
        nativeShown = nativeShowsForegroundPush((await App.getInfo()).build);
      } catch { /* مش عارفين النسخة ⇒ الشريط يفضل */ }
      await PushNotifications.addListener("pushNotificationReceived", (n) => {
        const b = foregroundBannerOf(n);
        if (b && !nativeShown) window.dispatchEvent(new CustomEvent(PUSH_BANNER_EVENT, { detail: b }));
      });
      }

      await PushNotifications.register();
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router ثابت؛ التسجيل مرة واحدة
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
