"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { getDeepgramKey, setDeepgramKey } from "@/lib/deepgramKey";

/**
 * محرّر مفتاح Deepgram — إدخال / إظهار-إخفاء / مسح. يتخزّن على الجهاز فقط،
 * وبيُستخدم في تبويب «صوت» بصفحة تشييك للتفريغ اللحظي (streaming) بالمصري.
 */
export default function DeepgramKeyEditor() {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => { setKey(getDeepgramKey()); }, []);

  function change(v: string) {
    setKey(v);
    setDeepgramKey(v);
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted" dir="rtl">مفتاح Deepgram للتفريغ الصوتي اللحظي</label>
        {key.trim() && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>}
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

      <div className="mt-1 rounded-lg bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted" dir="rtl">
        <b className="text-ink">إزاي تعمل المفتاح:</b><br />
        ١) ادخل{" "}
        <a href="https://console.deepgram.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.deepgram.com</a>
        {" "}واعمل حساب (بتاخد رصيد مجاني للتجربة).<br />
        ٢) من <b>API Keys</b> اعمل مفتاح جديد.<br />
        ٣) انسخه والصقه هنا.<br />
        <span className="text-[10px]">لما المفتاح يكون مفعّل، تبويب «صوت» في تشييك بيستخدم Deepgram (nova-3، لهجة مصرية) بدل المحرك العادي — أدق بكتير.</span>
      </div>
    </div>
  );
}
