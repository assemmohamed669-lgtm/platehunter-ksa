"use client";

/**
 * 📢 كارت الأدمن تحت صفحة التشييك (٢٥ أكتوبر ٢٠٢٦) — المالك: «يظهر عند الادمن تحت صفحه التشييك كم واحد قاري عندو
 * التشييك وكم واحد مش شغال بيه».
 *  · ✅ قاري آخر نسخة من تشييك البرنامج · 📁 شغّال على تشييكه هو · ⏳ مش شغّال بيه (لسه مافتحش البرنامج / نسخة قديمة).
 *  · الأسامي تحت كل رقم بدوسة. بيظهر للي بينشر بس (`lib/appCheck.ts`).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import {
  APP_CHECK_FOR_ALL, fetchAppCheckReport, getAppCheckState, subscribeAppCheck,
  type AppCheckReport, type AppCheckReportRow,
} from "@/lib/appCheck";

const fmt = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", { day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function AppCheckReportCard() {
  const s = useSyncExternalStore(subscribeAppCheck, getAppCheckState, getAppCheckState);
  const [rep, setRep] = useState<AppCheckReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<"reading" | "own" | "notReading" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchAppCheckReport();
    setRep(r);
    setFailed(!r);
    setLoading(false);
  }, []);

  // بيتحمّل أول ما الكارت يظهر، وبعد كل نشر
  useEffect(() => { if (s.publisher) void load(); }, [s.publisher, s.lastPublish, load]);

  if (!s.publisher) return null;

  const box = (key: "reading" | "own" | "notReading", label: string, rows: AppCheckReportRow[], cls: string) => (
    <button
      type="button"
      onClick={() => setOpen((o) => (o === key ? null : key))}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition ${cls} ${open === key ? "ring-2 ring-current" : ""}`}
    >
      <span className="text-lg font-black">{rows.length}</span>
      <span className="text-[10px] font-bold leading-tight">{label}</span>
    </button>
  );

  const list = open && rep ? rep[open] : [];

  return (
    <section dir="rtl" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">📢 تشييك البرنامج — حالة المناديب</h3>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-primary disabled:opacity-50" aria-label="تحديث">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> تحديث
        </button>
      </div>

      {!APP_CHECK_FOR_ALL && (
        <p className="rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-bold text-muted">
          🧪 التجربة: النشر بيوصل لحسابات التجربة بس — المناديب هيقروه بعد الفتح للكل.
        </p>
      )}

      {failed && <p className="text-[11px] font-bold text-danger">مش قادر أجيب الحالة — اتأكد إن ملف app-check.sql اتشغّل، وجرّب «تحديث».</p>}

      {rep && (
        <>
          <div className="text-[11px] text-muted">
            {rep.set && rep.set.files.length ? (
              <>
                <span className="font-bold text-ink">آخر نشر: {fmt(rep.set.updatedAt)}</span>
                {" · "}
                {rep.set.files.map((f) => `${f.fileName}${f.plates ? ` (${f.plates.toLocaleString("ar-EG")} لوحة)` : ""}`).join(" · ")}
              </>
            ) : "لسه مفيش تشييك منشور — ارفع ملف التشييك فوق."}
          </div>
          <div className="flex gap-2">
            {box("reading", "قاري التشييك", rep.reading, "bg-primary/10 text-primary")}
            {box("own", "شغّال على تشييكه", rep.own, "bg-amber-500/10 text-amber-600 dark:text-amber-400")}
            {box("notReading", "مش شغّال بيه", rep.notReading, "bg-danger/10 text-danger")}
          </div>
          {open && (
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-[11px]">
              {list.length === 0 && <li className="text-muted">مفيش حد.</li>}
              {list.map((r) => (
                <li key={r.agent_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2 py-1">
                  <span className="font-bold text-ink">{r.username || "—"}</span>
                  <span className="text-muted">
                    {open === "notReading" && !r.mode ? "لسه مافتحش البرنامج من ساعة النشر" : `آخر تحديث: ${fmt(r.updated_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
