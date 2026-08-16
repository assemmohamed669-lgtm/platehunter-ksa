"use client";

/**
 * قائمة اختيار نوع السيارة بحروف مختصرة (المندوب بيعرفها):
 *   و = ونيت • ف = فان • ت = تاكسي • م = ملاكي • ش = شاص …
 * بتظهر كـ«سهم» في عمود النوع؛ المندوب يختار الحرف، فيتخزّن الحرف قدام السيارة
 * ويطلع زي ما هو في التصدير. المنطق الخالص في lib/vehicleType.
 */

import { VEHICLE_TYPE_LABELS, typeToCode } from "@/lib/vehicleType";

// التلميح بيتولّد من نفس القايمة — كان مكتوب بالإيد وفضل قديم لما اتضاف
// «مو (موتوسيكل)»، فأي نوع جديد دلوقتي بيظهر فيه لوحده.
const TYPES_HINT = VEHICLE_TYPE_LABELS
  .map(([code, name]) => (code === name ? code : `${code} = ${name}`))
  .join(" • ");

export default function VehicleTypeSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  return (
    <select
      value={typeToCode(value)}
      onChange={(e) => onChange(e.target.value)}
      title={TYPES_HINT}
      style={{ direction: "rtl" }}
      className={className ?? "rounded border border-border bg-surface-2 px-2 py-1 text-ink outline-none focus:border-primary"}
    >
      <option value="">—</option>
      {/* القيمة المخزّنة = الحرف بس؛ الاسم بين قوسين للعرض عشان يعرف معناه */}
      {VEHICLE_TYPE_LABELS.map(([code, name]) => (
        <option key={code} value={code}>{code === name ? code : `${code} (${name})`}</option>
      ))}
    </select>
  );
}
