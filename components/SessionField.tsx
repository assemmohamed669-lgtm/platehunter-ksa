"use client";

import { X } from "lucide-react";

/**
 * ⑦ حقل جلسة في «الجديد» — «الحي واسم الشارع» و«اسم المسجّل».
 *
 * المندوب بيكتبه **مرة** وبيتختم على كل لوحة **جديدة** بتتقال بعده.
 *
 * ✖️ **زرّ مسح لكل مربّع لوحده** — المالك (٢٣ سبتمبر ٢٠٢٦): «عايزك تحطلي
 * علامة مسح لكل مربع على حدة، تمسح اللي في المربع كله اللي المندوب كتبه،
 * علشان لو حب يكتب حاجة جديدة تبقى سريعة معاه».
 *
 * المسح بيفضّي المربّع بس — اللوحات القديمة بتفضل بختمها. والزرّ مابيظهرش
 * والمربّع فاضي (مافيش حاجة تتمسح).
 */
export default function SessionField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const filled = value.trim().length > 0;
  const hasText = value.length > 0;
  return (
    <div className={"rounded-xl border-2 px-2.5 py-1.5 transition "
      + (filled ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white")}>
      <p className={"text-[10px] font-bold " + (filled ? "text-indigo-700" : "text-slate-400")}>{label}</p>
      <div className="flex items-center gap-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300" />
        {hasText && (
          <button type="button" onClick={() => onChange("")} aria-label={"امسح " + label} title={"امسح " + label}
            className="shrink-0 rounded-full bg-slate-200 p-0.5 text-slate-600 transition hover:bg-rose-100 hover:text-rose-600 active:scale-90">
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
}
