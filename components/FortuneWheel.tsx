"use client";

/**
 * 🎡 عجلة الحظ للمناديب — بيلفّها المندوب فيكسب أيام إضافية لاشتراكه.
 *
 * **السيرفر هو اللي بيقرّر** النتيجة ويضيف الأيام — المتصفّح مايقدرش يغش،
 * والعجلة بتوقف على القيمة اللي رجعت منه. ومابتشتغلش أصلاً إلا لو الأدمن فعّل
 * لفّة للمندوب ده (`docs/sql/wheel-of-fortune-v2.sql`).
 */
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { daysWord } from "@/lib/wheel";

// ١٢ خانة: كل قيمة (١/٢/٣/٤) بتتكرّر ٣ مرات.
const VALUES = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
const SEG = 360 / VALUES.length; // 30°

// لون لكل قيمة — عصري، والـ٤ (الأندر) دهبي كإنه الجائزة الكبرى.
const COLOR: Record<number, string> = { 1: "#14B8A6", 2: "#6366F1", 3: "#F59E0B", 4: "#D4AF37" };

// نقطة على الدايرة بزاوية (بالدرجات من فوق، مع عقارب الساعة).
function pt(angle: number, radius: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [100 + radius * Math.sin(a), 100 - radius * Math.cos(a)];
}

export default function FortuneWheel({ onWon }: { onWon?: (days: number) => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [err, setErr] = useState("");
  const rotRef = useRef(0);
  const pendingDaysRef = useRef(1);

  // بيلفّ العجلة ويوقفها على خانة قيمتها = days (تحت المؤشّر فوق).
  function animateTo(days: number) {
    pendingDaysRef.current = days;
    const idxs = VALUES.map((v, i) => (v === days ? i : -1)).filter((i) => i >= 0);
    const k = idxs[Math.floor(Math.random() * idxs.length)];
    const mid = k * SEG + SEG / 2;
    const base = rotRef.current;
    const target = base + 360 * 5 + (((360 - mid - (base % 360)) % 360) + 360) % 360;
    rotRef.current = target;
    setRotation(target);
  }

  async function spin() {
    if (spinning) return;
    setResult(null); setConfetti(false); setErr(""); setSpinning(true);
    // السيرفر بيقرّر النتيجة ويضيف الأيام — العجلة بتوقف على اللي رجّعه.
    try {
      const { data, error } = await supabase.rpc("spin_wheel");
      const res = (data ?? {}) as { days?: number; applied_to?: string; error?: string };
      if (res.error === "not-granted") {
        setSpinning(false);
        setErr("مفيش لفّة مفعّلة دلوقتي — كلّم الإدارة.");
        return;
      }
      if (error || res.error || !res.days) { setSpinning(false); setErr("تعذّر اللف — حاول تاني"); return; }
      animateTo(res.days);
      onWon?.(res.days);
    } catch {
      setSpinning(false); setErr("تعذّر اللف — تأكّد من النت وحاول تاني");
    }
  }

  function onSpinEnd() {
    if (!spinning) return;
    setSpinning(false);
    setResult(pendingDaysRef.current);
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3500);
  }

  const pointerColor = "#0A2547";

  return (
    <div className="flex flex-col items-center gap-5" dir="rtl">
      <style>{`
        @keyframes pk-confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9; }
        }
        @keyframes pk-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* العجلة + المؤشّر */}
      <div className="relative" style={{ width: "min(82vw, 340px)", height: "min(82vw, 340px)" }}>
        {/* المؤشّر فوق */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: -6, width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: `26px solid ${pointerColor}`, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.3))" }}
        />
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4.4s cubic-bezier(0.17, 0.67, 0.18, 0.99)" : "none",
            filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.25))",
          }}
          onTransitionEnd={onSpinEnd}
        >
          <circle cx="100" cy="100" r="99" fill="#0A2547" />
          {VALUES.map((v, i) => {
            const a0 = i * SEG;
            const a1 = (i + 1) * SEG;
            const [x0, y0] = pt(a0, 95);
            const [x1, y1] = pt(a1, 95);
            const [lx, ly] = pt(a0 + SEG / 2, 62);
            return (
              <g key={i}>
                <path d={`M100,100 L${x0.toFixed(2)},${y0.toFixed(2)} A95,95 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`} fill={COLOR[v]} stroke="#0A2547" strokeWidth="1.2" />
                <text
                  x={lx.toFixed(2)}
                  y={ly.toFixed(2)}
                  fill="#fff"
                  fontSize="14"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${a0 + SEG / 2}, ${lx.toFixed(2)}, ${ly.toFixed(2)})`}
                >
                  {v}
                </text>
              </g>
            );
          })}
          {/* منتصف العجلة */}
          <circle cx="100" cy="100" r="17" fill="#fff" stroke="#0A2547" strokeWidth="3" />
          <text x="100" y="100" fill="#0A2547" fontSize="10" fontWeight="800" textAnchor="middle" dominantBaseline="central">لُفّ</text>
        </svg>
      </div>

      <button
        onClick={spin}
        disabled={spinning}
        className="rounded-2xl bg-brand px-10 py-3.5 text-base font-black text-night shadow-lg transition active:scale-95 disabled:opacity-60"
      >
        {spinning ? "بتلفّ…" : "لُفّ العجلة 🎡"}
      </button>

      {err && <p className="text-xs font-bold text-danger">{err}</p>}

      {/* نتيجة + مبروك */}
      {result != null && !spinning && (
        <div
          className="mt-1 w-full max-w-sm rounded-2xl border-2 border-brand/50 bg-brand/10 p-5 text-center"
          style={{ animation: "pk-pop 0.5s ease-out" }}
        >
          <p className="text-3xl">🎉🎊</p>
          <p className="mt-1 text-lg font-black text-brand">مبروك!</p>
          <p className="mt-1 text-sm font-bold text-ink">تم إضافة {daysWord(result)} لاشتراكك</p>
          <p className="mt-1 text-xs text-muted">شكراً لك 💚</p>
        </div>
      )}

      {/* كونفيتي */}
      {confetti && (
        <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => {
            const colors = ["#14B8A6", "#6366F1", "#F59E0B", "#D4AF37", "#E11D48", "#22C55E"];
            const left = Math.random() * 100;
            const delay = Math.random() * 0.8;
            const dur = 2.2 + Math.random() * 1.6;
            const size = 6 + Math.random() * 8;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: -20,
                  left: `${left}vw`,
                  width: size,
                  height: size * 0.6,
                  background: colors[i % colors.length],
                  borderRadius: 2,
                  animation: `pk-confetti-fall ${dur}s linear ${delay}s forwards`,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
