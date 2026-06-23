"use client";

import { useId, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Trash2, Lock, AlertCircle, Download } from "lucide-react";
import { parseExcelFile, type ExcelTable } from "@/lib/excel";

interface Props {
  title: string;
  hint?: string;
  onParsed: (table: ExcelTable, file: File) => void;
  parsedFile: File | null;
  parsedRowCount: number | null;
  onClear: () => void;
}

export default function FileUploadBox({
  title,
  hint,
  onParsed,
  parsedFile,
  parsedRowCount,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const table = await parseExcelFile(file);
      onParsed(table, file);
      setPendingFile(null);
      setNeedsPassword(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذّرت قراءة الملف.";
      const isPasswordError = msg.includes("محمياً") || msg.includes("كلمة مرور");
      if (isPasswordError) {
        setPendingFile(file);
        setNeedsPassword(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordConfirm() {
    if (!pendingFile) return;
    setError(null);
    setLoading(true);
    try {
      const table = await parseExcelFile(pendingFile, password);
      onParsed(table, pendingFile);
      setPendingFile(null);
      setNeedsPassword(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "كلمة المرور غير صحيحة.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadOriginal() {
    if (!parsedFile) return;
    const url = URL.createObjectURL(parsedFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = parsedFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (parsedFile && parsedRowCount !== null) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet size={18} className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="rtl-text truncate text-sm font-medium text-ink">{parsedFile.name}</p>
              <p className="text-xs text-muted">{parsedRowCount} صف</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={handleDownloadOriginal}
              title="تنزيل"
              className="rounded-full border border-border p-1.5 text-muted hover:text-primary transition"
            >
              <Download size={14} />
            </button>
            <button
              onClick={onClear}
              title="حذف الملف"
              className="rounded-full border border-border p-1.5 text-muted hover:text-danger transition"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-3">
      <p className="mb-2 text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}

      <label
        htmlFor={inputId}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-3 text-sm text-muted transition hover:border-primary hover:text-primary ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload size={16} />
        {loading ? "جارٍ القراءة..." : "اختر ملف Excel"}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {needsPassword && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-alert">
            <Lock size={13} />
            هذا الملف يبدو محميًا — أدخل كلمة المرور
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة مرور الملف"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handlePasswordConfirm}
              disabled={loading || !password}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-night disabled:opacity-50"
            >
              {loading ? "..." : "تأكيد"}
            </button>
          </div>
        </div>
      )}

      {error && !needsPassword && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle size={13} />
          {error}
        </div>
      )}
    </div>
  );
}
