"use client";

import { useId, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Trash2, Lock, AlertCircle, Download, ExternalLink } from "lucide-react";
import { parseExcelFile, decryptExcelFile, openExcelBlob, type ExcelTable } from "@/lib/excel";

interface Props {
  title: string;
  hint?: string;
  onParsed: (table: ExcelTable, file: File) => void;
  parsedFile: File | null;
  parsedRowCount: number | null;
  onClear: () => void;
  /** Number of actual plates read in the plate column (shown next to the file). */
  plateCount?: number | null;
  /** When true: shows تغيير + مسح buttons instead of download + trash */
  showReplaceButtons?: boolean;
  /** When true: file is fixed — no تغيير/مسح, only a download button */
  fixed?: boolean;
  /**
   * ملفات الداتا الكبيرة: لو الحجم أكبر من العتبة دي، بدل ما نفتح الملف في الذاكرة
   * (اللي بيعمل crash على iOS) نستدعي onLargeFile اللي بيقراه على دفعات ويخزّنه.
   * بيتمرّر بس لصندوق الداتا في صفحة الفرز — باقي الصناديق مابتتأثرش.
   */
  largeFileThresholdBytes?: number;
  onLargeFile?: (file: File, onProgress: (rows: number) => void) => Promise<void>;
  /** مظهر سماوي (أزرق فاتح) بحواف مظلّلة — لتمييز مربع رفع شيت التشييك. */
  sky?: boolean;
  /**
   * لون إطار المربع **لما يتحمّل فيه شيت** (تمييز بصري سريع للمندوب):
   *  • "data"     → إطار أحمر منوّر بظل.
   *  • "referral" → إطار أخضر منوّر بظل.
   * من غيره → الإطار الافتراضي. (لا يؤثّر على المربع الفاضي.)
   */
  loadedAccent?: "data" | "referral";
}

