"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Share2 } from "lucide-react";
import { findCertificate, fetchCertBlob, openCertBlob, shareCertBlob, type CertResult } from "@/lib/certificate";

/**
 * شارة شهادة السحب — بتظهر تلقائياً على العربية المطلوبة في التشييك. بتبحث
 * لوحدها في Google Drive برقم اللوحة (أو الهيكل لو متوفّر). لو لقت شهادة، تظهر
 * كلمة «شهادة» — يدوس عليها يتحمّل الـPDF ويفتحه، وزر مشاركة واتساب جنبها.
 */
export default function CertificateBadge({ plate, chassis }: { plate?: string; chassis?: string }) {
  const [state, setState] = useState<"loading" | "found" | "none">("loading");
  const [cert, setCert] = useState<CertResult | null>(null);
  const [busy, setBusy] = useState<"open" | "share" | null>(null);

  useEffect(() => {
    let alive = true;
    const q = (chassis && chassis.trim()) || (plate && plate.trim()) || "";
    if (!q) { setState("none"); return; }
    setState("loading");
    findCertificate(q).then((r) => {
      if (!alive) return;
      if (r.length > 0) { setCert(r[0]); setState("found"); } else setState("none");
    });
    return () => { alive = false; };
  }, [plate, chassis]);

  async function doOpen() {
    if (!cert || busy) return;
    setBusy("open");
    const blob = await fetchCertBlob(cert.id);
    if (blob) { try { await openCertBlob(blob, cert.name); } catch { alert("تعذّر فتح الشهادة."); } }
    else alert("تعذّر تحميل الشهادة.");
    setBusy(null);
  }
  async function doShare() {
    if (!cert || busy) return;
    setBusy("share");
    const blob = await fetchCertBlob(cert.id);
    if (blob) { try { await shareCertBlob(blob, cert.name); } catch { /* أُلغيت */ } }
    else alert("تعذّر تجهيز الشهادة.");
    setBusy(null);
  }

  if (state === "none") return null;
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Loader2 size={11} className="animate-spin" /> بندوّر على شهادة…
      </span>
    );
  }
  // found
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button onClick={() => void doOpen()} disabled={!!busy} title="تحميل وفتح الشهادة"
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-night transition disabled:opacity-50">
        {busy === "open" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} شهادة
      </button>
      <button onClick={() => void doShare()} disabled={!!busy} title="مشاركة واتساب"
        className="inline-flex items-center rounded-full border border-green-600/40 bg-green-600/10 p-1.5 text-green-700 transition disabled:opacity-50">
        {busy === "share" ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
      </button>
    </div>
  );
}
