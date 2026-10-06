"use client";

/**
 * شريط الرسالة **الخاصة بمندوب واحد** — بيظهر في كل صفحات المندوب بالأحمر.
 *
 * الأدمن بيكتبها من صفحة المندوب، وبتفضل لحد ما **الأدمن** يشيلها. مفيش زر
 * إخفاء عند المندوب: دي رسالة موجّهة له بالذات (مش إعلان عام)، فإخفاؤها
 * بإيده كان هيلغي الغرض منها.
 *
 * غير `NoticeBanner` (البانر العام لكل المناديب) — ده بيقرا صفّ المندوب
 * نفسه، فمحدش غيره بيشوف الرسالة.
 *
 * 📣 وتحتها «الرسالة الخاصة لكل المناديب» (المالك ٦ أكتوبر ٢٠٢٦) — بنفس الشكل ومن غير زر إخفاء.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchAgentNotice, fetchAllAgentsNotice, type AgentNotice } from "@/lib/agentNotice";
import { BANNER_POLL_MS } from "@/lib/pollRate";

export default function AgentNoticeBanner() {
  const [notice, setNotice] = useState<AgentNotice | null>(null);
  const [allNotice, setAllNotice] = useState<AgentNotice | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [n, all] = await Promise.all([fetchAgentNotice(), fetchAllAgentsNotice()]);
      if (alive) { setNotice(n); setAllNotice(all); }
    };
    void load();
    // نفس إيقاع البانر العام — الأدمن ممكن يكتبها والمندوب فاتح البرنامج.
    const t = setInterval(() => void load(), BANNER_POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const shown = [notice, allNotice].filter((x): x is AgentNotice => !!x);
  if (!shown.length) return null;

  return (
    <>
      {shown.map((x, i) => (
        <div
          key={i}
          className="flex items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs font-bold text-danger"
          dir="rtl"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap leading-relaxed">{x.text}</span>
        </div>
      ))}
    </>
  );
}
