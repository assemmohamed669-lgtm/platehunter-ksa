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
import { X, FileSpreadsheet, ListFilter, CheckCircle2, Lock } from "lucide-react";
import { parseExcelFile } from "@/lib/excel";
import { saveUploadedFile, type UploadedFileRecord } from "@/lib/idb";

interface PendingFile {
  name: string;
  base64: string;
}

type Slot = "referral" | "data" | "check";

export default function IncomingExcelHandler() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  // الوجهة المختارة محفوظة عشان نكمّل بعد ما يدخل كلمة المرور.
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { name, base64 } = (e as CustomEvent<PendingFile>).detail;
      setPending({ name, base64 });
      setError(null);
      setNeedsPassword(false);
      setPassword("");
      setPendingSlot(null);
    };
    window.addEventListener("excelFileOpened", handler);
    return () => window.removeEventListener("excelFileOpened", handler);
  }, []);

  function buildFile(p: PendingFile): { file: File; blob: Blob } {
    const binary = atob(p.base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return { file: new File([blob], p.name, { type: blob.type }), blob };
  }

  async function runParse(slot: Slot, pwd?: string) {
    if (!pending) return;
    setLoading(true);
    setError(null);
    try {
      const { file, blob } = buildFile(pending);
      const table = await parseExcelFile(file, pwd);

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
      setNeedsPassword(false);
      setPassword("");
      setPendingSlot(null);
      router.push(slot === "check" ? "/instant-check" : "/sorting");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "";
      const isPasswordError = msg.includes("محمياً") || msg.includes("كلمة مرور");
      if (isPasswordError) {
        // الملف محمي — اطلب كلمة المرور (أو أعلن إنها غلط لو كان جرّب واحدة).
        setPendingSlot(slot);
        setNeedsPassword(true);
        setError(pwd ? "كلمة المرور غير صحيحة. جرّب تاني." : null);
      } else {
        setError("تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح (.xlsx)");
      }
    } finally {
      setLoading(false);
    }
  }

  function openAs(slot: Slot) {
    runParse(slot);
  }

  function confirmPassword() {
    if (!pendingSlot || !password.trim()) return;
    runParse(pendingSlot, password.trim());
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

        {needsPassword ? (
          /* ── الملف محمي بكلمة مرور ── */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-xl bg-alert/10 px-3 py-2.5 text-alert">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">
                الملف محمي بكلمة مرور. اكتب كلمة المرور بتاعت الإكسل عشان نفتحه.
              </p>
            </div>
            <input
              type="password"
              dir="ltr"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmPassword(); }}
              placeholder="كلمة مرور الملف"
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center text-ink placeholder:text-sm focus:border-primary focus:outline-none"
            />
            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setNeedsPassword(false); setPassword(""); setPendingSlot(null); setError(null); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted transition active:scale-95"
              >
                رجوع
              </button>
              <button
                onClick={confirmPassword}
                disabled={loading || !password.trim()}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition active:scale-95 disabled:opacity-50"
              >
                {loading ? "جارٍ الفتح…" : "فتح الملف"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">افتح الملف في:</p>

            {error && (
              <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {/* Data (sorting) — الأول */}
              <button
                disabled={loading}
                onClick={() => openAs("data")}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
              >
                <ListFilter size={20} className="shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-ink">إضافة ملف الداتا</p>
                  <p className="text-xs text-muted">خانة الداتا في صفحة الفرز</p>
                </div>
              </button>

              {/* Referral (sorting) */}
              <button
                disabled={loading}
                onClick={() => openAs("referral")}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
              >
                <ListFilter size={20} className="shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-ink">إضافة لخانة الإحالة</p>
                  <p className="text-xs text-muted">خانة الإحالة في صفحة الفرز</p>
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
                  <p className="text-sm font-bold text-ink">إضافة لخانة التشييك</p>
                  <p className="text-xs text-muted">خانة التشييك في صفحة تشييك</p>
                </div>
              </button>
            </div>

            {loading && (
              <p className="mt-3 text-center text-xs text-muted">جارٍ قراءة الملف…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
