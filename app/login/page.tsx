"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, LogIn } from "lucide-react";
import { loginAgent } from "@/lib/auth";
import PlateBadge from "@/components/PlateBadge";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const reason = window.sessionStorage.getItem("pk_logout_reason");
    if (reason) {
      setError(reason);
      window.sessionStorage.removeItem("pk_logout_reason");
    }
    // Detect Supabase password recovery redirect (hash contains type=recovery)
    if (window.location.hash.includes("type=recovery")) {
      router.replace("/auth/reset-password");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور.");
      return;
    }

    setLoading(true);
    const result = await loginAgent(username, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.errorMessage ?? "حدث خطأ غير متوقع.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-night px-6 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <PlateBadge value="قنص1234" />
        <h1 className="text-2xl font-black tracking-tight text-ink">
          قناص اللوحات
        </h1>
        <p className="text-sm text-muted">PlateHunter KSA — تسجيل الدخول</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="surface-card w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <div className="mb-4">
          <label
            htmlFor="username"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            اسم المستخدم
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="مثال: agent01"
            className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={loading}
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 pl-11 text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-muted hover:text-ink"
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
        >
          <LogIn size={18} />
          {loading ? "جارٍ التحقق..." : "تسجيل الدخول"}
        </button>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
          <ShieldCheck size={32} className="shrink-0 text-primary" />
          <span>
            هذا الحساب مرتبط تلقائيًا بهذا الجهاز عند أول تسجيل دخول. لا
            يمكن استخدامه على جهاز آخر إلا بعد إعادة الضبط من الإدارة، وسيتم
            إنهاء أي جلسة أخرى مفتوحة لهذا الحساب فورًا.
          </span>
        </div>
      </form>
    </main>
  );
}
