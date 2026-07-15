"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X, AlertTriangle, Power } from "lucide-react";
import { getDeepgramKey, setDeepgramKey, isDeepgramEnabled, setDeepgramEnabled } from "@/lib/deepgramKey";

/**
 * محرّر مفتاح Deepgram — إدخال / إظهار-إخفاء / مسح + زر إيقاف/تشغيل مؤقت.
 * يتخزّن على الجهاز فقط، وبيُستخدم في «صوت» بتشييك والتسجيل للتفريغ اللحظي.
 */
export default function DeepgramKeyEditor() {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => { setKey(getDeepgramKey()); setEnabled(isDeepgramEnabled()); }, []);

  function change(v: string) {
    setKey(v);
    setDeepgramKey(v);
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setDeepgramEnabled(next);
  }

  const hasKey = key.trim().length > 0;
  const active = hasKey && enabled;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted" dir="rtl">مفتاح Deepgram للتفريغ الصوتي اللحظي</label>
        {hasKey && (active
          ? <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>
          : <span className="rounded-full bg-alert/15 px-2 py-0.5 text-[10px] font-bold text-alert">متوقّف مؤقتاً</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => change(e.target.value)}
          placeholder="مثال: 3f9a2b..."
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
          dir="ltr"
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "إخفاء المفتاح" : "إظهار المفتاح"}
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" onClick={() => change("")} aria-label="مسح المفتاح"
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-danger hover:text-danger">
          <X size={14} />
        </button>
      </div>

      {/* زر إيقاف/تشغيل مؤقت — يظهر بس لما فيه مفتاح محفوظ */}
      {hasKey && (
        <button type="button" onClick={toggleEnabled} dir="rtl"
          className={`mt-1 flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
            enabled
              ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
              : "border-alert/40 bg-alert/10 text-alert hover:bg-alert/15"
          }`}>
          <Power size={15} />
          {enabled ? "Deepgram شغّال — اضغط للإيقاف المؤقت" : "Deepgram متوقّف — اضغط للتشغيل"}
        </button>
      )}

      {/* تحذير واضح لما يكون متوقّف مؤقتاً */}
      {hasKey && !enabled && (
        <div className="mt-1 flex items-start gap-2 rounded-lg border border-alert/40 bg-alert/5 p-2.5 text-[11px] leading-relaxed text-alert" dir="rtl">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>Deepgram متوقّف مؤقتاً.</b> التفريغ الصوتي (في تشييك صوت والتسجيل) بيستخدم المحرك الأقل دقة دلوقتي.
            اضغط «تشغيل» عشان ترجع للدقة العالية. <span className="text-muted">— المفتاح لسه محفوظ، مش محتاج تكتبه تاني.</span>
          </span>
        </div>
      )}

      <div className="mt-1 rounded-lg bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted" dir="rtl">
        <b className="text-ink">إزاي تعمل المفتاح:</b><br />
        ١) ادخل{" "}
        <a href="https://console.deepgram.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.deepgram.com</a>
        {" "}واعمل حساب (بتاخد رصيد مجاني للتجربة).<br />
        ٢) من <b>API Keys</b> اعمل مفتاح جديد.<br />
        ٣) انسخه والصقه هنا.<br />
        <span className="text-[10px]">لما المفتاح يكون مفعّل، «صوت» في تشييك والتسجيل بيستخدموا Deepgram (nova-3، عربي عام — مصري وسعودي وعامية) بدل المحرك العادي — أدق بكتير.</span>
      </div>
    </div>
  );
}
