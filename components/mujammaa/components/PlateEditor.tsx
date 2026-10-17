/**
 * ==========================================================================
 *  التعديل السريع — بنقرة واحدة على أي حرف أو رقم
 * ==========================================================================
 *  لما المحرك يغلط، المندوب مش المفروض يكتب اللوحة من الأول. المفروض
 *  يضغط على الحرف الغلط ويختار الصح — ضغطة واحدة وخلاص.
 *
 *  وعشان الاختيار يكون أسرع، قائمة الحروف فيها الـ١٧ حرف بس — مستحيل
 *  يختار حرف غلط من الأساس.
 */

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Wand2 } from "lucide-react";
import { KSA_PLATE_LETTERS, displayLetter } from "../lib/plateAlphabet";
import type { ReviewedPlate } from "../lib/plateReview";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface PlateEditorProps {
  review: ReviewedPlate;
  onChange: (next: { letters?: string[]; digits?: string }) => void;
  onClose?: () => void;
}

export default function PlateEditor({ review, onChange, onClose }: PlateEditorProps) {
  // نسخة محلية عشان المندوب يعدّل أكتر من خانة قبل ما يأكّد
  const [letters, setLetters] = useState<string[]>(() => padLetters(review.letters));
  const [digits, setDigits] = useState<string>(() => review.digits.padEnd(4, " ").slice(0, 4));
  const [picker, setPicker] = useState<
    { kind: "letter" | "digit"; index: number } | null
  >(null);

  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * لو اللوحة اتغيّرت من تحتنا (المراجعة الصوتية صحّحتها وإحنا فاتحين
   * المحرّر) لازم نجدّد النسخة المحلية.
   *
   * بلا ده كان بيحصل الآتي: تفتح المحرّر على بطاقة ثقتها واطية، بعد ثانية
   * المراجعة تصلّح حرف، تضغط إنت على رقم → المحرّر يكتب الحروف **القديمة**
   * فيمحي التصحيح ويعلّمها «معدّلة يدوياً» فما تتراجعش تاني.
   */
  const syncedFrom = useRef(review.plate);
  useEffect(() => {
    if (syncedFrom.current === review.plate) return;
    syncedFrom.current = review.plate;
    setLetters(padLetters(review.letters));
    setDigits(review.digits.padEnd(4, " ").slice(0, 4));
    setPicker(null);
  }, [review.plate, review.letters, review.digits]);

  // ضغطة برّه القائمة تقفلها
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setPicker(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const commit = (nextLetters: string[], nextDigits: string) => {
    onChange({
      letters: nextLetters.map((l) => l.trim()).filter(Boolean),
      digits: nextDigits.replace(/\s/g, ""),
    });
  };

  const setLetterAt = (index: number, value: string) => {
    const next = letters.slice();
    next[index] = value;
    setLetters(next);
    setPicker(null);
    commit(next, digits);
  };

  const setDigitAt = (index: number, value: string) => {
    const chars = digits.padEnd(4, " ").split("");
    chars[index] = value;

    // بنضغط الفراغات فوراً عشان اللي على الشاشة يطابق اللي بيتحفظ.
    // قبل كده لو اللوحة أرقامها «52» وضغطت الخانة الرابعة كانت الشاشة
    // تقول «5 2 · 2» والمحفوظ «522» — الاتنين مختلفين والمندوب مش فاهم.
    const compact = chars.join("").replace(/\s/g, "");
    const next = compact.padEnd(4, " ").slice(0, 4);

    setDigits(next);
    setPicker(null);
    commit(letters, next);
  };

  const reset = () => {
    const nextLetters = padLetters(review.heardLetters.slice(-3));
    const nextDigits = review.digits.padEnd(4, " ").slice(0, 4);
    setLetters(nextLetters);
    setDigits(nextDigits);
    commit(nextLetters, nextDigits);
  };

  return (
    <div ref={boxRef} className="rounded-xl border border-white/15 bg-[#121a2b] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
          <Wand2 className="h-3.5 w-3.5 text-emerald-300" />
          اضغط على أي خانة تغيّرها
        </span>
        <span className="flex gap-1">
          <button className="btn-ghost btn-sm" onClick={reset} title="رجّع اللي المحرك سمعه">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button className="btn-primary btn-sm" onClick={onClose}>
              <Check className="h-3.5 w-3.5" />
              تم
            </button>
          )}
        </span>
      </div>

      {/* خانات اللوحة: أرقام شمال وحروف يمين زي اللوحة الحقيقية */}
      <div dir="ltr" className="flex items-center justify-center gap-3">
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <Cell
              key={`d${i}`}
              label={digits[i]?.trim() || "·"}
              active={picker?.kind === "digit" && picker.index === i}
              onClick={() =>
                setPicker((p) =>
                  p?.kind === "digit" && p.index === i ? null : { kind: "digit", index: i }
                )
              }
            />
          ))}
        </div>

        <span className="h-8 w-px bg-white/20" />

        <div className="flex gap-1" dir="rtl">
          {[0, 1, 2].map((i) => (
            <Cell
              key={`l${i}`}
              label={letters[i] ? displayLetter(letters[i]) : "·"}
              active={picker?.kind === "letter" && picker.index === i}
              onClick={() =>
                setPicker((p) =>
                  p?.kind === "letter" && p.index === i
                    ? null
                    : { kind: "letter", index: i }
                )
              }
            />
          ))}
        </div>
      </div>

      {/* قائمة الاختيار */}
      {picker && (
        <div className="mt-3 rounded-lg bg-black/40 p-2">
          <div className="mb-1.5 text-[11px] text-slate-400">
            {picker.kind === "letter"
              ? `اختار الحرف رقم ${picker.index + 1} (الـ١٧ حرف المعتمدة فقط)`
              : `اختار الرقم رقم ${picker.index + 1}`}
          </div>
          <div className="flex flex-wrap gap-1">
            {(picker.kind === "letter" ? [...KSA_PLATE_LETTERS] : DIGITS).map((v) => (
              <button
                key={v}
                onClick={() =>
                  picker.kind === "letter"
                    ? setLetterAt(picker.index, v)
                    : setDigitAt(picker.index, v)
                }
                className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-base font-bold
                           text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/20"
              >
                {picker.kind === "letter" ? displayLetter(v) : v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* بدائل جاهزة من المحرك — ضغطة واحدة */}
      {review.alternatives.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] text-slate-400">
            بدائل اقترحها المحرك (ضغطة واحدة):
          </div>
          <div className="flex flex-wrap gap-1">
            {review.alternatives.map((alt) => (
              <button
                key={alt}
                className="btn-ghost btn-sm ltr-nums"
                onClick={() => {
                  const m = alt.match(/^([ء-ي]+)(\d+)$/);
                  if (!m) return;
                  const nextLetters = padLetters([...m[1]]);
                  const nextDigits = m[2].padEnd(4, " ").slice(0, 4);
                  setLetters(nextLetters);
                  setDigits(nextDigits);
                  commit(nextLetters, nextDigits);
                }}
              >
                {alt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-11 w-10 rounded-lg border text-xl font-bold transition ${
        active
          ? "border-emerald-400 bg-emerald-500/25 text-emerald-100"
          : "border-white/15 bg-white/5 text-slate-100 hover:border-white/40"
      }`}
    >
      {label}
    </button>
  );
}

function padLetters(letters: string[]): string[] {
  const out = letters.slice(0, 3);
  while (out.length < 3) out.push("");
  return out;
}
