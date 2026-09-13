"use client";

/**
 * خانة نص قابلة للتعديل جوّه جدول — دوس تكتب، Enter/خروج التركيز يحفظ.
 * مشتركة بين شيت السجلات وسجلات المجموعة عشان الشكل والسلوك واحد.
 */
import { useState, useEffect } from "react";

export default function EditableTextCell({
  value, onSave, placeholder, disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);

  if (disabled) return <span className="text-ink">{value || "—"}</span>;

  return (
    <input
      dir="rtl"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full min-w-[90px] rounded border border-transparent bg-transparent px-1 py-0.5 text-ink outline-none placeholder:text-muted/50 focus:border-primary focus:bg-surface-2"
    />
  );
}
