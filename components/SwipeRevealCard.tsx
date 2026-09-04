"use client";

/**
 * بطاقة «اللوحة قدام، البيانات ورا سحبة».
 *
 * الوش بيعرض رقم اللوحة بخط كبير **بس**. المندوب بيسحب **لليسار** فالوش
 * بيتزحزح ولوح البيانات بيبان **مكانه** بكل التفاصيل زي ما هي. السحب
 * بـPointer Events (لمس وماوس)، وفيه سهم كمان للفتح/القفل من غير سحب.
 *
 * الطبقتان مركوبتان فوق بعض (absolute)، وارتفاع البطاقة بيتحرّك من ارتفاع
 * الوش لارتفاع البيانات — فالبيانات بتحلّ محل اللوحة مش بتتزقّ تحتها.
 *
 * منطق السحب نفسه في `lib/plateSwipe.ts` (نقي ومتغطّى باختبارات).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsLeft } from "lucide-react";
import { isHorizontalDrag, clampReveal, settleReveal, REVEAL_MAX_RATIO } from "@/lib/plateSwipe";

export default function SwipeRevealCard({
  face,
  details,
  className = "",
  selected = false,
  onTap,
  open,
  onOpenChange,
}: {
  face: ReactNode;
  details: ReactNode;
  className?: string;
  selected?: boolean;
  /** ضغطة عادية على الوش (من غير سحب) — التحديد */
  onTap?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [faceH, setFaceH] = useState<number>(0);
  const [detailsH, setDetailsH] = useState<number>(0);

  const start = useRef<{ x: number; y: number; decided: boolean } | null>(null);
  const last = useRef<{ x: number; t: number }>({ x: 0, t: 0 });

  const width = cardRef.current?.offsetWidth ?? 0;
  const expanded = open || dragging;
  const x = dragging ? offset : open ? -(width * REVEAL_MAX_RATIO) : 0;

  // قياس الطبقتين من المحتوى الحقيقي — أأمن من تحريك `height:auto` أو
  // `grid-template-rows` (مش مضمونين على ويب-ڤيو قديم على أجهزة المناديب).
  useLayoutEffect(() => {
    if (faceRef.current) setFaceH(faceRef.current.offsetHeight);
  }, [face]);

  useEffect(() => {
    if (detailsRef.current) setDetailsH(detailsRef.current.scrollHeight);
  }, [details, expanded]);

  function onPointerDown(e: React.PointerEvent) {
    // مانسرقش الحدث من أي زر/حقل جوّه البطاقة.
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    start.current = { x: e.clientX, y: e.clientY, decided: false };
    last.current = { x: e.clientX, t: e.timeStamp };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (!s.decided) {
      // رأسي واضح = تمرير القائمة، نسيب البطاقة.
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start.current = null; return; }
      if (!isHorizontalDrag(dx, dy)) return;
      s.decided = true;
      setDragging(true);
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* غير مدعوم */ }
    }

    last.current = { x: e.clientX, t: e.timeStamp };
    setOffset(clampReveal(dx, open, cardRef.current?.offsetWidth ?? 0));
  }

  function endDrag(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;

    if (!s.decided) {
      const dx = Math.abs(e.clientX - s.x);
      const dy = Math.abs(e.clientY - s.y);
      if (dx < 6 && dy < 6) onTap?.();     // ضغطة عادية = تحديد
      return;
    }

    const dt = Math.max(1, e.timeStamp - last.current.t);
    const velocity = (e.clientX - last.current.x) / dt;    // بكسل/مللي (سالب = يسار)
    const next = settleReveal(offset, cardRef.current?.offsetWidth ?? 0, velocity, open);
    setDragging(false);
    setOffset(0);
    if (next !== open) onOpenChange(next);
  }

  // سقف للبطاقة المفتوحة — لوحة بأعمدة كتير بتفضل تتمرّر جوّها بدل ما تاكل
  // الشاشة كلها وتخفي باقي اللوحات.
  const OPEN_MAX = 352;
  const height = expanded ? Math.min(Math.max(detailsH, faceH), OPEN_MAX) : faceH || undefined;

  return (
    <div
      ref={cardRef}
      className={`luxe-card ${selected ? "luxe-card--selected" : ""} ${className}`}
      style={{
        touchAction: "pan-y",
        height,
        transition: "height 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => { start.current = null; setDragging(false); setOffset(0); }}
    >
      {/* لوح البيانات — تحت الوش بالظبط، بيبان لما الوش يتزحزح */}
      <div className="luxe-details-layer" style={{ opacity: expanded ? 1 : 0 }}>
        <div ref={detailsRef} className="luxe-details-inner">{details}</div>
      </div>

      {/* الوش — رقم اللوحة بس */}
      <div
        ref={faceRef}
        className="luxe-face"
        style={{
          transform: `translate3d(${x}px, 0, 0)`,
          transition: dragging ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {face}
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={`shrink-0 ${open ? "" : "luxe-hint"}`}
          title={open ? "إخفاء البيانات" : "اسحب لليسار أو اضغط لعرض البيانات"}
          aria-label={open ? "إخفاء البيانات" : "عرض البيانات"}
        >
          <ChevronsLeft size={20} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 320ms" }} />
        </button>
      </div>
    </div>
  );
}
