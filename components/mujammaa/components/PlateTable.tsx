/**
 * ══════════════════════════════════════════════════════════════════════
 *  PlateTable — عرض اللوحات المنطوقة في جدول بأعمدة بيانات السيارة
 * ══════════════════════════════════════════════════════════════════════
 *
 *  🗣️ **طلب المالك:** اللوحات اللي بتطلع بالصوت تظهر في شيت بأعمدة، كل عمود
 *  فيه بيانات السيارة. بديل عرض البطاقات في الصفحتين (الفوري + المجمع).
 *
 *  بيحافظ على وظائف البطاقة الأساسية:
 *   - **تنبيه المطلوبة**: الصف بيتلوّن أحمر + زر «تم» يوقّف الصفّارة.
 *   - **التعديل**: زر قلم يفتح `PlateEditor` في صف ممتد تحت.
 *   - **الحذف** والوقت والحالة.
 *
 *  **وضع الفوري (`onAnnotate` موجود):** بيضيف أعمدة المندوب — النوع (منسدلة)،
 *  الحي (تلقائي من GPS، قابل للتعديل)، ملاحظة (قلم)، وGPS (دبوس لكل لوحة).
 *  المجمع من غير `onAnnotate` بيفضل بنفس أعمدته بالظبط.
 *
 *  الأعمدة والخلايا من `plateTable.ts` (منطق مختبَر). بيانات السيارة بتظهر
 *  للمطلوبة بس؛ العادية أعمدتها فاضية — فرق واضح بنظرة.
 */
import { Fragment, useState } from "react";
import { Copy, Pencil, Trash2, Check, X, MapPin } from "lucide-react";
import PlateBadge from "./PlateBadge";
import PlateEditor from "./PlateEditor";
import { MatchChip, StageChip } from "./Chips";
import type { BankSheet } from "../lib/bankSheet";
import { type PlateEntry, VEHICLE_TYPE_KINDS } from "../lib/plateEntry";
import { pinLink } from "../lib/gps";
import { plateDetailHeaders, buildPlateRow, tierCounts } from "../lib/plateTable";

export interface PlateTableProps {
  entries: PlateEntry[];
  sheet: BankSheet | null;
  editingId?: string | null;
  onEdit?: (id: string) => void;
  onEditChange?: (id: string, next: { letters?: string[]; digits?: string }) => void;
  onEditClose?: () => void;
  onDelete?: (id: string) => void;
  /** يوقّف صفّارة المطلوبة — الفوري بس */
  onStopSiren?: () => void;
  /**
   * يعدّل حقول المندوب (نوع/حي/ملاحظة). وجوده بيفعّل **وضع الفوري**:
   * أعمدة النوع/الحي/الملاحظة/GPS بتظهر. غيابه = وضع المجمع (بلا الأعمدة دي).
   */
  onAnnotate?: (id: string, patch: { vehicleType?: string; neighborhood?: string; note?: string }) => void;
}

type EditField = "neighborhood" | "note";

