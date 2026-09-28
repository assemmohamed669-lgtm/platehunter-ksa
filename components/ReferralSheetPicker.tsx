"use client";

/**
 * ReferralSheetPicker — اختيار ورقات ملف الإحالة اللي هيتم الفرز عليها.
 *
 * ملفات الشركات بتيجي فيها ورقات مختلفة الغرض: ورقة بكل أسطول الشركة، وورقات
 * بالمطلوبين فعلاً (مباعة/مسروقة/قبل وبعد الاستحواذ). التطبيق مايقدرش يعرف
 * لوحده أنهي ورقة هي المطلوبين — فالمندوب بيعلّم على اللي عايزه، والإجمالي
 * بيتحدّث فوراً قدامه قبل ما يفرز.
 */
import { useState } from "react";
import { CheckSquare, Square, Layers, ChevronDown, ChevronUp } from "lucide-react";
import type { SheetInfo } from "@/lib/referralSheets";
import { moveInOrder } from "@/lib/sheetOrder";

interface Props {
  sheets: SheetInfo[];
  /** أسماء الورقات المختارة. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** إجمالي العدد في المختار (محسوب في الصفحة). */
  total: number;
  /** وحدة العدّ المعروضة: «لوحة» للإحالة (لوحات فريدة)، «صف» للداتا (كل الصفوف). */
  unit?: string;
  /**
   * 📑 **ترتيب الورقات بإيد المندوب** (للداتا بس — طلب المالك ٢٨ سبتمبر ٢٠٢٦).
   * الورقات المختارة بتظهر فوق بترتيبها ومرقّمة، ولكل واحدة سهمين تطلع/تنزل —
   * والترتيب ده هو ترتيب نتيجة الفرز. من غيره (الإحالة) المنتقي زي ما كان بالظبط.
   */
  ordered?: boolean;
}

export default function ReferralSheetPicker({ sheets, selected, onChange, total, unit = "لوحة", ordered = false }: Props) {
  const [open, setOpen] = useState(false);   // مطويّة افتراضياً — القايمة بتملى الشاشة
  const withPlates = sheets.filter((s) => s.plateCount > 0);
  if (withPlates.length <= 1) return null;   // ورقة واحدة → مفيش داعي للاختيار

  const allOn = withPlates.every((s) => selected.has(s.name));
  const selectedCount = withPlates.filter((s) => selected.has(s.name)).length;
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(next);
  };
  // ترتيب المختار = ترتيب الإدخال في الـSet (أول ما علّم عليه = الأول).
  const selectedOrder = [...selected].filter((n) => withPlates.some((s) => s.name === n));
  const move = (name: string, dir: -1 | 1) => onChange(new Set(moveInOrder(selectedOrder, name, dir)));
  // العرض: في وضع الترتيب المختار فوق بترتيبه وبعده الباقي بترتيب الملف.
  const shown = ordered
    ? [
        ...selectedOrder.map((n) => withPlates.find((s) => s.name === n)!),
        ...withPlates.filter((s) => !selected.has(s.name)),
      ]
    : withPlates;

  return (
    <div className="rounded-xl border border-border bg-surface" dir="rtl">
      {/* الملخص — دايماً ظاهر. القايمة نفسها مطويّة عشان ماتمليش الشاشة. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Layers size={14} className="shrink-0 text-primary" />
          <span className="truncate text-xs font-bold text-ink">
            ورقات الملف — مختار {selectedCount} من {withPlates.length}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-black text-primary">
            {total.toLocaleString("en-US")} {unit}
          </span>
          <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {!open && total === 0 && (
        <p className="px-3 pb-2 text-[11px] text-alert">علّم ورقة واحدة على الأقل عشان تقدر تفرز.</p>
      )}

      {open && (<div className="border-t border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-muted">
          {ordered ? "علّم اللي عايز تفرز عليها — الأول نتيجته تطلع فوق" : "علّم اللي عايز تفرز عليها"}
        </p>
        <button
          onClick={() => onChange(allOn ? new Set() : new Set(
            // في وضع الترتيب: اللي المندوب رتّبه يفضل أول، والباقي يتضاف بعده.
            ordered ? [...selectedOrder, ...withPlates.map((s) => s.name)] : withPlates.map((s) => s.name),
          ))}
          className="text-[11px] text-primary underline"
        >
          {allOn ? "إلغاء الكل" : "تحديد الكل"}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {shown.map((s) => {
          const on = selected.has(s.name);
          const rank = ordered && on ? selectedOrder.indexOf(s.name) : -1;
          const row = (
            <button
              key={s.name}
              data-testid="sheet-row"
              data-sheet={s.name}
              onClick={() => toggle(s.name)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-right transition ${
                on ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2"
              } ${ordered ? "min-w-0 flex-1" : ""}`}
            >
              {rank >= 0 && (
                <span
                  data-testid={`sheet-rank-${s.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-black text-night"
                >
                  {rank + 1}
                </span>
              )}
              {on
                ? <CheckSquare size={15} className="shrink-0 text-primary" />
                : <Square size={15} className="shrink-0 text-muted" />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] ${on ? "font-bold text-ink" : "text-muted"}`}>
                  {s.name.trim()}
                </span>
                <span className="block text-[10px] text-muted">
                  {s.plateColName ? `عمود: ${s.plateColName}` : "بدون عنوان — اتكشف بالمحتوى"}
                </span>
              </span>
              <span className={`shrink-0 text-[12px] font-bold ${on ? "text-primary" : "text-muted"}`}>
                {(s.rowCount || s.plateCount).toLocaleString("en-US")}
              </span>
            </button>
          );
          if (!ordered) return row;
          // السهمين برّه زرار التعليم (زرار جوّه زرار مش مسموح في HTML).
          return (
            <div key={s.name} className="flex items-stretch gap-1">
              {row}
              {rank >= 0 && selectedOrder.length > 1 && (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    aria-label={`طلّع «${s.name.trim()}» لفوق`}
                    disabled={rank === 0}
                    onClick={() => move(s.name, -1)}
                    className="flex flex-1 items-center justify-center rounded-md border border-border px-1.5 text-primary disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    aria-label={`نزّل «${s.name.trim()}» لتحت`}
                    disabled={rank === selectedOrder.length - 1}
                    onClick={() => move(s.name, 1)}
                    className="flex flex-1 items-center justify-center rounded-md border border-border px-1.5 text-primary disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="text-[11px] text-muted">هيتم الفرز على</span>
        <span className="text-sm font-black text-primary">
          {total.toLocaleString("en-US")} {unit}
        </span>
      </div>
      {total === 0 && (
        <p className="mt-1 text-[11px] text-alert">علّم ورقة واحدة على الأقل عشان تقدر تفرز.</p>
      )}
      </div>)}
    </div>
  );
}
