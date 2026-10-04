"use client";

/**
 * لوحة الأدمن — 📊 **إحصائيات الشهايد** (سوبر أدمن بس).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا». وبعد أول نسخة: التأخير، شهايد متسابة، واسم فولدر
 * («الشهادات») بدل اسم الشركة. دلوقتي (الحساب نفسه في `lib/certStats.ts`):
 *  · آخر عدّ كامل **محفوظ على الموبايل** وبيظهر على طول؛ ومع كل فتحة الصفحة بتعدّ من جديد
 *    في الخلفية — فترات بتاريخ الرفع **مع بعض** (`countAll`) — وتبدّل الأرقام لما العدّ
 *    **يخلص كله**. مافيش رقم نص-نص: يا عدّ كامل جديد يا اللي قبله بتاريخه.
 *  · كل PDF على درايف بيتعدّ، والشركة = **الحساب اللي رفع** (اسمه وإيميله).
 *  · «شهادات السحب — فحص الاتصال بدرايف» اتنقل هنا من الصفحة الرئيسية (المالك ٤ أكتوبر:
 *    «زر شهادات السحب فحص الاتصال ب درايف خليه جوة صفحه احصائيات الشهايد»).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, RefreshCw, FileText, Loader2, HardDriveDownload } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import { countAll, statsFromCounts, type CertStatsCache, type CountTask, type StepResult } from "@/lib/certStats";
import { driveHealthMessage, type HealthMessage } from "@/lib/driveHealth";

const CACHE_KEY = "ph:certStatsCache:v2";
/** خطوات في نفس الوقت. */
const CONCURRENCY = 8;

function readCache(): CertStatsCache | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as CertStatsCache | null;
    return v && v.v === 2 && v.counts && v.people ? v : null;
  } catch { return null; }
}
function writeCache(c: CertStatsCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* مليان — الأرقام ظاهرة برضه */ }
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
  const [cache, setCache] = useState<CertStatsCache | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  // فحص اتصال درايف (الشهادات) — عشان نعرف إن الصلاحية ماتت قبل شكوى مندوب.
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState<HealthMessage | null>(null);

  /** فحص اتصال درايف — بينادي راوت الأدمن ويترجم الرد لرسالة مفهومة. */
  async function runDriveHealth() {
    setDriveBusy(true);
    setDriveMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/drive-health", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const j = await res.json().catch(() => ({}));
      setDriveMsg(driveHealthMessage({ ok: !!j?.ok, files: j?.files, error: j?.error }));
    } catch {
      setDriveMsg(driveHealthMessage({ ok: false, error: "network" }));
    } finally {
      setDriveBusy(false);
    }
  }

  /** خطوة = صفحة من درايف لفترة — بتتعاد لوحدها (٤ مرات) لو النت/درايف فشل. */
  const stepApi = useCallback(async (t: CountTask, cut: boolean): Promise<StepResult> => {
    const qs = new URLSearchParams();
    if (t.after) qs.set("after", t.after);
    if (t.until) qs.set("until", t.until);
    if (t.token) qs.set("pageToken", t.token);
    if (!cut) qs.set("cut", "0");
    const url = "/api/admin/cert-stats/files" + (qs.toString() ? "?" + qs.toString() : "");
    let last = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch(url, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        const j = await res.json().catch(() => ({}));
        if (res.ok && !j?.error) return j as StepResult;
        last = j?.error || String(res.status);
        if (res.status === 403 || res.status === 400) break;
      } catch { last = "network"; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error(last);
  }, []);

  /** عدّ كامل من جديد — الأرقام بتتبدّل بس لما يخلص كله. */
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const r = await countAll(stepApi, { now: new Date(), concurrency: CONCURRENCY, onProgress: setProgress });
      const c: CertStatsCache = { v: 2, counts: r.counts, people: r.people, n: r.n, at: new Date().toISOString() };
      writeCache(c);
      setCache(c);
    } catch (e) {
      setError((e as Error)?.message === "network" ? "النت مش واصل" : "درايف ماردّش");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [stepApi]);

  // السوبر أدمن بس (زي صفحة المواقع) — آخر عدّ بيظهر على طول، والعدّ الجديد في الخلفية
  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", userId).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/sorting"); return; }
      setAuthorized(true);
      setCache(readCache());
      void run();
    })();
  }, [router, run]);

  const stats = useMemo(() => (cache ? statsFromCounts(cache.counts, cache.people, new Date(), 30) : null), [cache]);

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
          <button onClick={() => void run()} disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50">
            <RefreshCw size={14} /> تحديث
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

        {busy && (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold text-muted">
            <Loader2 size={14} className="animate-spin" />
            <>{cache ? "بيحدّث الأرقام" : "بعدّ كل الشهايد على درايف"} — اتقرا {n(progress)} ملف…</>
          </p>
        )}
        {error && (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">
            {cache
              ? `مقدرتش أكمّل التحديث (${error}) — الأرقام اللي ظاهرة من آخر عدّ كامل. دوس «تحديث» تاني.`
              : `مقدرتش أعدّ الشهايد (${error}) — دوس «تحديث» تاني.`}
          </p>
        )}

        {stats && cache && (
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

            <p className="px-1 text-[10px] text-muted">آخر تحديث {timeLabel(cache.at)}</p>

            <section className="rounded-2xl border border-border bg-surface p-3">
              <h2 className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-ink">
                <FileText size={15} className="text-primary" /> كل شركة رافعة كام
              </h2>
              <p className="mb-2 text-[10px] text-muted">باسم الحساب اللي رفع الشهادة على درايف</p>
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
                      <tr key={c.email || c.name} className="border-b border-border">
                        <td className="px-2 py-2">
                          <p className="font-bold text-ink">{c.name}</p>
                          {c.email && c.email !== c.name && <p className="text-[10px] text-muted" dir="ltr">{c.email}</p>}
                        </td>
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
