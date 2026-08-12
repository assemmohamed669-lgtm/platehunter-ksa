"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone, X, MessageCircle, AlertTriangle } from "lucide-react";
import {
  fetchAppNotice, noticeKey, isNoticeDismissed, dismissNotice, adminWhatsappLink, type AppNotice,
} from "@/lib/appNotice";
import { startNoticeSiren, stopNoticeSiren } from "@/lib/noticeSiren";
import { isMicBusy, onMicBusyChange } from "@/lib/micBusy";

/** كل قد إيه نسأل السيرفر عن رسالة جديدة (المندوب ممكن يفضل فاتح ساعات). */
const POLL_MS = 60_000;

/**
 * شريط رسالة الأدمن — بيظهر في **كل صفحات المندوب** (متركّب في شِلّ التطبيق).
 *
 * الأدمن بيكتبها من لوحة الأدمن ويحدد مدتها. بتختفي لوحدها لما المدة تخلص أو
 * لما الأدمن يشيلها. زر ✕ بيقفلها للجلسة الحالية بس — بترجع تظهر في أول
 * تسجيل دخول جديد طول ما هي سارية.
 *
 * **الرسالة العاجلة**: بتطلع بالأحمر ومعاها صفّارة بتفضل رنّانة لحد ما المندوب
 * يقفلها. الصفّارة:
 *   • بترنّ **مرة واحدة لكل رسالة** — مش كل نبضة تحديث ولا كل ما يفتح صفحة.
 *   • **مستقلة** عن إنذار السيارة المطلوبة — مابتقطعوش أبداً.
 *   • بتتأجّل لو الميك مفتوح (تشييك صوتي) عشان ماتدخلش في التسجيل، وبتشتغل
 *     أول ما يقفل التسجيل. البانر الأحمر بيفضل ظاهر طول الوقت.
 */
export default function NoticeBanner() {
  const [notice, setNotice] = useState<AppNotice | null>(null);
  /** مفتاح الرسالة اللي رنّينا لها — يمنع تكرار الصفّارة لنفس الرسالة. */
  const rangForRef = useRef<string | null>(null);
  /** الرسالة اللي مستنيين الميك يفضى عشان نرنّ لها. */
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const n = await fetchAppNotice();
      if (!alive) return;
      // اتشالت من الأدمن أو خلصت مدتها → تختفي والصفّارة تسكت
      if (!n) { setNotice(null); pendingRef.current = null; stopNoticeSiren(); return; }
      if (isNoticeDismissed(noticeKey(n))) { setNotice(null); return; }
      setNotice(n);
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
      stopNoticeSiren();   // الخروج من التطبيق مايسيبش صفّارة شغّالة
    };
  }, []);

  // صفّارة الرسالة العاجلة — مرة واحدة لكل رسالة، وبتستنى الميك لو مشغول.
  useEffect(() => {
    if (!notice || !notice.urgent) return;
    const key = noticeKey(notice);
    if (rangForRef.current === key) return;   // رنّينا لها خلاص

    const ring = () => {
      rangForRef.current = key;
      pendingRef.current = null;
      startNoticeSiren();
    };

    if (!isMicBusy()) { ring(); return; }

    // الميك مفتوح (تشييك صوتي) — نأجّل لحد ما يقفل.
    pendingRef.current = key;
    return onMicBusyChange((busy) => {
      if (!busy && pendingRef.current === key) ring();
    });
  }, [notice]);

  if (!notice) return null;

  const urgent = notice.urgent;
  const wrap = urgent
    ? "border-danger/50 bg-danger/15"
    : "border-primary/30 bg-primary/10";

  return (
    <div className={`flex items-start gap-2 border-b px-3 py-2 text-right ${wrap}`}>
      {urgent
        ? <AlertTriangle size={16} className="mt-0.5 shrink-0 animate-pulse text-danger" />
        : <Megaphone size={16} className="mt-0.5 shrink-0 text-primary" />}
      <div className="flex-1">
        <p className={`whitespace-pre-wrap text-xs leading-relaxed ${urgent ? "font-bold text-danger" : "text-ink"}`}>
          {notice.text}
        </p>
        {/* زر تواصل — بيظهر بس لو الأدمن علّم عليه وقت النشر */}
        {notice.wa && (
          <a
            href={adminWhatsappLink(notice.text)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-green-700"
          >
            <MessageCircle size={12} /> تواصل معانا
          </a>
        )}
      </div>
      <button
        onClick={() => {
          stopNoticeSiren();               // ✕ بتسكّت الصفّارة كمان
          pendingRef.current = null;
          dismissNotice(noticeKey(notice));
          setNotice(null);
        }}
        className={`shrink-0 rounded p-0.5 transition ${urgent ? "text-danger hover:text-ink" : "text-muted hover:text-ink"}`}
        title="إخفاء"
      >
        <X size={14} />
      </button>
    </div>
  );
}
