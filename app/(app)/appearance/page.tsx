"use client";

import { useState, useEffect } from "react";
import { Type as TypeIcon, Palette, Baseline, RotateCcw, Check } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import {
  type Appearance, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, applyAppearance,
} from "@/lib/appSettings";
import { THEME_TEMPLATES } from "@/lib/themePresets";

const DEFAULT_BG = "#F3F5F7";
const DEFAULT_INK = "#FFFFFF";

/** صفحة «المظهر والقوالب» — بتفتح كصفحة مستقلة (مش في الشريط) فزر الرجوع يرجّع
 *  للصفحة اللي قبلها. فيها القوالب الجاهزة + التحكم اليدوي (خط/خلفية/نمط ليلي). */
export default function AppearancePage() {
  const [appr, setAppr] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => { setAppr(loadAppearance()); }, []);

  function update(patch: Partial<Appearance>) {
    setAppr((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      applyAppearance(next);
      return next;
    });
  }
  function reset() { update({ ...DEFAULT_APPEARANCE }); }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div>
        <h1 className="text-lg font-bold text-ink">المظهر والقوالب</h1>
        <p className="text-xs text-muted">غيّر شكل التطبيق بالكامل — قالب جاهز أو تخصيص يدوي.</p>
      </div>

      {/* ── القوالب الجاهزة (خلفية + زجاج) ── */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-bold text-ink">قوالب جاهزة</h2>
        <div className="grid grid-cols-2 gap-3">
          {/* بدون قالب — يرجّع الألوان العادية */}
          <button
            onClick={() => update({ template: null })}
            className={`relative flex h-28 items-center justify-center rounded-2xl border-2 bg-surface-2 text-xs font-bold text-ink transition ${
              !appr.template ? "border-primary ring-2 ring-primary" : "border-border"
            }`}
          >
            بدون قالب (عادي)
            {!appr.template && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-night">
                <Check size={12} />
              </span>
            )}
          </button>

          {THEME_TEMPLATES.map((t) => {
            const on = appr.template === t.id;
            return (
              <button
                key={t.id}
                onClick={() => update({ template: t.id })}
                className={`relative h-28 overflow-hidden rounded-2xl border-2 transition ${
                  on ? "border-primary ring-2 ring-primary" : "border-border"
                }`}
                style={{ background: t.bg }}
                title={t.name}
              >
                {/* معاينة مصغّرة لشكل الكارت الصلب + اللون المميّز في القالب */}
                <div
                  className="absolute inset-x-2 bottom-2 rounded-xl p-2"
                  style={{ background: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
                >
                  <p className="text-[11px] font-bold leading-tight" style={{ color: t.ink }}>{t.name}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="h-1.5 flex-1 rounded-full" style={{ background: t.muted, opacity: 0.35 }} />
                    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: t.primary }}>زر</span>
                  </div>
                </div>
                {on && (
                  <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: t.primary }}>
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted">كل قالب بيغيّر الخلفية والكروت واللون المميّز — كروت واضحة القراءة. «بدون قالب» يرجّع الشكل العادي.</p>
      </section>

      {/* ── تخصيص يدوي ── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink">تخصيص</h2>

        {/* حجم الخط */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink"><TypeIcon size={13} /> حجم الخط</span>
            <span className="text-[11px] text-muted">{Math.round(appr.fontScale * 100)}%</span>
          </div>
          <input
            type="range" min={100} max={130} step={5}
            value={Math.round(appr.fontScale * 100)}
            onChange={(e) => update({ fontScale: Number(e.target.value) / 100 })}
            className="w-full accent-primary"
          />
          <p className="text-[10px] text-muted">حرّك لتكبير أو تصغير كل النصوص في التطبيق.</p>
        </div>

        {/* لون الخلفية (يشتغل لما مفيش قالب) */}
        <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs font-bold text-ink">
          <span className="flex items-center gap-1.5"><Palette size={13} /> لون الخلفية</span>
          <input type="color" value={appr.bgColor ?? DEFAULT_BG} onChange={(e) => update({ bgColor: e.target.value })}
            className="h-6 w-8 rounded border border-border bg-transparent" />
        </label>

        {/* لون الخط */}
        <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs font-bold text-ink">
          <span className="flex items-center gap-1.5"><Baseline size={13} /> لون الخط</span>
          <div className="flex items-center gap-2">
            {appr.inkColor && (
              <button type="button" onClick={() => update({ inkColor: null })}
                className="text-[10px] font-normal text-muted underline hover:text-ink">تلقائي</button>
            )}
            <input type="color" value={appr.inkColor ?? DEFAULT_INK} onChange={(e) => update({ inkColor: e.target.value })}
              className="h-6 w-8 rounded border border-border bg-transparent" />
          </div>
        </label>
        <p className="text-[10px] text-muted">لون الخط بيتظبط تلقائياً حسب الخلفية. لو الخط مش واضح، غيّره يدوياً — و«تلقائي» يرجّعه. ألوان الحالة (مطلوبة/غير مطلوبة) ثابتة.</p>

        {/* الوضع الليلي */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
          <span className="text-xs font-bold text-ink">الوضع الليلي / التوفير</span>
          <ThemeToggle />
        </div>

        <button onClick={reset}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-muted hover:text-ink transition">
          <RotateCcw size={13} /> استعادة الافتراضي
        </button>
      </section>
    </div>
  );
}