export default function PlateTable({
  entries,
  sheet,
  editingId = null,
  onEdit,
  onEditChange,
  onEditClose,
  onDelete,
  onStopSiren,
  onAnnotate,
}: PlateTableProps) {
  const headers = plateDetailHeaders(sheet);
  const tiers = tierCounts(entries);
  const fieldMode = !!onAnnotate;

  // تحرير خلية حي/ملاحظة بالقلم (خلية واحدة في المرة)
  const [editCell, setEditCell] = useState<{ id: string; field: EditField } | null>(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (id: string, field: EditField, current: string) => {
    setEditCell({ id, field });
    setEditVal(current);
  };
  const commitEdit = () => {
    if (editCell && onAnnotate) onAnnotate(editCell.id, { [editCell.field]: editVal });
    setEditCell(null);
    setEditVal("");
  };
  const cancelEdit = () => {
    setEditCell(null);
    setEditVal("");
  };

  /** خلية نص قابلة للتحرير بالقلم (حي/ملاحظة) */
  const editableCell = (entry: PlateEntry, field: EditField, placeholder: string) => {
    const editing = editCell?.id === entry.id && editCell.field === field;
    const value = field === "neighborhood" ? entry.neighborhood : entry.note;
    if (editing) {
      return (
        <span className="flex items-center gap-1">
          <input
            dir="rtl"
            autoFocus
            className="qx-field w-24 rounded-md px-1.5 py-1 text-xs"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
          />
          <button className="btn-ghost btn-sm px-1" onClick={commitEdit} title="حفظ">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button className="btn-ghost btn-sm px-1" onClick={cancelEdit} title="إلغاء">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      );
    }
    return (
      <button
        className="flex items-center gap-1 text-right hover:opacity-80"
        onClick={() => startEdit(entry.id, field, value ?? "")}
        title="اكتب"
      >
        <span className={value ? "" : "text-slate-600"}>{value || placeholder}</span>
        <Pencil className="h-3 w-3 shrink-0 opacity-50" />
      </button>
    );
  };

  return (
    <div className="overflow-x-auto">
      {/* ملخّص الدرجات — عشان «محتاجة نظرة» ماتبانش كأنها غلطات كتير */}
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <span className="chip bg-emerald-500/20 text-emerald-200">مؤكّدة {tiers.high}</span>
        {tiers.check > 0 && (
          <span className="chip bg-amber-500/20 text-amber-200"
            title="المحرّكان اختلفوا وأخدنا الأقوى — غالباً صح، بصّة سريعة">
            محتاجة نظرة {tiers.check}
          </span>
        )}
        {tiers.weak > 0 && (
          <span className="chip bg-red-500/20 text-red-200"
            title="شكل غلط أو بلا مراجعة — دي المشكوك فيها فعلاً">
            شكلها ناقص {tiers.weak}
          </span>
        )}
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-right text-xs text-slate-400">
            <th className="p-2 font-medium">اللوحة</th>
            <th className="p-2 font-medium">الحالة</th>
            {fieldMode ? (
              <>
                <th className="p-2 font-medium">النوع</th>
                <th className="p-2 font-medium">الحي</th>
                <th className="p-2 font-medium">ملاحظة</th>
                <th className="p-2 font-medium">GPS</th>
              </>
            ) : (
              headers.map((h) => (
                <th key={h} className="whitespace-nowrap p-2 font-medium">
                  {h}
                </th>
              ))
            )}
            <th className="p-2 font-medium">الوقت</th>
            <th className="p-2 font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const row = buildPlateRow(entry, headers);
            const r = entry.review;
            const wanted = row.status === "wanted";
            const tone = wanted ? "wanted" : "normal";
            const colSpan = 4 + (fieldMode ? 4 : headers.length);
            const gps = pinLink(entry.pin);

            return (
              <Fragment key={entry.id}>
                <tr
                  className={`border-b border-white/5 align-middle ${
                    wanted ? "bg-red-500/10" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <td className="p-2">
                    <span className="flex items-center gap-1.5">
                      <PlateBadge letters={r.letters} digits={r.digits} size="sm" tone={tone} />
                      {onEdit && (
                        <button
                          className="btn-ghost btn-sm px-1 text-sky-300"
                          onClick={() => onEdit(entry.id)}
                          title="عدّل اللوحة لو طلعت غلط"
                          aria-label="عدّل اللوحة"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-2">
                    <span className="flex flex-wrap items-center gap-1">
                      <MatchChip match={entry.match} />
                      {entry.stage && (
                        <StageChip stage={r.manuallyEdited ? "edited" : entry.stage} />
                      )}
                    </span>
                  </td>
                  {fieldMode ? (
                    <>
                      <td className="whitespace-nowrap p-2">
                        <select
                          className="qx-field rounded-md px-1 py-1 text-xs"
                          value={entry.vehicleType ?? ""}
                          onChange={(e) => onAnnotate?.(entry.id, { vehicleType: e.target.value })}
                        >
                          <option value="">—</option>
                          {/* 🔴 **الأنواع بس** (طلب المالك ٩ سبتمبر ٢٠٢٦:
                              «كل واحدة في عمودها»). الحالة والمكان مكانهم
                              عمود «ملاحظة» — وهو حر فالمندوب يكتب فيه أو
                              الشاهد يملاه تلقائي. */}
                          {VEHICLE_TYPE_KINDS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap p-2 text-xs">
                        {editableCell(entry, "neighborhood", "— الحي")}
                      </td>
                      <td className="whitespace-nowrap p-2 text-xs">
                        {editableCell(entry, "note", "— ملاحظة")}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        {gps ? (
                          <a
                            href={gps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="qx-accent-tx inline-flex items-center gap-0.5 text-xs hover:underline"
                            title="افتح الموقع"
                          >
                            <MapPin className="h-3.5 w-3.5" /> خريطة
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </>
                  ) : (
                    row.cells.map((c, i) => (
                      <td
                        key={headers[i]}
                        className={`whitespace-nowrap p-2 ${c ? "text-slate-200" : "text-slate-600"}`}
                      >
                        {c || "—"}
                      </td>
                    ))
                  )}
                  <td className="ltr-nums whitespace-nowrap p-2 text-xs text-slate-500">
                    {new Date(entry.capturedAt).toLocaleTimeString("ar-EG")}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    <span className="flex justify-end gap-1">
                      {wanted && onStopSiren && (
                        <button
                          className="btn-ghost btn-sm bg-red-500/20 text-red-100"
                          onClick={onStopSiren}
                          title="وقّف الصفّارة"
                        >
                          تم
                        </button>
                      )}
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => navigator.clipboard?.writeText(r.plate)}
                        title="انسخ"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {onEdit && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => onEdit(entry.id)}
                          title="تعديل"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => onDelete(entry.id)}
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {editingId === entry.id && onEditChange && (
                  <tr>
                    <td colSpan={colSpan} className="p-2">
                      <PlateEditor
                        key={r.plate}
                        review={r}
                        onChange={(next) => onEditChange(entry.id, next)}
                        onClose={() => onEditClose?.()}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
