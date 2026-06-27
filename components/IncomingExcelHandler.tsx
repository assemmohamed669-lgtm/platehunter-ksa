"use client";

/**
 * Listens for `excelFileOpened` events dispatched by MainActivity when the
 * user opens an Excel file (.xlsx / .xls) from WhatsApp, email, or Files.
 *
 * Shows a bottom-sheet so the user picks where to load the file:
 *   • فرز — إحالة  → saved as local:referral, navigate to /sorting
 *   • فرز — داتا   → saved as local:data,     navigate to /sorting
 *   • تشييك         → saved as local:check,    navigate to /instant-check
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileSpreadsheet, ListFilter, CheckCircle2 } from "lucide-react";
import { parseExcelFile } from "@/lib/excel";
import { saveUploadedFile, type UploadedFileRecord } from "@/lib/idb";

interface PendingFile {
  name: string;
  base64: string;
}

export default function IncomingExcelHandler() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { name, base64 } = (e as CustomEvent<PendingFile>).detail;
      setPending({ name, base64 });
      setError(null);
    };
    window.addEventListener("excelFileOpened", handler);
    return () => window.removeEventListener("excelFileOpened", handler);
  }, []);

  async function openAs(slot: "referral" | "data" | "check") {
    if (!pending) return;
    setLoading(true);
    setError(null);
    try {
      // base64 → Blob → File
      const binary = atob(pending.base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const file = new File([blob], pending.name, { type: blob.type });

      const table = await parseExcelFile(file);

      const record: UploadedFileRecord = {
        key:        `local:${slot}`,
        agentId:    "local",
        slot,
        fileName:   pending.name,
        headers:    table.headers,
        rows:       table.rows,
        uploadedAt: new Date().toISOString(),
        fileBlob:   blob,
      };
      await saveUploadedFile(record);

      // Notify any already-open page that IDB was updated (handles same-page navigation)
      window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot } }));

      setPending(null);
      router.push(slot === "check" ? "/instant-check" : "/sorting");
    } catch (err) {
      console.error(err);
      setError("تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح (.xlsx)");
    } finally {
      setLoading(false);
    }
  }

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-border bg-surface px-5 py-6 shadow-2xl"
        style={{ direction: "rtl" }}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={22} className="shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold text-ink">ملف Excel وارد</p>
              <p className="mt-0.5 text-xs text-muted line-clamp-1">{pending.name}</p>
            </div>
          </div>
          <button
            onClick={() => setPending(null)}
            className="rounded-full p-1 text-muted hover:text-ink transition"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted">افتح الملف في:</p>

        {error && (
          <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {/* Referral (sorting) */}
          <button
            disabled={loading}
            onClick={() => openAs("referral")}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          >
            <ListFilter size={20} className="shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold text-ink">فرز — ملف إحالة</p>
              <p className="text-xs text-muted">قائمة البنك / شركة التمويل</p>
            </div>
          </button>

          {/* Data (sorting) */}
          <button
            disabled={loading}
            onClick={() => openAs("data")}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          >
            <ListFilter size={20} className="shrink-0 text-muted" />
            <div>
              <p className="text-sm font-bold text-ink">فرز — ملف داتا</p>
              <p className="text-xs text-muted">بيانات التفريغ الميداني</p>
            </div>
          </button>

          {/* Check file */}
          <button
            disabled={loading}
            onClick={() => openAs("check")}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          >
            <CheckCircle2 size={20} className="shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold text-ink">تشييك</p>
              <p className="text-xs text-muted">ملف البحث السريع</p>
            </div>
          </button>
        </div>

        {loading && (
          <p className="mt-3 text-center text-xs text-muted">جارٍ قراءة الملف…</p>
        )}
      </div>
    </div>
  );
}
