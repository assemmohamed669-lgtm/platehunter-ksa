"use client";

// Error boundary for the whole authenticated app. When any page throws — a
// transient render crash, or a component dying under memory pressure on a weak
// device — the user gets a recoverable screen with a retry button INSTEAD of a
// blank white screen that forces them to kill and reopen the app.
import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it for debugging without crashing the shell.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15">
        <AlertTriangle size={30} className="text-danger" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-ink">حصل خطأ مؤقّت</h1>
        <p className="mt-2 text-sm text-muted">
          الصفحة واجهت مشكلة. جرّب تعيد المحاولة — مش محتاج تقفل التطبيق.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-night transition active:scale-95"
        >
          <RotateCw size={16} /> إعادة المحاولة
        </button>
        <a
          href="/sorting"
          className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-5 py-3 text-sm font-bold text-ink transition active:scale-95"
        >
          <Home size={16} /> الرئيسية
        </a>
      </div>
    </div>
  );
}
