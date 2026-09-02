"use client";

import { useState } from "react";
import { FileText, ExternalLink, Share2, Loader2 } from "lucide-react";
import { findCertificate, fetchCertBlob, openCertBlob, shareCertBlob, type CertResult } from "@/lib/certificate";

/**
 * بحث عن شهادة السحب — المندوب يكتب رقم اللوحة (بأي شكل: مشبّك/بمسافة/عربي/إنجليزي)
 * أو رقم الهيكل، والبرنامج يبحث في Google Drive عبر السيرفر. لو فيه شهادة تظهر
 * بزرّين: فتح ومشاركة واتساب.
 */
export default function CertificateSearch() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState<CertResult[]>([]);
  const [action, setAction] = useState<string | null>(null);   // "<id>:open" | "<id>:share"

  async function search() {
    if (!q.trim() || busy) return;
    setBusy(true); setRan(false);
    setResults(await findCertificate(q.trim()));
    setRan(true); setBusy(false);
  }
  async function doOpen(c: CertResult) {
    setAction(c.id + ":open");
    const blob = await fetchCertBlob(c.id);
    if (blob) { try { await openCertBlob(blob, c.name); } catch { alert("تعذّر فتح الشهادة."); } }
    else alert("تعذّر تحميل الشهادة.");
    setAction(null);
  }
  async function doShare(c: CertResult) {
    setAction(c.id + ":share");
    const blob = await fetchCertBlob(c.id);
    if (blob) { try { await shareCertBlob(blob, c.name); } catch { /* المستخدم لغى المشاركة */ } }
    else alert("تعذّر تجهيز الشهادة.");
    setAction(null);
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
        <FileText size={14} /> بحث عن شهادة السحب
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
          placeholder="رقم اللوحة أو رقم الهيكل (بأي شكل)"
          dir="rtl"
          className="flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-primary"
        />
        <button onClick={() => void search()} disabled={busy || !q.trim()}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-night transition disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : "بحث"}
        </button>
      </div>

      {ran && results.length === 0 && (
        <p className="mt-2 text-[11px] text-muted">مفيش شهادة للرقم ده.</p>
      )}
      {results.map((c) => (
        <div key={c.id} className="mt-2 rounded-lg border border-primary/30 bg-surface p-2">
          <p className="truncate text-xs font-bold text-ink">📄 {c.name}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button onClick={() => void doOpen(c)} disabled={action === c.id + ":open"}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-[11px] font-bold text-night transition disabled:opacity-50">
              {action === c.id + ":open" ? <Loader2 size={12} className="animate-spin" /> : <><ExternalLink size={12} /> فتح الشهادة</>}
            </button>
            <button onClick={() => void doShare(c)} disabled={action === c.id + ":share"}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-green-600/40 bg-green-600/10 py-1.5 text-[11px] font-bold text-green-700 transition disabled:opacity-50">
              {action === c.id + ":share" ? <Loader2 size={12} className="animate-spin" /> : <><Share2 size={12} /> مشاركة واتساب</>}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
