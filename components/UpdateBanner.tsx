"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { APP_VERSION, refreshAppNow } from "@/lib/appVersion";

const LS_DISMISSED = "ph:updateDismissedVersion";

/**
 * بانر «فيه تحديث» — بيظهر لما النسخة على السيرفر تكون أحدث من النسخة المخزّنة
 * على جهاز المندوب. زر «تحديث الآن» بيمسح الكاش ويجيب آخر نسخة، وزر الإغلاق بيخفيه
 * لنفس النسخة بس (لو نزل تحديث أحدث بعدين بيظهر من جديد).
 */
export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { version?: string; note?: string }) => {
        if (!d?.version || d.version === APP_VERSION) return;
        let dismissed = "";
        try { dismissed = localStorage.getItem(LS_DISMISSED) || ""; } catch { /* ignore */ }
        if (d.version === dismissed) return; // المندوب قفله لنفس النسخة دي
        setLatest(d.version);
        setNote(d.note || "");
      })
      .catch(() => { /* أوفلاين — عادي */ });
  }, []);

  if (!latest) return null;

  return (
    <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary" dir="rtl">
      <Download size={14} className="shrink-0" />
      <span className="flex-1">فيه تحديث جديد للبرنامج{note ? ` — ${note}` : " — اضغط تحديث الآن."}</span>
      <button onClick={() => refreshAppNow()} className="shrink-0 rounded-lg bg-primary px-2.5 py-1 font-bold text-night">تحديث الآن</button>
      <button
        onClick={() => { try { localStorage.setItem(LS_DISMISSED, latest); } catch { /* ignore */ } setLatest(null); }}
        className="shrink-0 text-primary/70 hover:text-primary"
        aria-label="إغلاق"
      >
        <X size={14} />
      </button>
    </div>
  );
}
