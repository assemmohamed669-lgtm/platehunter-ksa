"use client";

/**
 * زر «فتح» موحّد لكل الشيتات — لما يتضغط بيطلّع خيارين: «فتح» (يفتح الملف في
 * تطبيق الجداول) و«تنزيل» (يحفظ الملف على الجهاز)، والاتنين مفعّلين.
 */
import { useState } from "react";
import { FolderOpen, ExternalLink, Download } from "lucide-react";
import { openExcelBlob, downloadExcelBlob } from "@/lib/excel";

interface Props {
  /** يبني الـ blob + الاسم عند الطلب (ممكن async). */
  build: () => Promise<{ blob: Blob; name: string }> | { blob: Blob; name: string };
  label?: string;
  className?: string;
}

export default function OpenDownloadButton({ build, label = "فتح", className }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "open" | "download">(null);

  async function run(kind: "open" | "download") {
    setBusy(kind);
    try {
      const { blob, name } = await build();
      if (kind === "open") {
        const result = await openExcelBlob(blob, name);
        alert(result === "opened" ? "تم تصدير الملف وفتحه." : "تم تصدير الملف وتنزيله.");
      } else {
        downloadExcelBlob(blob, name);
        alert("تم تصدير الملف وتنزيله.");
      }
    } catch (e) {
      alert((e as { message?: string })?.message ?? (kind === "open" ? "تعذّر فتح الملف" : "تعذّر تنزيل الملف"));
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        className={
          className ??
          "flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60"
        }
      >
        <FolderOpen size={16} /> {busy ? "..." : label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-50 mb-1 w-full min-w-[9rem] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" style={{ direction: "rtl" }}>
            <button
              onClick={() => run("open")}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-ink transition hover:bg-primary/10"
            >
              <ExternalLink size={15} className="text-primary" /> فتح
            </button>
            <button
              onClick={() => run("download")}
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm text-ink transition hover:bg-primary/10"
            >
              <Download size={15} className="text-primary" /> تنزيل
            </button>
          </div>
        </>
      )}
    </div>
  );
}
