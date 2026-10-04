"use client";

/**
 * 📄 خانة «شهايد» في جداول الفرز والمطلوب (`lib/certificateBatch.ts`).
 *  · فيه شهادة ⇒ «شهادة» بالأزرق — الدوس بيحمّل الـPDF ويفتحه (زي التشييك).
 *  · بيدوّر ⇒ «بيدوّر…» · مفيش ⇒ «—» · درايف ماردّش ⇒ «تعذّر — دوس تاني».
 */
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { CertState } from "@/lib/certificateBatch";

export default function CertCell({ state, onRetry }: { state?: CertState; onRetry?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  if (state.s === "loading") return <span className="whitespace-nowrap text-[0.85em] text-muted">بيدوّر…</span>;
  if (state.s === "none") return <span className="text-muted">—</span>;
  if (state.s === "error") {
    return (
      <button onClick={onRetry} className="whitespace-nowrap text-[0.85em] font-bold text-alert underline">
        تعذّر — دوس تاني
      </button>
    );
  }
  const { cert, count } = state;
  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      // وقت الدوس بس — الجداول ماتجرّش عميل الشهادات (وsupabase) وهي بتتحمّل
      const { fetchCertBlob, openCertBlob } = await import("@/lib/certificate");
      const blob = await fetchCertBlob(cert.id);
      if (blob) await openCertBlob(blob, cert.name);
      else alert("تعذّر تحميل الشهادة.");
    } catch {
      alert("تعذّر فتح الشهادة.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={() => void open()} disabled={busy} title={cert.name}
      className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-primary underline disabled:opacity-50">
      {busy ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
      شهادة{count > 1 ? ` (${count})` : ""}
    </button>
  );
}
