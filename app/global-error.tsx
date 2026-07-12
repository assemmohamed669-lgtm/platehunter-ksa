"use client";

// Root-level error boundary — the last line of defence. It catches crashes in
// the root layout itself (where the per-segment error.tsx can't reach) and must
// render its own <html>/<body>. Without it, such a crash shows a blank white
// page and the only recovery is force-closing the app.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: 24,
          textAlign: "center",
          background: "#0b1220",
          color: "#e5e9f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>حصل خطأ في التطبيق</h1>
        <p style={{ fontSize: 14, color: "#9aa5b5", margin: 0 }}>
          جرّب تعيد التحميل. لو المشكلة اتكررت اقفل التطبيق وافتحه تاني.
        </p>
        <button
          onClick={() => reset()}
          style={{
            border: "none",
            borderRadius: 12,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            color: "#0b1220",
            background: "#6ba3e8",
          }}
        >
          إعادة التحميل
        </button>
      </body>
    </html>
  );
}
