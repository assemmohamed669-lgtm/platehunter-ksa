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
import { CheckSquare, Square, Layers, ChevronDown } from "lucide-react";
import type { SheetInfo } from "@/lib/referralSheets";

interface Props {
  sheets: SheetInfo[];
  /** أسماء الورقات المختارة. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** إجمالي اللوحات الفريدة في المختار (محسوب في الصفحة). */
  total: number;
}

export default function ReferralSheetPicker({ sheets, selected, onChange, total }: Props) {
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
            {total.toLocaleString("en-US")} لوحة
          </span>
          <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {!open && total === 0 && (
        <p className="px-3 pb-2 text-[11px] text-alert">علّم ورقة واحدة على الأقل عشان تقدر تفرز.</p>
      )}

      {open && (<div className="border-t border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-muted">علّم اللي عايز تفرز عليها</p>
        <button
          onClick={() => onChange(allOn ? new Set() : new Set(withPlates.map((s) => s.name)))}
          className="text-[11px] text-primary underline"
        >
          {allOn ? "إلغاء الكل" : "تحديد الكل"}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {withPlates.map((s) => {
          const on = selected.has(s.name);
          return (
            <button
              key={s.name}
              onClick={() => toggle(s.name)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-right transition ${
                on ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2"
              }`}
            >
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
                {s.plateCount.toLocaleString("en-US")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="text-[11px] text-muted">هيتم الفرز على</span>
        <span className="text-sm font-black text-primary">
          {total.toLocaleString("en-US")} لوحة
        </span>
      </div>
      {total === 0 && (
        <p className="mt-1 text-[11px] text-alert">علّم ورقة واحدة على الأقل عشان تقدر تفرز.</p>
      )}
      </div>)}
    </div>
  );
}
