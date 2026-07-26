"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Mic, ChevronLeft, AudioLines, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { getDeepgramKey, testDeepgramKey } from "@/lib/deepgramKey";
import { supabase } from "@/lib/supabaseClient";
import { fetchSharedDeepgramKey, setSharedDeepgramKey } from "@/lib/sharedVoiceKey";

const LS_GROQ_API_KEY = "ph:registration:groqApiKey";

// صفحة المفاتيح للكل — Deepgram و Groq بس (المفاتيح اللي المندوب بيدخلها بنفسه).
// باقي محركات الصوت (Speechmatics/ElevenLabs) بيديرها الأدمن من صفحة المندوب.
export default function KeysPage() {
  const [groqSet, setGroqSet] = useState(false);
  const [deepgramSet, setDeepgramSet] = useState(false);
  // المفتاح المشترك (سوبر أدمن فقط)
  const [isSuper, setIsSuper] = useState(false);
  const [sharedInput, setSharedInput] = useState("");
  const [sharedSet, setSharedSet] = useState(false);
  const [savingShared, setSavingShared] = useState(false);
  const [sharedMsg, setSharedMsg] = useState<string | null>(null);
  // فحص اتصال المفتاح المشترك: مفعّل (شغّال) / غير مفعّل (رصيد خلص أو مفتاح غلط).
  const [sharedKeyVal, setSharedKeyVal] = useState("");
  const [sharedStatus, setSharedStatus] = useState<"unknown" | "checking" | "ok" | "dead">("unknown");

  async function checkShared(k: string) {
    if (!k) { setSharedStatus("unknown"); return; }
    setSharedStatus("checking");
    const ok = await testDeepgramKey(k);
    setSharedStatus(ok ? "ok" : "dead");
  }

  useEffect(() => {
    try { setGroqSet(!!localStorage.getItem(LS_GROQ_API_KEY)); } catch { /* ignore */ }
    setDeepgramSet(!!getDeepgramKey());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        const su = !!prof?.is_super;
        setIsSuper(su);
        if (su) {
          const k = (await fetchSharedDeepgramKey()) || "";
          setSharedKeyVal(k);
          setSharedSet(!!k);
          void checkShared(k); // افحص المفتاح فوراً عشان نعرف شغّال ولا وقف
        }
      } catch { /* غير متاح */ }
    })();
  }, []);

  async function saveShared() {
    setSavingShared(true); setSharedMsg(null);
    const r = await setSharedDeepgramKey(sharedInput.trim());
    setSavingShared(false);
    if (r.ok) {
      const saved = sharedInput.trim();
      setSharedKeyVal(saved);
      setSharedSet(!!saved);
      setSharedMsg("تم الحفظ — كل المناديب هياخدوه تلقائياً أول ما يفتحوا التطبيق.");
      setSharedInput("");
      void checkShared(saved); // افحص المفتاح الجديد فوراً
    } else {
      setSharedMsg(r.error === "NOT_ADMIN" ? "الصلاحية للأدمن فقط." : (r.error || "تعذّر الحفظ. تأكد إنك شغّلت خطوة SQL."));
    }
  }

  const cards = [
    {
      href: "/keys/deepgram",
      icon: AudioLines,
      title: "مفتاح Deepgram",
      desc: "تفريغ صوتي لحظي دقيق (تشييك صوت والتسجيل)",
      set: deepgramSet,
    },
    {
      href: "/keys/groq",
      icon: Mic,
      title: "مفتاح Groq",
      desc: "لدقّة التفريغ الصوتي وقراءة الكاميرا",
      set: groqSet,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyRound size={20} className="text-alert" />
        <div>
          <h1 className="text-lg font-bold text-ink">المفاتيح</h1>
          <p className="text-xs text-muted">مفاتيح الخدمات — كل واحد على حسابك أنت.</p>
        </div>
      </div>

      {isSuper && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-alert/40 bg-surface p-4">
          <div className="flex items-center gap-2">
            <AudioLines size={18} className="text-alert" />
            <span className="text-sm font-bold text-ink">مفتاح Deepgram مشترك (لكل المناديب)</span>
            {sharedSet && (
              sharedStatus === "checking"
                ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">جارٍ الفحص...</span>
                : sharedStatus === "dead"
                ? <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">غير مفعّل</span>
                : <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            سوبر أدمن فقط. تحطّه مرة واحدة ويتطبّق على كل المناديب تلقائياً أول ما يفتحوا التطبيق — من غير ما كل واحد يدخّله.
          </p>
          <input
            type="text" dir="ltr" value={sharedInput} onChange={(e) => setSharedInput(e.target.value)}
            placeholder={sharedSet ? "مفتاح محفوظ — اكتب مفتاح جديد للتغيير" : "الصق مفتاح Deepgram هنا"}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={saveShared} disabled={savingShared || !sharedInput.trim()}
            className="rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition active:scale-[0.99] disabled:opacity-50"
          >
            {savingShared ? "جارٍ الحفظ..." : "حفظ المفتاح المشترك"}
          </button>
          {sharedMsg && <p className="text-xs text-muted">{sharedMsg}</p>}

          {/* فحص اتصال المفتاح المشترك — يظهر بس لما فيه مفتاح محفوظ */}
          {sharedSet && (
            <button
              onClick={() => checkShared(sharedKeyVal)} disabled={sharedStatus === "checking"}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2 text-xs font-bold text-muted transition hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {sharedStatus === "checking" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {sharedStatus === "checking" ? "جارٍ فحص المفتاح..." : "افحص المفتاح"}
            </button>
          )}

          {/* رسالة لما المفتاح يبقى «غير مفعّل» (رصيد خلص / مفتاح غلط) */}
          {sharedSet && sharedStatus === "dead" && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 p-2.5 text-[11px] leading-relaxed text-danger" dir="rtl">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                <b>المفتاح المشترك مش شغّال.</b> تأكد من رصيد مفتاح ديبجرام (أو إنه مفتاح صحيح) — كل المناديب بيستخدموه، فالتفريغ الصوتي هيرجع للمحرك الأقل دقة.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {cards.map(({ href, icon: Icon, title, desc, set }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/50 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">{title}</span>
                {set && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>}
              </div>
              <p className="truncate text-xs text-muted">{desc}</p>
            </div>
            <ChevronLeft size={18} className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
