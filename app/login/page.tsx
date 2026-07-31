"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, LogIn, CalendarClock, MessageCircle } from "lucide-react";
import { loginAgent } from "@/lib/auth";
import PlateBadge from "@/components/PlateBadge";

const ADMIN_WHATSAPP = "971542482545";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // اشتراك مفصول → بنعرض بلوك خاص فيه زر تواصل بدل رسالة خطأ عادية.
  const [expired, setExpired] = useState(false);
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
    setExpired(false);

    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور.");
      return;
    }

    setLoading(true);
    const result = await loginAgent(username, password);
    setLoading(false);

    if (!result.ok) {
      if (result.errorCode === "SUBSCRIPTION_EXPIRED") { setExpired(true); return; }
      setError(result.errorMessage ?? "حدث خطأ غير متوقع.");
      return;
    }

    router.replace("/sorting");
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
            الإيميل
          </label>
          <input
            id="username"
            type="email"
            dir="ltr"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@example.com"
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

        {/* اشتراك مفصول: رسالة واضحة + زر يكلّم الإدارة لطلب التمديد. */}
        {expired ? (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-danger">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
              <CalendarClock size={16} className="shrink-0" />
              تم فصل الخدمة عن هذا الحساب
            </div>
            <p className="text-xs leading-relaxed">
              تم إيقاف الخدمة لعدم دفع الاشتراك. لإعادة تشغيلها برجاء التواصل مع الإدارة لطلب التمديد.
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed opacity-90">
              جميع سجلاتك محفوظة ولن يتم مسحها — وبمجرد الدفع وتسجيل الدخول ستجدها كما هي.
            </p>
            <a
              href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
                "السلام عليكم، تم فصل الخدمة عن حسابي في تطبيق قناص اللوحات وأرغب في تجديد الاشتراك لإعادة تشغيلها."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-bold text-night transition active:scale-95"
            >
              <MessageCircle size={16} /> تواصل مع الإدارة لطلب التمديد
            </a>
          </div>
        ) : error ? (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
        >
          <LogIn size={18} />
          {loading ? "جارٍ التحقق..." : "تسجيل الدخول"}
        </button>

        <a
          href="https://wa.me/971542482545?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D9%86%D8%B3%D9%8A%D8%AA%20%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA%20%D8%A7%D9%84%D8%AF%D8%AE%D9%88%D9%84%20%D9%84%D8%AA%D8%B7%D8%A8%D9%8A%D9%82%20%D9%82%D9%86%D8%A7%D8%B5%20%D8%A7%D9%84%D9%84%D9%88%D8%AD%D8%A7%D8%AA."
          target="_blank" rel="noopener noreferrer"
          className="mt-4 block text-center text-xs text-primary underline"
        >
          نسيت الإيميل أو كلمة المرور؟ تواصل مع الإدارة
        </a>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
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
