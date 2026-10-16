/**
 * ==========================================================================
 *  شارة اللوحة — بشكل اللوحة السعودية الحقيقية
 * ==========================================================================
 *  على اللوحة السعودية الأرقام على الشمال والحروف على اليمين.
 *  عرضها بنفس الترتيب بيخلّي المندوب يقارنها بعينه على السيارة فوراً
 *  بلا ما يعيد ترتيبها في دماغه.
 *
 *  ⚠️ الخانات **ثابتة العرض** — ودي مش تجميل.
 *  ─────────────────────────────────────────
 *  المندوب بيمسح قايمة لوحات بعينه من فوق لتحت. لو كل شارة عرضها بيتغيّر
 *  بحسب عرض حروفها (و«م» أعرض من «ا» بكتير)، الفاصل بيتزحزح كل سطر
 *  والعين بتضيع مكانها.
 *
 *  فكل حرف في خانة ثابتة، والأرقام بـ‎tabular-nums‎ وعرض ثابت — فالحروف
 *  تنزل تحت الحروف والأرقام تحت الأرقام زي الجدول، حتى وإحنا محافظين على
 *  شكل البطاقة (اللي فيها تفاصيل المطابقة والموقع والأزرار).
 */

import { displayLetter } from "../lib/plateAlphabet";

export type PlateBadgeSize = "sm" | "md" | "lg";

const SIZES: Record<
  PlateBadgeSize,
  {
    box: string;
    letter: string;
    digit: string;
    gap: string;
    /** عرض خانة الحرف الواحد — ثابت عشان الأعمدة تنتظم بين السطور */
    cell: string;
    /** عرض كتلة الأرقام الأربعة */
    digitBox: string;
  }
> = {
  sm: {
    box: "px-2 py-1", letter: "text-sm", digit: "text-sm", gap: "gap-1.5",
    cell: "w-[1.15em]", digitBox: "w-[3.6em]",
  },
  md: {
    box: "px-3 py-1.5", letter: "text-xl", digit: "text-xl", gap: "gap-2",
    cell: "w-[1.15em]", digitBox: "w-[3.6em]",
  },
  lg: {
    box: "px-4 py-2.5", letter: "text-3xl", digit: "text-3xl", gap: "gap-3",
    cell: "w-[1.15em]", digitBox: "w-[3.6em]",
  },
};

export interface PlateBadgeProps {
  letters: string[];
  digits: string;
  size?: PlateBadgeSize;
  /** لون التنبيه: مطلوبة (أحمر) / قريبة (أصفر) / عادية */
  tone?: "normal" | "wanted" | "near";
  className?: string;
}

export default function PlateBadge({
  letters,
  digits,
  size = "md",
  tone = "normal",
  className = "",
}: PlateBadgeProps) {
  const s = SIZES[size];

  const toneClasses =
    tone === "wanted"
      ? "border-red-400/70 bg-red-500/15 text-red-100"
      : tone === "near"
        ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
        : "border-white/20 bg-white/[0.07] text-slate-100";

  return (
    <span
      dir="ltr"
      className={`inline-flex items-center rounded-xl border font-bold tabular-nums ${s.box} ${s.gap} ${toneClasses} ${className}`}
    >
      {/* الأرقام — على الشمال زي اللوحة الحقيقية · عرض ثابت */}
      <span
        className={`${s.digit} ${s.digitBox} shrink-0 text-center tracking-widest`}
      >
        {digits || "—"}
      </span>

      <span className="h-5 w-px shrink-0 bg-current opacity-25" />

      {/**
       * الحروف — على اليمين · **تلات خانات دايماً**.
       *
       * ⚠️ اللوحة السعودية ٣ حروف بالضبط، فالخانة الفاضية معناها **حرف
       * ضايع** — وده اللي المندوب محتاج يشوفه. قبل كده «حه6895» كانت
       * تنضغط في خانتين فتبان لوحة عادية، والنقص يفوت بالعين.
       */}
      <span className={`${s.letter} flex shrink-0 ${s.gap}`} dir="rtl">
        {Array.from({ length: 3 }, (_, i) => {
          const ch = letters[i];
          return (
            <span key={i} className={`${s.cell} text-center`}>
              {ch ? (
                displayLetter(ch)
              ) : (
                <span className="opacity-30" title="حرف ضايع">
                  ·
                </span>
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}
