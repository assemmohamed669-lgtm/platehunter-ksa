"use client";

/**
 * لوحة الأدمن — 📊 **إحصائيات الشهايد** (سوبر أدمن بس).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا». الأرقام من `/api/admin/cert-stats`
 * (`lib/certStats.ts`): الشهادة = PDF اسمه لوحة، والشركة = الفولدر اللي مشاركاه،
 * واليوم = يوم رفعها على درايف بتوقيت السعودية.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, RefreshCw, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import type { CertStats } from "@/lib/certStats";

type Stats = CertStats & { generatedAt: string; truncated: boolean };

const n = (x: number) => x.toLocaleString("en-US");
function dayLabel(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : day;
}
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("ar-EG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "numeric" }) : "";
}

export default function CertStatsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/cert-stats${refresh ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        setError(j?.error === "rate_limited" ? "استنى دقيقة وجرّب تاني." : "مقدرتش أعدّ الشهايد من درايف — جرّب تاني.");
      } else {
        setStats(j as Stats);
      }
    } catch {
      setError("النت مش واصل — جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }, []);

  // السوبر أدمن بس (زي صفحة المواقع)
  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", userId).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/sorting"); return; }
      setAuthorized(true);
      void load();
    })();
  }, [router, load]);

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  const today = stats?.daily[0];
  const yesterday = stats?.daily[1];

  return (
    <main className="min-h-screen bg-night">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5" dir="rtl">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.push("/admin")}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-ink transition">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-ink">إحصائيات الشهايد</h1>
            <p className="text-[11px] text-muted">من درايف الشركات</p>
          </div>
          <button onClick={() => void load(true)} disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50">
            <RefreshCw size={14} /> تحديث
          </button>
        </div>

        {busy && (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold text-muted">
            <Loader2 size={14} className="animate-spin" /> بعدّ الشهايد على درايف… أول مرة ممكن تاخد دقيقة
          </p>
        )}
        {error && <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">{error}</p>}

        {stats && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-3">
                <p className="text-2xl font-black text-primary">{n(stats.total)}</p>
                <p className="text-[11px] font-bold text-primary/80">إجمالي الشهايد</p>
                <p className="text-[10px] text-muted">كل الشركات</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-3">
                <p className="text-2xl font-black text-ink">{n(today?.total ?? 0)}</p>
                <p className="text-[11px] text-muted">اترفع النهارده</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-3">
                <p className="text-2xl font-black text-ink">{n(yesterday?.total ?? 0)}</p>
                <p className="text-[11px] text-muted">امبارح</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted">
              <span>آخر تحديث {timeLabel(stats.generatedAt)}</span>
              {stats.otherPdfs > 0 && <span>· ملفات PDF تانية مش باسم لوحة: {n(stats.otherPdfs)} (مش محسوبة)</span>}
            </div>
            {stats.truncated && (
              <p className="rounded-xl border border-alert/40 bg-alert/10 px-3 py-2 text-[11px] font-bold text-alert">
                ⚠️ الأرشيف أكبر من اللي اتقرا — العدد ممكن يكون ناقص.
              </p>
            )}

            <section className="rounded-2xl border border-border bg-surface p-3">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                <FileText size={15} className="text-primary" /> كل شركة رافعة كام
              </h2>
              {stats.companies.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted">مفيش شهايد لسه.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-muted">
                      <th className="border-b border-border px-2 py-2 text-right font-bold">الشركة</th>
                      <th className="border-b border-border px-2 py-2 text-center font-bold">الإجمالي</th>
                      <th className="border-b border-border px-2 py-2 text-center font-bold">آخر ٣٠ يوم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.companies.map((c) => (
                      <tr key={c.name} className="border-b border-border">
                        <td className="px-2 py-2 font-bold text-ink">{c.name}</td>
                        <td className="px-2 py-2 text-center font-black text-primary">{n(c.total)}</td>
                        <td className="px-2 py-2 text-center text-ink">{n(c.last30)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-3">
              <h2 className="mb-2 text-sm font-bold text-ink">اترفع كام كل يوم <span className="text-[11px] font-normal text-muted">(آخر ٣٠ يوم)</span></h2>
              <div className="flex flex-col">
                {stats.daily.map((d) => (
                  <div key={d.day} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink">{dayLabel(d.day)}</p>
                      {d.byCompany.length > 0 && (
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                          {d.byCompany.map((c) => `${c.name} ${n(c.count)}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 text-base font-black ${d.total ? "text-primary" : "text-muted"}`}>{n(d.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
