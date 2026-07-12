"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { getOrsKey, setOrsKey } from "@/lib/orsKey";
import { authHeader } from "@/lib/authHeader";

/**
 * محرّر مفتاح OpenRouteService (اختياري) — لحساب وقت الوصول الدقيق بالطرق.
 * إدخال / إظهار-إخفاء / مسح / اختبار. يتخزّن على الجهاز فقط.
 */
export default function OrsKeyEditor() {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setKey(getOrsKey()); }, []);

  function change(v: string) {
    setKey(v);
    setStatus("idle");
    setError(null);
    setOrsKey(v);
  }

  async function test() {
    const k = key.trim();
    if (!k) return;
    setStatus("testing");
    setError(null);
    try {
      const res = await fetch("/api/ors-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ apiKey: k }),
      });
      const data = await res.json();
      if (data.ok) setStatus("ok");
      else { setStatus("failed"); setError(data.error || data.detail || "خطأ غير معروف"); }
    } catch (err) {
      setStatus("failed");
      setError((err as { message?: string })?.message ?? String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted" dir="rtl">مفتاح OpenRouteService لوقت الوصول الدقيق</label>
        {key.trim() && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => change(e.target.value)}
          placeholder="5b3ce35..."
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

      {key.trim() && (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={test} disabled={status === "testing"}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50">
            <RefreshCw size={12} className={status === "testing" ? "animate-spin" : ""} /> اختبار المفتاح
          </button>
          {status === "ok" && <span className="flex items-center gap-1 text-xs font-bold text-brand"><CheckCircle2 size={13} /> المفتاح شغال</span>}
          {status === "failed" && <span className="flex items-center gap-1 text-xs font-bold text-danger"><XCircle size={13} /> المفتاح مش شغال</span>}
        </div>
      )}
      {status === "failed" && error && <p className="text-[11px] text-danger" dir="rtl">{error}</p>}

      <div className="mt-1 rounded-lg bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted" dir="rtl">
        <b className="text-ink">إزاي تعمل المفتاح (مرة واحدة بس):</b><br />
        ١) ادخل{" "}
        <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">openrouteservice.org</a>
        {" "}واعمل حساب مجاني.<br />
        ٢) من لوحة التحكم اعمل <b>Token</b> جديد.<br />
        ٣) انسخه والصقه هنا.<br />
        <span className="text-[10px]">المفتاح اختياري — من غيره الوقت بيتحسب تقديرياً. المفتاح <b>بيتعمل لمرة واحدة فقط</b>.</span>
      </div>
    </div>
  );
}
