"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// شاشة البداية: صورة سطحة حقيقية شايلة عربية، تدخل من على اليمين بهدوء
// وتقف في النص. تفضل ظاهرة 3 ثواني بالتمام قبل ما تدخل الرئيسية.
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
      .then(({ data }) => { dest = data.session ? "/dashboard" : "/login"; })
      .catch(() => {});
    const delay = new Promise<void>((r) => setTimeout(r, 3000));
    Promise.all([session, delay]).then(() => router.replace(dest));
  }, [router]);

  return (
    <main className="splash">
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tow-splash.jpg" alt="ونش سطحة شايل سيارة" />
        <span className="shine" />
      </div>
      <p className="brand">قنّاص اللوحات</p>
      <p className="loading">جاري التحميل…</p>

      <style jsx>{`
        .splash {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          min-height: 100dvh;
          background: var(--c-night);
          overflow: hidden;
          padding: 24px;
        }
        .card {
          position: relative;
          width: min(90vw, 460px);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
          animation: rollIn 1.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .card img {
          display: block;
          width: 100%;
          height: auto;
          animation: kenburns 4s ease-out both;
        }
        /* لمعة خفيفة بتعدّي على الصورة مرة واحدة */
        .shine {
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(
            100deg,
            transparent,
            rgba(255, 255, 255, 0.35),
            transparent
          );
          transform: skewX(-18deg);
          animation: sweep 1.4s ease-in 1.3s both;
        }
        .brand {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: var(--c-ink);
          animation: fadeUp 0.6s ease-out 0.9s both;
        }
        .loading {
          margin: 0;
          color: var(--c-muted);
          font-size: 14px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes rollIn {
          0% { transform: translateX(70%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes kenburns {
          0% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes sweep {
          0% { left: -60%; }
          100% { left: 130%; }
        }
        @keyframes fadeUp {
          0% { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .card, .card img, .shine, .brand, .loading { animation: none; }
          .card { transform: none; opacity: 1; }
        }
      `}</style>
    </main>
  );
}
