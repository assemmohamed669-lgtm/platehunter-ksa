"use client";

/**
 * 🗂️ مربع «شيت السجلات» — صفحة الفرز و«صوت فقط».
 *
 * المالك (٢١ أكتوبر ٢٠٢٦): «المستخدم يشوف ان فيه شيت سجلات قدامه وبيفرز عليه وعدد اللوحات اللي فيه كذا بس اهم حاجه
 * ميقدرش يستبدل الشيت دة يقدر يفتحو او يشاركه عادي بس ميستبدلوش» · «خلي المربع دة فيه ميزة ان المشترك لو حب يخفيه
 * يقدر يخفيه والمربع نفسه يكون صغير ومعلم انه قاري السجلات تمام وان العدد كذا».
 *
 *  · **صغير افتراضياً**: سطر واحد «شيت السجلات · قاري ✅ · X لوحة» + سهم. دوسة ⇒ التفاصيل + فتح ومشاركة؛ دوسة تانية
 *    ⇒ يتخفى. البرنامج فاكر اختياره (على الموبايل).
 *  · الشيت = سجلات المندوب نفسه (`lib/recordsSheet.ts`) — بيتحدّث لوحده مع كل تصدير. **فتح ومشاركة بس**: مفيش رفع ولا
 *    تغيير ولا مسح.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Share2 } from "lucide-react";
import OpenDownloadButton from "@/components/OpenDownloadButton";
import { buildSpreadsheetBlob, shareExcelBlob } from "@/lib/excel";
import { recordsSheetStats, type RecordsTable } from "@/lib/recordsSheet";

const ar = (n: number) => n.toLocaleString("ar-EG");
const OPEN_KEY = "ph:recordsBox:open";

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
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch { /* مش متاح — صغير */ }
  }, []);
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* مش متاح */ }
      return next;
    });
  }
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

  const status = loading ? "بيتحمّل..." : table ? "قاري ✅" : "فاضي";
  const statusCls = loading ? "bg-alert/15 text-alert" : table ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-2 text-muted";

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5" dir="rtl">
      {/* السطر الصغير — دايماً ظاهر */}
      <button onClick={toggle} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-right">
        <ClipboardList size={15} className="shrink-0 text-emerald-600" />
        <span className="text-xs font-bold text-ink">شيت السجلات</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>{status}</span>
        {!loading && table && <span className="text-[11px] font-bold text-ink">{ar(st.plates)} لوحة</span>}
        <span className="mr-auto text-muted">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-emerald-500/20 px-3 pb-3 pt-2">
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
      )}
    </div>
  );
}
