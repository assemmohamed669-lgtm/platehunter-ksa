"use client";

export default function SortingError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col gap-3 py-10 text-center" dir="rtl">
      <p className="text-sm font-bold text-danger">حدث خطأ في صفحة الفرز</p>
      <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted font-mono text-left break-all">
        {error?.message || "unknown error"}
      </p>
      {error?.stack && (
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted font-mono text-left break-all whitespace-pre-wrap">
          {error.stack.split("\n").slice(0, 5).join("\n")}
        </p>
      )}
    </div>
  );
}
