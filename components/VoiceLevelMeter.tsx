"use client";

/**
 * مؤشّر صوت «الصالة» — بديل الخمس أعمدة القديمة (شغّال/طافي على عتبات ثابتة).
 *
 * الفرق:
 *  - ١٦ عمود بشكل مرايا (الوسط أطول) بيتملوا **جزئياً** ⇒ حركة سلسة.
 *  - تنعيم سريع الصعود بطيء الهبوط ⇒ الكلام يبان فوراً والمؤشّر مايرفرفش.
 *  - علامة ذروة ذهبية بتنزل بالراحة ⇒ المندوب يشوف إن صوته وصل فعلاً.
 *
 * الرسم بيتم على الـDOM مباشرة جوّه `requestAnimationFrame` — **من غير
 * setState لكل إطار**، عشان صفحة التشييك ماتعملش re-render ٦٠ مرة في الثانية
 * وهي ماسكة جدول لوحات كبير.
 */
import { useEffect, useRef } from "react";
import { smoothLevel, meterBars, barHeightScale, peakHold } from "@/lib/voiceMeter";

const BARS = 16;

export default function VoiceLevelMeter({
  level,
  active,
}: {
  /** المستوى اللحظي ٠..١ من المحرك */
  level: number;
  /** بيسمع دلوقتي؟ (بيهدّي المؤشّر لما الميك واقف) */
  active?: boolean;
}) {
  const targetRef = useRef(0);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const peaksRef = useRef<(HTMLSpanElement | null)[]>([]);

  // الهدف بيتحدّث من الـprops من غير ما يشغّل رسم — الحلقة بتقراه.
  targetRef.current = active === false ? 0 : level;

  useEffect(() => {
    let raf = 0;
    let cur = 0;
    let peak = 0;

    const tick = () => {
      cur = smoothLevel(cur, targetRef.current);
      peak = peakHold(peak, cur);
      const fills = meterBars(cur, BARS);

      // علامة الذروة بتركب على العمود اللي الذروة وصلته، عند ارتفاعها بالظبط.
      const peakFills = meterBars(peak, BARS);
      const at = Math.min(BARS - 1, Math.max(0, Math.ceil(peak * BARS) - 1));

      for (let i = 0; i < BARS; i++) {
        const fill = barsRef.current[i];
        if (fill) fill.style.height = `${Math.round(fills[i] * 100)}%`;
        const dot = peaksRef.current[i];
        if (dot) {
          const show = i === at && peak > 0.04;
          dot.style.opacity = show ? "1" : "0";
          if (show) dot.style.bottom = `${Math.round(peakFills[i] * 100)}%`;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="luxe-meter" dir="ltr" aria-hidden title="مستوى الصوت">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className="luxe-bar"
          style={{ height: `${Math.round(barHeightScale(i, BARS) * 100)}%` }}
        >
          <span ref={(el) => { barsRef.current[i] = el; }} className="luxe-bar-fill" style={{ height: "0%" }} />
          <span ref={(el) => { peaksRef.current[i] = el; }} className="luxe-peak" style={{ opacity: 0, bottom: "0%" }} />
        </span>
      ))}
    </div>
  );
}
