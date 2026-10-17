/**
 * ==========================================================================
 *  مؤشّر الصوت الحي (Audio Waveform)
 * ==========================================================================
 *  المندوب لازم يشوف بعينه إن الميك شغّال فعلاً وإن صوته واصل، مش
 *  يسجّل ٥ دقايق ويكتشف بعدها إن الميك كان مقفول.
 *
 *  بنرسم على canvas مش عناصر DOM — عشان الرسم يفضل ناعم بلا ما يتقّل
 *  المتصفح، حتى وإحنا بنستقبل بث مباشر في نفس الوقت.
 */

import { useEffect, useRef } from "react";

export interface WaveformProps {
  /** شكل الموجة الجاي من AnalyserNode (٠-٢٥٥، الوسط ١٢٨) */
  waveform: Uint8Array | null;
  /** مستوى الصوت ٠-١ */
  level: number;
  active: boolean;
  height?: number;
}

export default function Waveform({
  waveform,
  level,
  active,
  height = 84,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // نضبط الأبعاد على كثافة الشاشة عشان الرسم يطلع حاد مش مهبّب
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;

    // خط الوسط
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    if (!active || !waveform || waveform.length === 0) {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "12px Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(active ? "…" : "الميك متوقف", width / 2, mid + 4);
      return;
    }

    // أعمدة بعدد يناسب العرض
    const bars = Math.max(24, Math.min(120, Math.floor(width / 5)));
    const step = Math.floor(waveform.length / bars) || 1;
    const barWidth = width / bars;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(52,211,153,0.95)");
    gradient.addColorStop(0.5, "rgba(52,211,153,0.55)");
    gradient.addColorStop(1, "rgba(52,211,153,0.95)");
    ctx.fillStyle = gradient;

    for (let i = 0; i < bars; i++) {
      // أعلى قيمة في المجموعة — بتخلّي الحركة واضحة أكتر من المتوسط
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const sample = waveform[i * step + j];
        if (sample === undefined) break;
        const v = Math.abs(sample - 128) / 128;
        if (v > peak) peak = v;
      }
      const barHeight = Math.max(2, peak * (height - 8));
      const x = i * barWidth;
      ctx.fillRect(x + barWidth * 0.2, mid - barHeight / 2, barWidth * 0.6, barHeight);
    }
  }, [waveform, height, active, level]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <canvas ref={canvasRef} className="block w-full" style={{ height }} />

      {/* مؤشّر المستوى: بيوضّح لو الصوت واطي أو عالي زيادة */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${
              level > 0.92 ? "bg-red-400" : level > 0.06 ? "bg-emerald-400" : "bg-slate-500"
            }`}
            style={{ width: `${Math.min(100, level * 100)}%` }}
          />
        </div>
        <span className="ltr-nums shrink-0 text-[10px] text-slate-400">
          {Math.round(level * 100)}٪
        </span>
      </div>
    </div>
  );
}
