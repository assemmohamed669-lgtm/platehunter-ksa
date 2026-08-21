"use client";

/**
 * لوحة الأدمن — سجل الأحداث الأمنية (سوبر أدمن فقط).
 *
 * بيوري مين حاول يوصل للتطبيق بلا تصريح، ومين عمل إيه في لوحة الأدمن.
 * القراءة محميّة على مستوى الداتابيز (سياسة RLS للسوبر أدمن) — الصفحة دي
 * مش الحاجة الوحيدة اللي بتحمي، فلو حد فتح الرابط بحساب عادي مش هيشوف صفوف.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ShieldAlert, RefreshCw, Info } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface EventRow {
  id: number;
  at: string;
  type: string;
  agent_id: string | null;
  actor_label: string | null;
  target_id: string | null;
  target_label: string | null;
  detail: string | null;
  suppressed: number;
  ip: string | null;
}

const KIND: Record<string, { label: string; tone: string }> = {
  api_unauthorized: { label: "نداء بلا تصريح", tone: "text-danger" },
  api_rate_limited: { label: "تعدّى حد الاستهلاك", tone: "text-alert" },
  login_device_mismatch: { label: "دخول من جهاز مختلف", tone: "text-danger" },
  login_account_disabled: { label: "دخول بحساب موقوف", tone: "text-alert" },
  login_cut_off: { label: "دخول باشتراك منتهي", tone: "text-muted" },
  admin_action: { label: "إجراء أدمن", tone: "text-primary" },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getDate()) + "-" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

export default function SecurityLogPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("security_events")
      .select("*")
      .order("at", { ascending: false })
      .limit(300);
    if (error) {
      setErr(
        error.message.includes("does not exist") || error.message.includes("schema cache")
          ? "جدول السجل مش موجود — شغّل docs/sql/security-events.sql في Supabase."
          : "مش متاح — الصفحة دي للسوبر أدمن فقط."
      );
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as EventRow[];
    setRows(list);

    const ids = Array.from(
      new Set(list.flatMap((r) => [r.agent_id, r.target_id]).filter(Boolean) as string[])
    );
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      const m: Record<string, string> = {};
      for (const p of profs ?? []) m[(p as { id: string }).id] = (p as { username: string }).username;
      setNames(m);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const who = (id: string | null, label: string | null) =>
    (id && names[id]) || label || (id ? id.slice(0, 8) : "—");

  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const counts = rows.reduce<Record<string, number>>((a, r) => {
    a[r.type] = (a[r.type] ?? 0) + 1;
    return a;
  }, {});
  const chips: Array<[string, string]> = [["all", "الكل (" + rows.length + ")"]];
  for (const [k, n] of Object.entries(counts)) {
    chips.push([k, (KIND[k] ? KIND[k].label : k) + " (" + n + ")"]);
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-danger" />
          <div>
            <h1 className="text-lg font-bold text-ink">سجل الأمان</h1>
            <p className="text-xs text-muted">آخر ٣٠٠ حدث — سوبر أدمن فقط</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-xl border border-border bg-surface-2 p-2 text-muted transition hover:text-primary"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-xs leading-relaxed text-danger">
          {err}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                "rounded-full px-3 py-1 text-[11px] font-bold transition " +
                (filter === k ? "bg-primary text-night" : "border border-border bg-surface-2 text-muted")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          مافيش أحداث مسجّلة — وده الوضع الطبيعي.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {shown.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className={"text-xs font-bold " + (KIND[r.type] ? KIND[r.type].tone : "text-muted")}>
                {KIND[r.type] ? KIND[r.type].label : r.type}
              </span>
              <span className="shrink-0 text-[10px] text-muted">{fmt(r.at)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
              <span>الفاعل: <b className="text-ink">{who(r.agent_id, r.actor_label)}</b></span>
              {(r.target_id || r.target_label) && (
                <span>الهدف: <b className="text-ink">{who(r.target_id, r.target_label)}</b></span>
              )}
              {r.detail && <span dir="ltr" className="font-mono">{r.detail}</span>}
              {r.ip && <span dir="ltr" className="font-mono">{r.ip}</span>}
              {r.suppressed > 0 && (
                <span className="rounded-full bg-alert/15 px-1.5 text-[10px] font-bold text-alert">
                  +{r.suppressed} مكرر
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          <b className="text-ink">محاولات كلمة السر الغلط مش هنا.</b> Supabase Auth بيرفضها قبل
          ما توصل كود التطبيق، فمافيش طريقة نسجّلها إحنا. تشوفها في
          Supabase ← Logs ← Auth Logs (احتفاظ ٧ أيام).
        </span>
      </div>
    </div>
  );
}
