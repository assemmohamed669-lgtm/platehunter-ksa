"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import {
  fetchAppNotice, noticeKey, isNoticeDismissed, dismissNotice, type AppNotice,
} from "@/lib/appNotice";

/** كل قد إيه نسأل السيرفر عن رسالة جديدة (المندوب ممكن يفضل فاتح ساعات). */
const POLL_MS = 60_000;

/**
 * شريط رسالة الأدمن — بيظهر في **كل صفحات المندوب** (متركّب في شِلّ التطبيق).
 *
 * الأدمن بيكتبها من لوحة الأدمن ويحدد مدتها. بتختفي لوحدها لما المدة تخلص أو
 * لما الأدمن يشيلها. زر ✕ بيقفلها للجلسة الحالية بس — بترجع تظهر في أول
 * تسجيل دخول جديد طول ما هي سارية.
 */
export default function NoticeBanner() {
  const [notice, setNotice] = useState<AppNotice | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const n = await fetchAppNotice();
      if (!alive) return;
      // اتشالت من الأدمن أو خلصت مدتها → تختفي من غير ما المندوب يعمل حاجة
      if (!n) { setNotice(null); return; }
      setNotice(isNoticeDismissed(noticeKey(n)) ? null : n);
    }

    void load();
    const t = setInterval(load, POLL_MS);
    // لما المندوب يرجع للتطبيق بعد ما كان في الخلفية — نسأل على طول
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!notice) return null;

  return (
    <div className="flex items-start gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2 text-right">
      <Megaphone size={16} className="mt-0.5 shrink-0 text-primary" />
      <p className="flex-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">{notice.text}</p>
      <button
        onClick={() => { dismissNotice(noticeKey(notice)); setNotice(null); }}
        className="shrink-0 rounded p-0.5 text-muted transition hover:text-ink"
        title="إخفاء"
      >
        <X size={14} />
      </button>
    </div>
  );
}
