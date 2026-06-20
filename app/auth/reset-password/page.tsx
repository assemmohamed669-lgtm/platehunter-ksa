"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError("حدث خطأ أثناء تحديث كلمة المرور. حاول مرة أخرى.");
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-night px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h1 className="mb-6 text-center text-xl font-bold text-ink">
          تعيين كلمة مرور جديدة
        </h1>

        {done ? (
          <p className="text-center text-sm text-primary">
            ✅ تم تحديث كلمة المرور — جارٍ التوجيه...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted">كلمة المرور الجديدة</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {error && (
              <p className="text-center text-xs text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-primary py-3 text-sm font-bold text-night disabled:opacity-60"
            >
              {loading ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
