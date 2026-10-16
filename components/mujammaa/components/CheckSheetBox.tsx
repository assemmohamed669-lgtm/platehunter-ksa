/**
 * ==========================================================================
 *  🧮 صندوق ملف التشييك — اللوحات المطلوبة (قراية بس)
 * ==========================================================================
 *  نفس شكل «شيت البنك» بتاع المعمل، بس **من غير رفع ولا مسح**: في قناص ملف
 *  التشييك بيترفع ويتغيّر ويتمسح من صفحة التشييك بس، وكل الصفحات بتقراه.
 */
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import type { UseAppCheckSheet } from "../hooks/useAppCheckSheet";

export default function CheckSheetBox({ bank }: { bank: UseAppCheckSheet }) {
  const { sheet, loading, files } = bank;
  return (
    <div className="card">
      <div className="card-title justify-between">
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-sky-300" />
          ملف التشييك — اللوحات المطلوبة
        </span>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {!sheet ? (
        <p className="text-xs leading-relaxed text-slate-400">
          {loading
            ? "بيقرا ملف التشييك…"
            : "مافيش ملف تشييك على الجهاز — ارفعه من صفحة «تشييك». التفريغ شغّال من غيره، بس مش هيقول لك اللوحة مطلوبة ولا لأ."}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip bg-emerald-500/20 text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              {sheet.plates.length.toLocaleString("ar-EG")} لوحة مطلوبة
            </span>
            {files > 1 && (
              <span className="chip bg-white/10 text-slate-300">
                {files.toLocaleString("ar-EG")} ملفات
              </span>
            )}
            {sheet.skipped > 0 && (
              <span className="chip bg-amber-500/20 text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {sheet.skipped} صف بلا لوحة
              </span>
            )}
          </div>
          <div className="rounded-lg bg-white/[0.04] p-2 text-xs text-slate-300">
            <div className="truncate">
              <span className="text-slate-500">الملف: </span>
              {sheet.fileName}
            </div>
            <div className="mt-1">
              <span className="text-slate-500">عمود اللوحة: </span>
              <span className="font-bold text-sky-200">{sheet.plateColumn}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">التغيير والمسح من صفحة «تشييك».</p>
        </div>
      )}
    </div>
  );
}
