"use client";

import { useState, useEffect } from "react";
import { Type as TypeIcon, Palette, Baseline, RotateCcw, Check, BellRing, Square, Loader2, ChevronDown } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import {
  type Appearance, DEFAULT_APPEARANCE, APPEARANCE_COLLAPSE_FOR_ALL, loadAppearance, saveAppearance, applyAppearance,
} from "@/lib/appSettings";
import { THEME_TEMPLATES } from "@/lib/themePresets";
import { ALERT_TONES, ALERT_TONES_FOR_ALL, DEFAULT_ALERT_TONE, alertToneById, loadAlertToneId, saveAlertToneId } from "@/lib/alertTones";
import { previewAlertTone, preloadAlertTone, stopAlertTonePreview, isAlertSirenPlaying } from "@/lib/alertSiren";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_BG = "#F3F5F7";
const DEFAULT_INK = "#FFFFFF";
/** رأس القسم اللي بيتقفل بسهم («قوالب جاهزة» / «نغمة التحصيل»). */
const SECTION_TOGGLE = "flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm font-bold text-ink transition hover:border-primary/40";

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

  // 🔔 «نغمة التحصيل» — السوبر أدمن الأول (`ALERT_TONES_FOR_ALL`). `lib/alertTones.ts`
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        setIsSuper((prof as { is_super?: boolean } | null)?.is_super === true);
      } catch { /* مش عارفين — من غير الخيار */ }
    })();
  }, []);
  const [tone, setTone] = useState(DEFAULT_ALERT_TONE);
  useEffect(() => { setTone(loadAlertToneId()); }, []);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loadingTone, setLoadingTone] = useState<string | null>(null);
  const [toneFailed, setToneFailed] = useState(false);
  // المعاينة بتخلص لوحدها (النغمة مرة واحدة · الصفّارة ٤ ثواني) ⇒ الزرار يرجع.
  useEffect(() => {
    if (!previewing) return;
    const t = setInterval(() => { if (!isAlertSirenPlaying()) setPreviewing(null); }, 300);
    return () => clearInterval(t);
  }, [previewing]);
  // الخروج من الصفحة بيوقف المعاينة.
  useEffect(() => () => { stopAlertTonePreview(); }, []);

  /** الدوسة على نغمة = اختارها + سمّعها (زي اختيار رنّة الموبايل). */
  async function pickTone(id: string) {
    setTone(id);
    saveAlertToneId(id);
    setToneFailed(false);
    setLoadingTone(id);
    setPreviewing(null);
    const ok = await previewAlertTone(id);
    setLoadingTone((cur) => (cur === id ? null : cur));
    if (ok) setPreviewing(id);
    else if (!(await preloadAlertTone(id))) setToneFailed(true);
  }
  function stopPreview() { stopAlertTonePreview(); setPreviewing(null); }

  // ▾ «قوالب جاهزة» و«نغمة التحصيل» مقفولين بسهم — بيتفتحوا بالدوسة (السوبر أدمن الأول: `APPEARANCE_COLLAPSE_FOR_ALL`).
  //    نغمة التحصيل ظاهرة للسوبر أدمن بس أصلاً، فبتتقفل على طول.
  const collapsible = APPEARANCE_COLLAPSE_FOR_ALL || isSuper;
  const [tplOpen, setTplOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const templateName = appr.template
    ? (THEME_TEMPLATES.find((t) => t.id === appr.template)?.name ?? "")
    : "بدون قالب";

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div>
        <h1 className="text-lg font-bold text-ink">المظهر والقوالب</h1>
        <p className="text-xs text-muted">غيّر شكل التطبيق بالكامل — قالب جاهز أو تخصيص يدوي.</p>
      </div>

      {/* ── القوالب الجاهزة (خلفية + زجاج) ── */}
      <section className="flex flex-col gap-2.5">
        {collapsible ? (
          <button onClick={() => setTplOpen((o) => !o)} aria-expanded={tplOpen} className={SECTION_TOGGLE}>
            <span>قوالب جاهزة</span>
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-normal text-muted">
              <span className="truncate">{templateName}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${tplOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
        ) : (
          <h2 className="text-sm font-bold text-ink">قوالب جاهزة</h2>
        )}
        {(!collapsible || tplOpen) && (<>
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
        </>)}
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

      {/* ── 🔔 نغمة التحصيل — اللي بترن لما المندوب يلاقي سيارة مطلوبة ── */}
      {(ALERT_TONES_FOR_ALL || isSuper) && (
        <section className="flex flex-col gap-2.5">
          <button onClick={() => { if (toneOpen) stopPreview(); setToneOpen((o) => !o); }} aria-expanded={toneOpen} className={SECTION_TOGGLE}>
            <span className="flex items-center gap-1.5"><BellRing size={14} className="text-primary" /> نغمة التحصيل</span>
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-normal text-muted">
              <span className="truncate">{alertToneById(tone).name}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${toneOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {toneOpen && (<>
          <p className="text-[10px] text-muted">النغمة اللي بتسمعها لما تلاقي سيارة مطلوبة — بترن لحد ما تدوس «تم». دوس على أي نغمة تختارها وتسمعها.</p>
          <div className="flex flex-col gap-1.5">
            {ALERT_TONES.map((t) => {
              const on = tone === t.id;
              const playingThis = previewing === t.id;
              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${on ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}>
                  <button onClick={() => void pickTone(t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-right text-xs font-bold text-ink">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-night" : "border-border"}`}>
                      {on && <Check size={12} />}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </button>
                  {loadingTone === t.id && <Loader2 size={15} className="shrink-0 animate-spin text-muted" />}
                  {playingThis && (
                    <button onClick={stopPreview} aria-label="إيقاف"
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted hover:text-ink">
                      <Square size={11} /> إيقاف
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {toneFailed && (
            <p className="text-[10px] font-bold text-danger">ماقدرتش أحمّل النغمة — اتأكد من النت وجرّب تاني. لحد ما تتحمّل، التنبيه هيرن بالصفّارة العادية.</p>
          )}
          </>)}
        </section>
      )}
    </div>
  );
}
