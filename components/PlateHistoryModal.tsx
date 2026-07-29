"use client";

/**
 * PlateHistoryModal — نافذة «سجل السيارة»: مدة كونها مطلوبة، عدد ظهوراتها،
 * التواريخ (آخر ٥)، إجراءات المندوب السابقة، وأزرار تسجيل نتيجة جديدة.
 *
 * مكوّن عرض بحت — كل الحفظ بيتم في الصفحة عبر onSetStatus.
 */
import { X, Check, MapPinOff, History } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { describeHistory, isClosedStatus, type PlateHistoryEntry, type PlateStatus } from "@/lib/plateHistory";

const STATUS_LABEL: Record<PlateStatus, string> = {
  none: "—",
  taken: "سحبتها",
  notFound: "مش في الموقع",
  otherTook: "حد تاني سحبها",
  paid: "العميل سدّد",
  excluded: "مستبعدة",
};

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${String(y).slice(2)}`;
}

interface Props {
  plate: string;
  entry: PlateHistoryEntry | null;
  today: string;
  /** بيانات مختصرة عن السيارة للعرض في الترويسة (طراز/لون/بنك...). */
  subtitle?: string;
  /** الحي/العنوان الحالي من ملف الداتا. */
  location?: string;
  /** هل ظهرت في سجلات تشييكه (شافها بعينه) — وتاريخها لو معروف. */
  seenInChecks?: string | null;
  onSetStatus: (status: PlateStatus) => void;
  onClose: () => void;
}

export default function PlateHistoryModal({
  plate, entry, today, subtitle, location, seenInChecks, onSetStatus, onClose,
}: Props) {
  const desc = entry ? describeHistory(entry, today) : null;
  const toneCls = !desc || desc.tone === "new"
    ? "bg-surface-2 text-muted"
    : desc.tone === "warn" ? "bg-alert/15 text-alert" : "bg-danger/15 text-danger";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-t-2xl border border-border bg-surface sm:rounded-2xl">

        <div className="flex items-start justify-between gap-2 border-b border-border p-3">
          <div className="min-w-0">
            <PlateBadge value={plate} size="md" />
            {subtitle && <p className="rtl-text mt-1 truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 text-muted hover:text-ink transition" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className={`px-3 py-2.5 ${toneCls}`}>
          <p className="rtl-text text-sm font-bold">
            {desc
              ? (desc.months >= 1
                  ? `مطلوبة من ${desc.months} شهر · طلعت ${desc.count} مرات`
                  : `طلعت ${desc.count} مرات`)
              : "أول ظهور — مفيش سجل سابق"}
          </p>
          <p className="rtl-text mt-0.5 text-[11px]">
            {seenInChecks ? `ظهرت في تشييكك بتاريخ ${fmt(seenInChecks)}` : "عمرها ما ظهرت في تشييكك"}
          </p>
        </div>

        {entry && (entry.dates.length > 0 || (entry.actions?.length ?? 0) > 0) && (
          <div className="border-b border-border p-3">
            <p className="rtl-text mb-2 flex items-center gap-1 text-[11px] text-muted">
              <History size={12} /> السجل
            </p>
            <div className="flex flex-col gap-2.5">
              {entry.dates.map((d) => {
                const act = (entry.actions ?? []).find((a) => a.date === d);
                return (
                  <div key={d} className="flex gap-2">
                    <span className="w-[52px] shrink-0 text-[11px] text-muted">{fmt(d)}</span>
                    <div className="min-w-0">
                      <p className="rtl-text text-[13px] text-ink">
                        {d === entry.firstSeen ? "أول رصد" : "طلعت في الفرز"}
                      </p>
                      {act && act.status !== "none" && (
                        <p className={`rtl-text mt-0.5 text-[11px] ${isClosedStatus(act.status) ? "text-primary" : "text-alert"}`}>
                          {STATUS_LABEL[act.status]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {entry.dates.length === 0 && (
                <p className="rtl-text text-[11px] text-muted">
                  تفاصيل التواريخ القديمة اتقصّت (الملخص محفوظ: أول رصد {fmt(entry.firstSeen)})
                </p>
              )}
            </div>
            {(entry.notFoundCount ?? 0) > 0 && (
              <p className="rtl-text mt-2.5 border-t border-border pt-2 text-[11px] text-alert">
                رحتلها {entry.notFoundCount} مرات وماكانتش في الموقع — الموقع في الداتا غالباً قديم
              </p>
            )}
          </div>
        )}

        {location && (
          <div className="border-b border-border p-3">
            <p className="rtl-text text-[11px] text-muted">الموقع في الداتا</p>
            <p className="rtl-text mt-0.5 text-[13px] text-ink">{location}</p>
          </div>
        )}

        <div className="p-3">
          <p className="rtl-text mb-2 text-[11px] text-muted">
            سجّل النتيجة{entry?.status && entry.status !== "none" ? ` (الحالة حالياً: ${STATUS_LABEL[entry.status]})` : ""}
          </p>
          <div className="mb-1.5 flex gap-1.5">
            <button onClick={() => onSetStatus("taken")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-primary/50 bg-primary/15 py-2.5 text-[13px] font-bold text-primary transition hover:bg-primary/25">
              <Check size={15} /> سحبتها
            </button>
            <button onClick={() => onSetStatus("notFound")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2.5 text-[13px] text-ink transition hover:border-alert hover:text-alert">
              <MapPinOff size={15} /> مش في الموقع
            </button>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => onSetStatus("otherTook")}
              className="flex-1 rounded-lg border border-border py-2 text-[12px] text-muted transition hover:text-ink">حد تاني سحبها</button>
            <button onClick={() => onSetStatus("paid")}
              className="flex-1 rounded-lg border border-border py-2 text-[12px] text-muted transition hover:text-ink">العميل سدّد</button>
          </div>
          {entry?.status && entry.status !== "none" && (
            <button onClick={() => onSetStatus("none")}
              className="mt-1.5 w-full rounded-lg border border-border py-2 text-[12px] text-muted transition hover:text-danger">
              شيل الحالة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
