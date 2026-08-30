"use client";

import { useEffect, useState } from "react";
import { BarChart3, X, Check } from "lucide-react";
import { fetchActivePoll, submitVote, type Poll } from "@/lib/polls";

/** كل قد إيه نسأل السيرفر عن استطلاع جديد (المندوب ممكن يفضل فاتح ساعات). */
const POLL_MS = 60_000;
/** مفتاح الاستطلاعات اللي المندوب قفلها بـ✕ (بيتمسح كل تسجيل دخول زي الإشعار). */
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
 * تحت رسالة الأدمن. المندوب يختار خياره ثم يضغط **تأكيد** — وبعد التأكيد صوته
 * **نهائي** والكارت **مايظهرلوش تاني أبداً** (عشان ماننزعجش الناس). لو المندوب
 * ماصوّتش، زر ✕ بيقفله للجلسة بس وبيرجع في أول تسجيل دخول عشان يفكّره يصوّت.
 */
export default function PollBanner() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [sel, setSel] = useState<number | null>(null);   // اختيار محلي قبل التأكيد
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);            // رسالة شكر قصيرة بعد التأكيد

  useEffect(() => {
    let alive = true;
    async function load() {
      const p = await fetchActivePoll();
      if (!alive) return;
      // بيظهر بس لو: فيه استطلاع نشط + المندوب **ماصوّتش** قبل كده + مقفلوش بـ✕.
      // لو صوّت خلاص (my_choice موجود) مايظهرش تاني نهائياً.
      if (!p || p.myChoice != null || isDismissed(p.id)) { setPoll(null); return; }
      setPoll(p);
    }
    void load();
    const t = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (thanks) {
    return (
      <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2.5 text-right">
        <Check size={16} className="shrink-0 text-primary" />
        <p className="text-xs font-bold text-ink">شكراً لمشاركتك — تم تسجيل صوتك.</p>
      </div>
    );
  }
  if (!poll) return null;

  async function confirm() {
    if (sel == null || busy || !poll) return;
    setBusy(true);
    const ok = await submitVote(poll.id, sel);
    setBusy(false);
    if (!ok) { alert("تعذّر تسجيل صوتك، حاول تاني."); return; }
    setThanks(true);
    setPoll(null);                                  // يختفي فوراً ومايرجعش (صوته اتسجّل)
    setTimeout(() => setThanks(false), 4000);
  }

  return (
    <div className="border-b border-primary/30 bg-primary/10 px-3 py-2.5 text-right">
      <div className="flex items-start gap-2">
        <BarChart3 size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-xs font-bold leading-relaxed text-ink">{poll.question}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {poll.options.map((opt, i) => {
              const picked = sel === i;
              return (
                <button
                  key={i}
                  onClick={() => setSel(i)}
                  disabled={busy}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    picked
                      ? "border-primary bg-primary text-night"
                      : "border-primary/25 bg-surface text-ink hover:border-primary/50"
                  } disabled:opacity-60`}
                >
                  <span className="flex-1 text-right">{opt}</span>
                  {picked && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">اختار إجابتك واضغط تأكيد — الصوت نهائي.</span>
            <button
              onClick={confirm}
              disabled={sel == null || busy}
              className={`shrink-0 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold text-night transition ${
                sel == null || busy ? "opacity-50" : ""
              }`}
            >
              {busy ? "..." : "تأكيد التصويت"}
            </button>
          </div>
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