export default function FileUploadBox({
  title,
  hint,
  onParsed,
  parsedFile,
  parsedRowCount,
  onClear,
  plateCount = null,
  showReplaceButtons = false,
  fixed = false,
  largeFileThresholdBytes,
  onLargeFile,
  sky = false,
  loadedAccent,
}: Props) {
  // إطار المربع: سماوي بظل واضح لو sky. بنستخدم صبغة سماوية فوق سطح الثيم (مش لون
  // ثابت) عشان النص يفضل مقروء في الوضع الفاتح والغامق.
  const skyBox = "rounded-xl border-2 border-sky-400/70 bg-sky-500/12 shadow-lg shadow-sky-500/25";
  // إطار المربع لما يتحمّل شيت: أحمر منوّر للداتا، أخضر منوّر للإحالة (تمييز سريع).
  const loadedBox = loadedAccent === "data"
    ? "rounded-xl border-2 border-red-500/70 bg-red-500/10 shadow-lg shadow-red-500/30"
    : loadedAccent === "referral"
      ? "rounded-xl border-2 border-green-500/70 bg-green-500/10 shadow-lg shadow-green-500/30"
      : "rounded-xl border border-primary/40 bg-primary/5";
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  // الباسوورد اللي فتح الملف — يتحفظ عشان تبديل الورقة يفكّ التشفير تاني.
  const [filePassword, setFilePassword] = useState<string | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSheets, setAllSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  // تقدّم استيراد الملف الكبير (عدد الصفوف المقروءة على دفعات) — null = مفيش استيراد.
  const [importRows, setImportRows] = useState<number | null>(null);

  async function handleFile(file: File, forcedSheet?: string) {
    setError(null);
    // ملف داتا كبير → قراءة على دفعات وتخزين على الجهاز (بدل فتحه في الذاكرة).
    if (onLargeFile && largeFileThresholdBytes != null && file.size > largeFileThresholdBytes && !forcedSheet) {
      setLoading(true);
      setImportRows(0);
      try {
        await onLargeFile(file, (rows) => setImportRows(rows));
        setLastFile(file);
        setPendingFile(null);
        setNeedsPassword(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذّر استيراد الملف الكبير.");
      } finally {
        setLoading(false);
        setImportRows(null);
      }
      return;
    }
    setLoading(true);
    try {
      const table = await parseExcelFile(file, undefined, forcedSheet);
      setLastFile(file);
      setFilePassword(undefined);
      setAllSheets(table.allSheetNames ?? []);
      setActiveSheet(table.sheetName ?? null);
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
      // بنفك التشفير **مرة واحدة** ونكمّل بالنسخة المفكوكة: التخزين وتبديل
      // الورقات و«فتح الشيت» كلهم بيشتغلوا بعدها فوراً من غير رحلة للسيرفر.
      const plain = await decryptExcelFile(pendingFile, password);
      const table = await parseExcelFile(plain);
      setLastFile(plain);
      setFilePassword(undefined);
      setAllSheets(table.allSheetNames ?? []);
      setActiveSheet(table.sheetName ?? null);
      onParsed(table, plain);
      setPendingFile(null);
      setNeedsPassword(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "كلمة المرور غير صحيحة.");
    } finally {
      setLoading(false);
    }
  }

  // «فتح الشيت» — يفتح الملف المحمّل في المربع بتطبيق الإكسيل (موبايل: FileOpener،
  // ويب: تنزيل)، عشان المندوب يقدر يشوف/يفتح الشيت اللي رافعه في أي خانة.
  async function handleOpenSheet() {
    if (!parsedFile) return;
    try { await openExcelBlob(parsedFile, parsedFile.name); } catch { /* ignore open/download failure */ }
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
      <div className={`p-3 flex flex-col gap-2 ${sky ? skyBox : loadedBox}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet size={18} className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="rtl-text truncate text-sm font-medium text-ink">{parsedFile.name}</p>
              <p className="text-xs text-muted">
                {parsedRowCount} صف
                {plateCount != null && plateCount > 0 && (
                  <> · <span className="font-bold text-primary">{plateCount.toLocaleString("en-US")} لوحة</span></>
                )}
                {activeSheet ? ` · ${activeSheet}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {/* «فتح الشيت» — متاح في كل الأوضاع لكل مربع رفع إكسيل */}
            <button
              onClick={handleOpenSheet}
              title="فتح الشيت"
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-primary transition"
            >
              <ExternalLink size={13} /> فتح
            </button>
            {fixed ? (
              <button
                onClick={handleDownloadOriginal}
                title="تنزيل"
                className="rounded-full border border-border p-1.5 text-muted hover:text-primary transition"
              >
                <Download size={14} />
              </button>
            ) : showReplaceButtons ? (
              <>
                <label
                  className={`cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-primary transition ${loading ? "pointer-events-none opacity-50" : ""}`}
                  title="استبدال الملف"
                >
                  {loading ? "جارٍ..." : "تغيير"}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsb,.xlsm,.ods,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={onClear}
                  title="حذف الملف نهائياً"
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-danger transition"
                >
                  مسح
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        {/* Sheet selector — shown only when file has multiple sheets */}
        {allSheets.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-primary/20">
            <span className="text-[11px] text-muted self-center">الورقة:</span>
            {allSheets.map((name) => (
              <button
                key={name}
                disabled={loading}
                onClick={async () => {
                  if (name === activeSheet || !lastFile) return;
                  setLoading(true);
                  try {
                    const table = await parseExcelFile(lastFile, filePassword, name);
                    setActiveSheet(name);
                    onParsed(table, lastFile);
                  } catch { /* ignore */ } finally {
                    setLoading(false);
                  }
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                  name === activeSheet
                    ? "bg-primary border-primary text-night font-bold"
                    : "border-border text-muted hover:text-primary"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-3 ${sky ? skyBox : "rounded-xl border border-dashed border-border bg-surface"}`}>
      <p className="mb-2 text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}

      <label
        className={`relative flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-3 text-sm text-muted transition hover:border-primary hover:text-primary ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload size={16} />
        {importRows != null
          ? `جاري التحضير... ${importRows.toLocaleString("en-US")} صف`
          : loading ? "جارٍ القراءة..." : "اختر ملف Excel"}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsb,.xlsm,.ods,.csv"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>

      {needsPassword && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-alert">
            <Lock size={13} />
            {loading
              ? "جاري فك تشفير الملف… ثواني وبيتفتح (مرة واحدة بس)"
              : "هذا الملف يبدو محميًا — أدخل كلمة المرور"}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة مرور الملف"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && password && !loading) handlePasswordConfirm(); }}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handlePasswordConfirm}
              disabled={loading || !password}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-night disabled:opacity-50"
            >
              {loading ? "جاري الفتح…" : "تأكيد"}
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
