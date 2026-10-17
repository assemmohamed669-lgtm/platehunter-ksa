/**
 * ==========================================================================
 *  صندوق الأخطاء — في كل صفحة على حده
 * ==========================================================================
 *  بيعرض أخطاء الصفحة دي بس، الأحدث فوق، وكل خطأ بتفاصيله الخام
 *  اللي جاية من الأداة نفسها (بتفتح بضغطة على «التفاصيل الخام»).
 */

import { useSyncExternalStore, useState } from "react";
import { AlertTriangle, ChevronDown, Copy, Trash2 } from "lucide-react";
import type { ErrorLog, LoggedError } from "../lib/errorLog";

export interface ErrorLogBoxProps {
  errorLog: ErrorLog;
  title?: string;
}

export default function ErrorLogBox({
  errorLog,
  title = "أخطاء هذه الصفحة",
}: ErrorLogBoxProps) {
  const items = useSyncExternalStore(errorLog.subscribe, errorLog.getSnapshot);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(errorLog.toText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* المتصفح رفض النسخ — مش مشكلة تستاهل خطأ */
    }
  };

  return (
    <div className="card">
      <div className="card-title justify-between">
        <span className="flex items-center gap-2">
          <AlertTriangle
            className={`h-4 w-4 ${items.length ? "text-red-400" : "text-slate-500"}`}
          />
          {title}
          <span
            className={`chip ${
              items.length ? "bg-red-500/20 text-red-200" : "bg-white/10 text-slate-400"
            }`}
          >
            {items.length}
          </span>
        </span>

        {items.length > 0 && (
          <span className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5" />
              {copied ? "اتنسخ ✓" : "انسخ الكل"}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => errorLog.clear()}>
              <Trash2 className="h-3.5 w-3.5" />
              مسح
            </button>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
          مافيش أخطاء. أي مشكلة في المفتاح أو الميك أو أي أداة هتظهر هنا بسببها
          الحقيقي.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ErrorRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorRow({ item }: { item: LoggedError }) {
  const [open, setOpen] = useState(false);
  const time = new Date(item.at).toLocaleTimeString("ar-EG");

  return (
    <li className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-red-500/20 text-red-100">{item.source}</span>
        {item.status ? (
          <span className="chip bg-white/10 text-slate-300 ltr-nums">
            كود {item.status}
            {statusHint(item.status) && (
              <span className="opacity-80"> — {statusHint(item.status)}</span>
            )}
          </span>
        ) : null}
        <span className="text-slate-500">{time}</span>
      </div>

      <p className="mt-1.5 break-words text-sm text-red-100">{item.message}</p>

      {item.detail !== undefined && (
        <>
          <button
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
            />
            التفاصيل الخام من الأداة
          </button>
          {open && (
            <pre
              dir="ltr"
              className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-black/50 p-2 text-[11px] leading-relaxed text-slate-300"
            >
              {typeof item.detail === "string"
                ? item.detail
                : JSON.stringify(item.detail, null, 2)}
            </pre>
          )}
        </>
      )}
    </li>
  );
}

/** ترجمة أكواد الحالة الشائعة لسبب مفهوم */
function statusHint(status: number): string {
  switch (status) {
    case 400:
      return "طلب غير صالح (موديل أو لغة غير مدعومة؟)";
    case 401:
      return "المفتاح غلط أو منتهي";
    case 402:
      return "مطلوب دفع / الرصيد خلص";
    case 403:
      return "المفتاح مالهوش صلاحية على العملية دي";
    case 404:
      return "الموديل مش موجود بالاسم ده";
    case 413:
      return "الملف أكبر من الحد المسموح";
    case 429:
      return "تعدّيت حد الطلبات — استنى شوية";
    case 500:
    case 502:
    case 503:
      return "مشكلة عند مزوّد الخدمة نفسه";
    default:
      return "";
  }
}
