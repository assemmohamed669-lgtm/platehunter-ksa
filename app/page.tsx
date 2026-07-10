"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PlateBadge from "@/components/PlateBadge";

// شاشة البداية: عربية سريعة تدخل من على اليمين جايبة اللوحة ورَاها، وتقف في
// النص. الشاشة تفضل ظاهرة 3 ثواني بالتمام قبل ما تدخل الرئيسية.
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
    // انتظر أطول مدة من الاتنين: فحص الجلسة، أو 3 ثواني كاملة للأنيميشن.
    const delay = new Promise<void>((r) => setTimeout(r, 3000));
    Promise.all([session, delay]).then(() => router.replace(dest));
  }, [router]);

  return (
    <main className="splash">
      <div className="scene">
        {/* خطوط السرعة */}
        <span className="speed s1" />
        <span className="speed s2" />
        <span className="speed s3" />

        <div className="convoy">
          {/* اللوحة المسحوبة ورا العربية */}
          <div className="cargo">
            <PlateBadge value="قنص1234" size="sm" />
          </div>
          <span className="rope" />
          {/* العربية (بتبص للشمال — اتجاه الحركة) */}
          <svg className="car" viewBox="0 0 220 110" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#38e08a" />
                <stop offset="1" stopColor="#17a862" />
              </linearGradient>
            </defs>
            {/* جسم العربية */}
            <path
              d="M10 74 Q14 52 40 50 L70 34 Q84 26 104 26 L150 26 Q170 26 182 42 L200 52 Q212 56 212 68 L212 76 Q212 82 204 82 L18 82 Q10 82 10 74 Z"
              fill="url(#body)"
            />
            {/* الشبابيك */}
            <path d="M78 40 L98 32 L128 32 L128 46 Z" fill="#0c1b14" opacity="0.85" />
            <path d="M136 32 L152 32 Q166 32 174 44 L136 46 Z" fill="#0c1b14" opacity="0.85" />
            {/* شعاع أمامي */}
            <circle cx="16" cy="64" r="4" fill="#eafff4" />
            {/* عجلات */}
            <g className="wheel">
              <circle cx="58" cy="84" r="17" fill="#0b0f0d" />
              <circle cx="58" cy="84" r="7" fill="#2b3a33" />
              <rect x="56" y="70" width="4" height="28" rx="2" fill="#48594f" />
              <rect x="44" y="82" width="28" height="4" rx="2" fill="#48594f" />
            </g>
            <g className="wheel">
              <circle cx="166" cy="84" r="17" fill="#0b0f0d" />
              <circle cx="166" cy="84" r="7" fill="#2b3a33" />
              <rect x="164" y="70" width="4" height="28" rx="2" fill="#48594f" />
              <rect x="152" y="82" width="28" height="4" rx="2" fill="#48594f" />
            </g>
          </svg>
        </div>

        <div className="road" />
      </div>

      <p className="loading">جاري التحميل…</p>

      <style jsx>{`
        .splash {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          min-height: 100dvh;
          background: var(--c-night, #0a0f0d);
          overflow: hidden;
        }
        .scene {
          position: relative;
          width: min(92vw, 520px);
          height: 200px;
        }
        .convoy {
          position: absolute;
          top: 46px;
          left: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: driveIn 1.5s cubic-bezier(0.16, 0.9, 0.28, 1) both;
          will-change: transform;
        }
        .car {
          width: 168px;
          height: auto;
          filter: drop-shadow(0 10px 14px rgba(56, 224, 138, 0.28));
        }
        .cargo {
          animation: platePop 0.6s ease-out 1.35s both;
          transform-origin: center;
        }
        .rope {
          width: 26px;
          height: 3px;
          border-radius: 2px;
          background: linear-gradient(90deg, transparent, #48594f);
        }
        .wheel {
          transform-box: fill-box;
          transform-origin: center;
          animation: spin 0.35s linear infinite;
        }
        .road {
          position: absolute;
          left: -10%;
          bottom: 34px;
          width: 120%;
          height: 3px;
          background: repeating-linear-gradient(
            90deg,
            #2b3a33 0 26px,
            transparent 26px 46px
          );
          animation: dash 0.35s linear infinite;
        }
        .speed {
          position: absolute;
          height: 3px;
          border-radius: 3px;
          background: linear-gradient(90deg, rgba(56, 224, 138, 0.65), transparent);
          animation: whoosh 0.6s ease-in infinite;
        }
        .s1 { top: 66px; width: 90px; animation-delay: 0s; }
        .s2 { top: 92px; width: 130px; animation-delay: 0.12s; }
        .s3 { top: 118px; width: 70px; animation-delay: 0.22s; }
        .loading {
          color: var(--c-muted, #8aa89b);
          font-size: 14px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes driveIn {
          0% { transform: translateX(115%); }
          70% { transform: translateX(-4%); }
          85% { transform: translateX(2%); }
          100% { transform: translateX(0); }
        }
        @keyframes platePop {
          0% { transform: scale(0.6); opacity: 0.2; }
          60% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dash { to { background-position-x: -46px; } }
        @keyframes whoosh {
          0% { transform: translateX(60%); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: translateX(-140%); opacity: 0; }
        }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .convoy, .cargo, .wheel, .road, .speed, .loading { animation: none; }
          .convoy { transform: none; }
        }
      `}</style>
    </main>
  );
}
