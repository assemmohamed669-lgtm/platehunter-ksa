"use client";

/**
 * لوحة الأدمن — 📊 **إحصائيات الشهايد** (سوبر أدمن بس).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا». وبعدين: العدّ من الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف
 * ملف و«اللوحات اللي موجوده في كل الشركات ميكملوش نص الرقم دة». دلوقتي:
 *  · **السيرفر بيعدّ لوحده في الخلفية** (`/api/cron/cert-stats` كل دقيقة) ويحفظ، والصفحة دي
 *    بس بتقرا آخر نتيجة (`/api/admin/cert-stats`) — بتفتح على طول. وهي مفتوحة وفيه عدّ شغّال
 *    بتسأل كل ١٠ ثواني.
 *  · **عدد اللوحات المختلفة** (كل لوحة مرة واحدة مهما كان ليها كام ملف) جنب **عدد الملفات**،
 *    ولكل شركة = الحساب اللي رفع (اسمه وإيميله).
 *  · «شهادات السحب — فحص الاتصال بدرايف» اتنقل هنا من الصفحة الرئيسية.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, RefreshCw, FileText, Loader2, HardDriveDownload } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import type { CertStatsView } from "@/lib/certStats";
import { driveHealthMessage, type HealthMessage } from "@/lib/driveHealth";

interface StatsResponse {
  setup?: boolean;
  view?: CertStatsView | null;
  running?: { n: number; startedAt: string; fails: number; lastFail: string | null } | null;
  lastError?: string | null;
}

const CACHE_KEY = "ph:certStatsView:v3";
/** وفيه عدّ شغّال — الصفحة بتسأل كل كام ثانية. */
const POLL_MS = 10_000;

