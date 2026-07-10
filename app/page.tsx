"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// شاشة البداية: ونش سطحة شايل عربية، بيدخل من على اليمين بهدوء ويقف في النص.
// الشاشة تفضل ظاهرة 3 ثواني بالتمام قبل ما تدخل الرئيسية.
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
      <div className="scene">
        <div className="rig">
          <svg className="truck" viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <linearGradient id="cab" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3ee08c" />
                <stop offset="1" stopColor="#15935a" />
              </linearGradient>
              <linearGradient id="carbody" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e9eef2" />
                <stop offset="1" stopColor="#b7c2cb" />
              </linearGradient>
            </defs>

            {/* chassis + flatbed */}
            <rect x="40" y="98" width="298" height="11" rx="4" fill="#263238" />
            <path d="M96 88 L338 88 L352 99 L96 99 Z" fill="#37474f" />
            <path d="M338 88 L352 99 L338 99 Z" fill="#546e7a" />

            {/* car being carried (facing left, silver) */}
            <g>
              <path
                d="M150 88 Q152 66 178 64 L200 51 Q209 46 224 46 L268 46 Q287 46 298 62 L312 67 Q322 70 322 80 L322 88 Z"
                fill="url(#carbody)"
              />
              <path d="M186 60 L202 50 L224 50 L224 63 L186 63 Z" fill="#25323b" opacity="0.85" />
              <path d="M230 50 L262 50 Q280 50 290 62 L230 63 Z" fill="#25323b" opacity="0.85" />
              <g className="wheel"><circle cx="184" cy="88" r="12" fill="#111" /><circle cx="184" cy="88" r="4.5" fill="#3a4a42" /></g>
              <g className="wheel"><circle cx="294" cy="88" r="12" fill="#111" /><circle cx="294" cy="88" r="4.5" fill="#3a4a42" /></g>
            </g>

            {/* cab (facing left, green) */}
            <path
              d="M18 98 L18 58 Q18 49 28 49 L60 49 L76 36 L90 36 Q98 36 98 46 L98 98 Z"
              fill="url(#cab)"
            />
            <path d="M60 51 L75 40 L88 40 Q90 40 90 47 L90 58 L60 58 Z" fill="#0c2119" opacity="0.9" />
            <rect x="18" y="80" width="7" height="12" rx="2" fill="#fff3c4" />
            <rect x="98" y="70" width="20" height="6" rx="3" fill="#f2b705" />

            {/* wheels on the ground */}
            <g className="wheel"><circle cx="52" cy="116" r="16" fill="#0b0f0d" /><circle cx="52" cy="116" r="6.5" fill="#3a4a42" /><rect x="50" y="102" width="4" height="28" rx="2" fill="#55655b" /><rect x="38" y="114" width="28" height="4" rx="2" fill="#55655b" /></g>
            <g className="wheel"><circle cx="120" cy="116" r="16" fill="#0b0f0d" /><circle cx="120" cy="116" r="6.5" fill="#3a4a42" /><rect x="118" y="102" width="4" height="28" rx="2" fill="#55655b" /><rect x="106" y="114" width="28" height="4" rx="2" fill="#55655b" /></g>
            <g className="wheel"><circle cx="150" cy="116" r="16" fill="#0b0f0d" /><circle cx="150" cy="116" r="6.5" fill="#3a4a42" /><rect x="148" y="102" width="4" height="28" rx="2" fill="#55655b" /><rect x="136" y="114" width="28" height="4" rx="2" fill="#55655b" /></g>
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
          gap: 26px;
          min-height: 100dvh;
          background: var(--c-night);
          overflow: hidden;
        }
        .scene {
          position: relative;
          width: min(90vw, 460px);
          height: 170px;
        }
        .rig {
          position: absolute;
          top: 8px;
          left: 0;
          width: 100%;
          animation: driveIn 2.2s cubic-bezier(0.22, 0.61, 0.36, 1) both;
          will-change: transform;
        }
        .truck {
          width: 100%;
          height: auto;
          filter: drop-shadow(0 10px 12px rgba(21, 147, 90, 0.22));
        }
        .wheel {
          transform-box: fill-box;
          transform-origin: center;
          animation: spin 0.55s linear infinite;
          animation-play-state: running;
        }
        .road {
          position: absolute;
          left: -8%;
          bottom: 6px;
          width: 116%;
          height: 3px;
          background: repeating-linear-gradient(
            90deg,
            var(--c-border, #cdd8d2) 0 26px,
            transparent 26px 46px
          );
          animation: dash 0.55s linear infinite;
        }
        .loading {
          color: var(--c-muted);
          font-size: 14px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes driveIn {
          0% { transform: translateX(112%); }
          100% { transform: translateX(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dash { to { background-position-x: -46px; } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .rig, .wheel, .road, .loading { animation: none; }
          .rig { transform: none; }
        }
      `}</style>
    </main>
  );
}
