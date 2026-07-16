"use client";

/**
 * بيبلّغ موقع المندوب للسيرفر أثناء ما التطبيق مفتوح — عشان الأدمن يشوف مواقع
 * المناديب لايف على الخريطة. بيشتغل للمستخدم المسجّل دخوله بس، وبيرسل تحديث كل
 * ~٤٥ث أو لما يتحرّك (throttle عبر shouldSendLocation) لتقليل الكتابات.
 * بيعرض إشعار خصوصية لمرة واحدة. لمّا التطبيق يتقفل الموقع بيتجمّد على «آخر ظهور».
 */
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { gpsService } from "@/lib/gps";
import { shouldSendLocation } from "@/lib/presence";

const LS_CONSENT = "ph:locConsentShown";

export default function AgentPresenceReporter() {
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const authedRef = useRef(false);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    let stopped = false;
    let unsub: (() => void) | null = null;
    let startedTracking = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || stopped) return;
      // المناديب بس هم اللي بيتتبّعوا — الأدمن مايتبعتش موقعه ولا يشوف إشعار الخصوصية.
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (prof?.role !== "agent" || stopped) return;
      authedRef.current = true;

      try {
        if (!localStorage.getItem(LS_CONSENT)) setNotice(true);
      } catch { /* storage unavailable */ }

      gpsService.startTracking().catch(() => {});
      startedTracking = true;
      unsub = gpsService.subscribe((c) => {
        if (!c || !authedRef.current) return;
        const now = Date.now();
        if (!shouldSendLocation(lastSentRef.current, { lat: c.lat, lng: c.lng }, now)) return;
        lastSentRef.current = { lat: c.lat, lng: c.lng, at: now };
        supabase.rpc("touch_last_location", {
          p_lat: c.lat,
          p_lng: c.lng,
          p_accuracy: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
        }).then(() => {}, () => { /* offline / not migrated yet — تجاهل */ });
      });
    })();

    return () => {
      stopped = true;
      authedRef.current = false;
      if (unsub) unsub();
      // نوازن العدّاد بتاع المتتبّع (لو كنا بدأناه) عشان يتقفل لما نخرج من التطبيق.
      if (startedTracking) gpsService.stopTracking();
    };
  }, []);

  function dismiss() {
    setNotice(false);
    try { localStorage.setItem(LS_CONSENT, "1"); } catch { /* ignore */ }
  }

  if (!notice) return null;
  return (
    <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary" dir="rtl">
      <MapPin size={14} className="shrink-0" />
      <span className="flex-1">موقعك يظهر لإدارتك أثناء استخدام التطبيق لتنسيق العمل الميداني.</span>
      <button onClick={dismiss} className="shrink-0 rounded-md px-2 py-0.5 font-bold hover:bg-primary/20">تمام</button>
    </div>
  );
}
