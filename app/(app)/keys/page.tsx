"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Mic, ChevronLeft, AudioLines } from "lucide-react";
import { getDeepgramKey } from "@/lib/deepgramKey";

const LS_GROQ_API_KEY = "ph:registration:groqApiKey";

// صفحة المفاتيح للكل — Deepgram و Groq بس (المفاتيح اللي المندوب بيدخلها بنفسه).
// باقي محركات الصوت (Speechmatics/Soniox/OpenAI) بيديرها الأدمن من صفحة المندوب.
export default function KeysPage() {
  const [groqSet, setGroqSet] = useState(false);
  const [deepgramSet, setDeepgramSet] = useState(false);

  useEffect(() => {
    try { setGroqSet(!!localStorage.getItem(LS_GROQ_API_KEY)); } catch { /* ignore */ }
    setDeepgramSet(!!getDeepgramKey());
  }, []);

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
