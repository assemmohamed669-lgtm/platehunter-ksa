/**
 * 📝 ورقة القراية — اللي المندوب بيقرا منها (٣٠ سبتمبر ٢٠٢٦)
 *
 * التقرير الشامل محتاج «قلت إيه» عشان يقول «قلت كام وطلع كام». كل سطر = لوحة
 * وبعدها النوع و/أو الملاحظة («حبك1234 فان مركونه»). بتتحفظ على الجهاز
 * (بتفضل بعد الخروج من الصفحة) ومابتتمسحش غير بزرّها.
 */
import { useMemo, useRef } from "react";
import { ClipboardList, Trash2, Upload } from "lucide-react";
import { parseReadingSheet } from "../lib/batchReport";

export const READING_SHEET_KEY = "lab:batch:readingSheet";

export function loadReadingSheet(): string {
  try {
    return localStorage.getItem(READING_SHEET_KEY) || "";
  } catch {
    return "";
  }
}

export default function ReadingSheetBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => parseReadingSheet(value), [value]);
  const nTypes = rows.filter((r) => r.type).length;
  const nNotes = rows.filter((r) => r.note).length;

  const set = (v: string) => {
    onChange(v);
    try {
      localStorage.setItem(READING_SHEET_KEY, v);
    } catch {
      /* المتصفح رافض التخزين — القيمة بتفضل في الصفحة */
    }
  };

  return (
    <div className="card">
      <div className="card-title justify-between">
        <span className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> ورقة القراية (للتقرير)
        </span>
        <span className="text-xs text-slate-400">
          {rows.length ? `${rows.length} لوحة · ${nTypes} نوع · ${nNotes} ملاحظة` : "فاضية"}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        الصق اللوحات اللي هتقولها — كل لوحة في سطر، وبعدها النوع أو الملاحظة لو هتقولها
        (مثال: «حبك1234 فان مركونه»). التقرير بيقارن اللي طلع بيها: قلت كام وطلع كام،
        اللي ماطلعش وسببه، واللي اتألّف.
      </p>
      <textarea
        className="mt-2 h-32 w-full rounded-xl bg-black/40 p-3 text-sm leading-relaxed text-slate-200"
        dir="rtl"
        placeholder={"حبك1234 فان\nدرن1452 ونيت مركونه\nسصع5555"}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> من ملف (txt / csv / tsv)
        </button>
        {value && (
          <button className="btn-ghost btn-sm" onClick={() => set("")}>
            <Trash2 className="h-3.5 w-3.5" /> فضّي الورقة
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.tsv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) set(await f.text());
          }}
        />
      </div>
    </div>
  );
}