function readCache(): StatsResponse | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as StatsResponse | null;
    return v && typeof v === "object" ? v : null;
  } catch { return null; }
}
function writeCache(r: StatsResponse): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(r)); } catch { /* مليان — الأرقام ظاهرة برضه */ }
}

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
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState(false);
  // فحص اتصال درايف (الشهادات) — عشان نعرف إن الصلاحية ماتت قبل شكوى مندوب.
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState<HealthMessage | null>(null);

  /** فحص اتصال درايف — بينادي راوت الأدمن ويترجم الرد لرسالة مفهومة. */
  async function runDriveHealth() {
    setDriveBusy(true);
    setDriveMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/drive-health", {
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` },
      });
      const j = await res.json().catch(() => ({}));
      setDriveMsg(driveHealthMessage({ ok: !!j?.ok, files: j?.files, error: j?.error }));
    } catch {
      setDriveMsg(driveHealthMessage({ ok: false, error: "network" }));
    } finally {
      setDriveBusy(false);
    }
  }

  /** آخر نتيجة من السيرفر (العدّ نفسه بيحصل هناك في الخلفية). */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/cert-stats", { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      const j = (await res.json().catch(() => null)) as StatsResponse | null;
      if (!res.ok || !j) { setNetError(true); return; }
      setNetError(false);
      setData(j);
      if (j.view) writeCache(j);
    } catch {
      setNetError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // السوبر أدمن بس (زي صفحة المواقع) — آخر نتيجة محفوظة بتظهر على طول، وبعدين من السيرفر
  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", userId).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/sorting"); return; }
      setAuthorized(true);
      setData(readCache());
      void load();
    })();
  }, [router, load]);

  // وفيه عدّ شغّال (أو لسه مفيش نتيجة) ⇒ نسأل كل ١٠ ثواني لحد ما يخلص
  const counting = !!data?.running || (!!authorized && !data?.view && !data?.setup);
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [counting, load]);

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  const view = data?.view ?? null;
  const running = data?.running ?? null;
  const today = view?.daily[0];
  const yesterday = view?.daily[1];
  const driveTrouble = running?.lastFail || data?.lastError;

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
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
          </button>
        </div>

        {/* ── شهادات السحب — فحص الاتصال بدرايف ───────────────────────
            الصلاحية ماتت مرة وفضل التطبيق يقول «مفيش شهادة» أسبوعين والمالك
            عرف من شكوى مندوب. الزرار ده بيقول الحالة في ثانية. */}
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
            <HardDriveDownload size={15} /> شهادات السحب — فحص الاتصال بدرايف
          </div>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
            لو الصلاحية انتهت، المندوب بيشوف «مفيش شهادة» من غير ما حد يعرف. اضغط تتأكد.
          </p>
          <button onClick={() => void runDriveHealth()} disabled={driveBusy}
            className="w-full rounded-lg border border-primary/40 bg-primary/10 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50">
            {driveBusy ? "بيفحص…" : "افحص الاتصال"}
          </button>
          {driveMsg && (
            <p className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-relaxed ${
              driveMsg.level === "ok" ? "bg-emerald-600/10 text-emerald-600"
                : driveMsg.level === "warn" ? "bg-alert/10 text-alert"
                : "bg-danger/10 text-danger"
            }`}>
              {driveMsg.text}
            </p>
          )}
        </div>

        {data?.setup && (
          <p className="rounded-2xl border border-alert/40 bg-alert/10 px-4 py-3 text-xs font-bold leading-relaxed text-alert">
            العدّ محتاج خطوة واحدة في سوبابيز الأول (السطور اللي اتبعتتلك). بعدها السيرفر هيبدأ يعدّ لوحده.
          </p>
        )}

        {running && (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold leading-relaxed text-muted">
            <Loader2 size={14} className="shrink-0 animate-spin" />
            <span>
              {view
                ? <>السيرفر بيراجع العدّ كله في الخلفية — اتقرا {n(running.n)} ملف. الأرقام اللي تحت من آخر عدّ كامل.</>
                : <>أول عدّ شغّال على السيرفر — اتقرا {n(running.n)} ملف لحد دلوقتي. تقدر تقفل الصفحة، والعدّ هيكمّل لوحده.</>}
            </span>
          </p>
        )}
        {!running && !view && !data?.setup && (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold text-muted">
            <Loader2 size={14} className="animate-spin" /> العدّ هيبدأ على السيرفر خلال دقيقة…
          </p>
        )}
        {driveTrouble && (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs font-bold leading-relaxed text-danger">
            درايف مش بيرد دلوقتي — السيرفر بيحاول تاني لوحده كل دقيقة. لو فضلت كده، دوس «افحص الاتصال» فوق.
          </p>
        )}
        {netError && (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">
            النت مش واصل — دوس «تحديث» تاني.
          </p>
        )}

        {view && (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-3">
                <p className="text-2xl font-black text-primary">{n(view.plates)}</p>
                <p className="text-[11px] font-bold text-primary/80">لوحة مختلفة ليها شهادة</p>
                <p className="text-[10px] text-muted">كل لوحة مرة واحدة</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-3">
                <p className="text-2xl font-black text-ink">{n(view.files)}</p>
                <p className="text-[11px] font-bold text-muted">إجمالي ملفات الشهايد</p>
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

            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-muted">
              {view.notPlate > 0 && <span>منهم {n(view.notPlate)} ملف اسمه مش رقم لوحة</span>}
              <span>آخر تحديث {timeLabel(view.at)}</span>
            </div>

            <section className="rounded-2xl border border-border bg-surface p-3">
              <h2 className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-ink">
                <FileText size={15} className="text-primary" /> كل شركة رافعة كام
              </h2>
              <p className="mb-2 text-[10px] text-muted">باسم الحساب اللي رفع الشهادة على درايف</p>
              {view.companies.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted">مفيش شهايد لسه.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-muted">
                      <th className="border-b border-border px-2 py-2 text-right font-bold">الشركة</th>
                      <th className="border-b border-border px-2 py-2 text-center font-bold">ملفات</th>
                      <th className="border-b border-border px-2 py-2 text-center font-bold">لوحات مختلفة</th>
                      <th className="border-b border-border px-2 py-2 text-center font-bold">آخر ٣٠ يوم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.companies.map((c) => (
                      <tr key={c.email || c.name} className="border-b border-border">
                        <td className="px-2 py-2">
                          <p className="font-bold text-ink">{c.name}</p>
                          {c.email && c.email !== c.name && <p className="text-[10px] text-muted" dir="ltr">{c.email}</p>}
                        </td>
                        <td className="px-2 py-2 text-center text-ink">{n(c.total)}</td>
                        <td className="px-2 py-2 text-center font-black text-primary">{n(c.plates)}</td>
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
                {view.daily.map((d) => (
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
