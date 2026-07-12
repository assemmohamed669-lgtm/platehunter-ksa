"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Orbitron } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

// خط تقني للاسم — يتحمّل ذاتياً مع البناء فيشتغل حتى بدون نت.
const brandFont = Orbitron({ subsets: ["latin"], weight: ["700", "900"] });

const WORD = "PlateHunter";

// شاشة البداية: فيديو السطحة، وتحته اسم PlateHunter بموشن حرف-حرف.
// تفضل ظاهرة ثانيتين قبل ما تدخل الرئيسية.
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) {
      router.replace("/auth/reset-password");
      return;
    }
    let dest = "/login";
    const session = supabase.auth
      .getSession()
      .then(({ data }) => { dest = data.session ? "/sorting" : "/login"; })
      .catch(() => {});
    const delay = new Promise<void>((r) => setTimeout(r, 2000));
    Promise.all([session, delay]).then(() => router.replace(dest));
  }, [router]);

  return (
    <main className="splash">
      <div className="card">
        <video
          src="/splash.mp4"
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          disablePictureInPicture
        />
      </div>

      <h1 dir="ltr" className={`brand ${brandFont.className}`} aria-label={WORD}>
        {WORD.split("").map((ch, i) => (
          <span key={i} style={{ animationDelay: `${0.6 + i * 0.06}s` }}>{ch}</span>
        ))}
      </h1>

      <p className="loading">جاري التحميل…</p>

      <style jsx>{`
        .splash {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          min-height: 100dvh;
          background: var(--c-night);
          overflow: hidden;
          padding: 24px;
        }
        .card {
          width: min(90vw, 460px);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
          animation: rollIn 1.1s cubic-bezier(0.22, 0.61, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .card video {
          display: block;
          width: 100%;
          height: auto;
        }
        .brand {
          margin: 0;
          display: flex;
          direction: ltr;
          gap: 0.02em;
          font-size: clamp(26px, 8vw, 40px);
          font-weight: 900;
          letter-spacing: 0.04em;
          color: var(--c-ink);
        }
        .brand :global(span) {
          display: inline-block;
          opacity: 0;
          transform: translateY(14px) scale(0.9);
          animation: letterIn 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
        }
        .loading {
          margin: 0;
          color: var(--c-muted);
          font-size: 14px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes rollIn {
          0% { transform: translateX(60%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes letterIn {
          0% { opacity: 0; transform: translateY(14px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .card, .brand :global(span), .loading { animation: none; }
          .card { transform: none; opacity: 1; }
          .brand :global(span) { opacity: 1; transform: none; }
        }
      `}</style>
    </main>
  );
}
