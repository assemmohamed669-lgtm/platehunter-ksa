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
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchAgentNotice, type AgentNotice } from "@/lib/agentNotice";
import { BANNER_POLL_MS } from "@/lib/pollRate";

export default function AgentNoticeBanner() {
  const [notice, setNotice] = useState<AgentNotice | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const n = await fetchAgentNotice();
      if (alive) setNotice(n);
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

  if (!notice) return null;

  return (
    <div
      className="flex items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs font-bold text-danger"
      dir="rtl"
      role="alert"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span className="whitespace-pre-wrap leading-relaxed">{notice.text}</span>
    </div>
  );
}
