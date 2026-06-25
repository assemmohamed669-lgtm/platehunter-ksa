"use client";

import { useState, useEffect } from "react";
import { ScanLine, Camera, Type, Mic, ChevronDown } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord } from "@/lib/idb";
import { type ExcelTable } from "@/lib/excel";

export default function InstantCheckPage() {
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkColsOpen, setCheckColsOpen] = useState(false);

  useEffect(() => {
    getUploadedFile("local", "check").then((rec) => {
      if (rec) {
        setCheckTable({ headers: rec.headers, rows: rec.rows });
        setCheckFile(
          new File([rec.fileBlob ?? new Blob()], rec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          })
        );
      }
    }).catch(() => {});
  }, []);

  async function handleParsed(table: ExcelTable, file: File) {
    const record: UploadedFileRecord = {
      key: "local:check",
      agentId: "local",
      slot: "check",
      fileName: file.name,
      headers: table.headers,
      rows: table.rows,
      uploadedAt: new Date().toISOString(),
      fileBlob: file,
    };
    await saveUploadedFile(record);
    setCheckTable(table);
    setCheckFile(file);
    setCheckColsOpen(false);
  }

  async function handleClear() {
    await deleteUploadedFile("local", "check");
    setCheckTable(null);
    setCheckFile(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">التشييك</h1>
        <p className="text-xs text-muted">القائمة المرجعية للفرز الجديد</p>
      </div>

      {/* ── ملف التشييك ── */}
      <div className="flex flex-col gap-2">
        <FileUploadBox
          title="ملف التشييك"
          hint="ارفع ملف الإحالة الكامل كمرجع — يُستخدم في «الفرز الجديد» بصفحة الفرز"
          parsedFile={checkFile}
          parsedRowCount={checkTable?.rows.length ?? null}
          onParsed={handleParsed}
          onClear={handleClear}
          showReplaceButtons
        />
        {checkTable && (
          <div className="rounded-xl border border-border bg-surface">
            <button
              onClick={() => setCheckColsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
            >
              <span>الأعمدة ({checkTable.headers.length})</span>
              <ChevronDown
                size={14}
                className={`text-muted transition-transform duration-200 ${checkColsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {checkColsOpen && (
              <div className="border-t border-border px-3 pb-3 pt-2">
                <div className="flex flex-wrap gap-2">
                  {checkTable.headers.map((h) => (
                    <span key={h} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── قيد التطوير ── */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-dark text-primary">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">تشييك فوري — قيد التطوير</h2>
            <p className="text-xs text-muted">الجزء القادم</p>
          </div>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <div className="flex items-start gap-2">
            <Camera size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>تصوير اللوحة بالكاميرا وقراءتها بالذكاء الاصطناعي (ANPR) ومطابقتها فورًا.</span>
          </div>
          <div className="flex items-start gap-2">
            <Type size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>إدخال يدوي سريع لرقم اللوحة مع بحث فوري في المحفظة.</span>
          </div>
          <div className="flex items-start gap-2">
            <Mic size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>اضغط واتكلم (Push to Talk) لقول عدة لوحات متتالية ومطابقتها دفعة واحدة.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
