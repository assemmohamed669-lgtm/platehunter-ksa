"use client";

/**
 * 🗂️ مربع «شيت السجلات» — صفحة الفرز و«صوت فقط».
 *
 * المالك (٢١ أكتوبر ٢٠٢٦): «المستخدم يشوف ان فيه شيت سجلات قدامه وبيفرز عليه وعدد اللوحات اللي فيه كذا بس اهم حاجه
 * ميقدرش يستبدل الشيت دة يقدر يفتحو او يشاركه عادي بس ميستبدلوش».
 *
 * الشيت = سجلات المندوب نفسه (`lib/recordsSheet.ts`) — بيتحدّث لوحده مع كل تصدير. **فتح ومشاركة بس**: مفيش رفع ولا
 * تغيير ولا مسح (مش ملف بيترفع — ده شغله).
 */
import { useState } from "react";
import { ClipboardList, Share2 } from "lucide-react";
import OpenDownloadButton from "@/components/OpenDownloadButton";
import { buildSpreadsheetBlob, shareExcelBlob } from "@/lib/excel";
import { recordsSheetStats, type RecordsTable } from "@/lib/recordsSheet";

const ar = (n: number) => n.toLocaleString("ar-EG");

/** الإكسيل: كل الصفوف بنفس أعمدة الشيت (الفاضي بيفضل فاضي). */
function buildFile(table: RecordsTable): { blob: Blob; name: string } {
  const rows = table.rows.map((r) => Object.fromEntries(table.headers.map((h) => [h, r[h] ?? ""])));
  const { blob, ext } = buildSpreadsheetBlob(rows, "شيت السجلات");
  const d = new Date();
  const stamp = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  return { blob, name: `شيت السجلات ${stamp}.${ext}` };
}

export default function RecordsSheetBox({ table, loading }: {
  /** شيت السجلات — `null` = مفيش سجلات (أو لسه بيتحمّل) */
  table: RecordsTable | null;
  loading: boolean;
}) {
  const [sharing, setSharing] = useState(false);
  const st = recordsSheetStats(table);

  async function share() {
    if (!table) return;
    setSharing(true);
    try {
      const { blob, name } = buildFile(table);
      await shareExcelBlob(blob, name, "شيت السجلات", { keepName: true });
    } catch (e) {
      alert((e as { message?: string })?.message ?? "تعذّرت المشاركة");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <ClipboardList size={16} className="text-emerald-600" /> شيت السجلات
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${loading ? "bg-alert/15 text-alert" : table ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-2 text-muted"}`}>
          {loading ? "بيتحمّل..." : table ? "قاري ✅" : "فاضي"}
        </span>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted">سجلاتك بتتحمّل من الموبايل — ثانية واحدة.</p>
      ) : table ? (
        <>
          <p className="text-[12px] font-bold text-ink">{ar(st.rows)} صف · {ar(st.plates)} لوحة</p>
          <p className="text-[11px] text-muted">كل سجلاتك بيدخل في الفرز — وبيتحدّث لوحده مع كل تصدير.</p>
          <div className="flex gap-2">
            <OpenDownloadButton build={() => buildFile(table)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2 text-xs font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60" />
            <button onClick={() => void share()} disabled={sharing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2 text-xs font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60">
              <Share2 size={14} /> {sharing ? "..." : "مشاركة"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted">مفيش سجلات لسه — صدّر لوحات وهتظهر هنا لوحدها.</p>
      )}
    </div>
  );
}
