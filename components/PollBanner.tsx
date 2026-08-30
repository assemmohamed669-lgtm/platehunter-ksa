"use client";

import { useEffect, useState } from "react";
import { BarChart3, X, Check } from "lucide-react";
import { fetchActivePoll, submitVote, type Poll } from "@/lib/polls";

/** كل قد إيه نسأل السيرفر عن استطلاع جديد (المندوب ممكن يفضل فاتح ساعات). */
const POLL_MS = 60_000;
/** مفتاح الاستطلاعات اللي المندوب قفلها (بيتمسح كل تسجيل دخول زي الإشعار). */
const DISMISS_KEY = "ph:pollDismissed";

function isDismissed(id: string): boolean {
  try { return (JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]") as string[]).includes(id); }
  catch { return false; }
}
function dismiss(id: string): void {
  try {
    const arr = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]") as string[];
    if (!arr.includes(id)) arr.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(arr));
  } catch { /* storage unavailable */ }
}

/**
 * كارت استطلاع الرأي — بيظهر في **كل صفحات المندوب** (متركّب في شِلّ التطبيق)
 * تحت رسالة الأدمن. الأدمن بينشره من لوحة الأدمن. المندوب يختار خيار واحد
 * بضغطة، ويقدر يغيّره طول ما الاستطلاع نشط. زر ✕ بيقفله للجلسة — بيرجع في
 * أول تسجيل دخول جديد طول ما هو نشط.
 */
export default function PollBanner() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const p = await fetchActivePoll();
      if (!alive) return;
      if (!p || isDismissed(p.id)) { setPoll(null); return; }
      // مانكسحش اختيار المندوب المحلي لو الـpoll نفسه ماتغيّرش
      setPoll((prev) => (prev && prev.id === p.id ? { ...p, myChoice: prev.myChoice ?? p.myChoice } : p));
    }
    void load();
    const t = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!poll) return null;

  async function vote(idx: number) {
    if (!poll || busy || poll.myChoice === idx) return;
    setBusy(true);
    const prev = poll.myChoice;
    setPoll({ ...poll, myChoice: idx });          // تفاؤلي — استجابة فورية
    const ok = await submitVote(poll.id, idx);
    if (!ok) setPoll((p) => (p ? { ...p, myChoice: prev } : p));  // رجّع لو فشل
    setBusy(false);
  }

  const voted = poll.myChoice != null;

  return (
    <div className="border-b border-primary/30 bg-primary/10 px-3 py-2.5 text-right">
      <div className="flex items-start gap-2">
        <BarChart3 size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-xs font-bold leading-relaxed text-ink">{poll.question}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {poll.options.map((opt, i) => {
              const mine = poll.myChoice === i;
              return (
                <button
                  key={i}
                  onClick={() => vote(i)}
                  disabled={busy}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    mine
                      ? "border-primary bg-primary text-night"
                      : "border-primary/25 bg-surface text-ink hover:border-primary/50"
                  } disabled:opacity-60`}
                >
                  <span className="flex-1 text-right">{opt}</span>
                  {mine && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
          {voted && <p className="mt-1.5 text-[11px] text-muted">تم تسجيل صوتك — تقدر تغيّره في أي وقت.</p>}
        </div>
        <button
          onClick={() => { dismiss(poll.id); setPoll(null); }}
          className="shrink-0 rounded p-0.5 text-muted transition hover:text-ink"
          title="إخفاء"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
