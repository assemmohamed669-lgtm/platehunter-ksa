"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Menu, MessageCircle, LogOut, CalendarClock, RefreshCw } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import SessionGuard from "@/components/SessionGuard";
import BottomNav from "@/components/BottomNav";
import PlateIcon from "@/components/PlateIcon";
import BackButton from "@/components/BackButton";
import WantedAlertOverlay from "@/components/WantedAlertOverlay";
import AppMenu from "@/components/AppMenu";
import UpdateBanner from "@/components/UpdateBanner";
import NoticeBanner from "@/components/NoticeBanner";
import PollBanner from "@/components/PollBanner";
import AgentPresenceReporter from "@/components/AgentPresenceReporter";
import { logoutAgent } from "@/lib/auth";
import { initAppearance } from "@/lib/appSettings";
import { applyServiceKeys } from "@/lib/voiceKeys";
import { fetchSharedDeepgramKey } from "@/lib/sharedVoiceKey";
import { getDeepgramKey, setDeepgramKey } from "@/lib/deepgramKey";
import { supabase } from "@/lib/supabaseClient";
import { subStatus, isCutOff, GRACE_DAYS, subscriptionNotice, type SubInfo } from "@/lib/subscription";
import { APP_VERSION, refreshAppNow } from "@/lib/appVersion";

const ADMIN_WHATSAPP = "971542482545";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cutOff, setCutOff] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const isHome = pathname === "/sorting";

  // Apply the saved appearance (font size / colours) app-wide on every load.
  useEffect(() => { initAppearance(); }, []);

  // اطلب «تخزين دائم» من المتصفّح/الـWebView — يمنع الأندرويد من مسح داتا التطبيق
  // (جلسة الدخول في localStorage + سجلات التشييك في IndexedDB) تلقائياً وقت ضغط
  // المساحة. ده بيعالج تسجيل الخروج المتكرر وفقدان السجلات معاً. آمن ومايطلبش إذن
  // في أغلب الأجهزة؛ لو مش مدعوم بيتجاهل بهدوء.
  useEffect(() => {
    (async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.storage?.persist) {
          const already = await navigator.storage.persisted?.();
          if (!already) await navigator.storage.persist();
        }
      } catch { /* غير مدعوم — نتجاهل */ }
    })();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, subscription_end, is_trial, service_keys")
        .eq("id", data.user.id)
        .single();
      setIsAdmin(profile?.role === "admin");
      // مفاتيح الصوت اللي حطّها الأدمن للمندوب تنزل للجهاز (البروفايل مصدر الحقيقة).
      if (profile && (profile as { service_keys?: unknown }).service_keys != null) {
        applyServiceKeys((profile as { service_keys?: unknown }).service_keys);
      }
      // مفتاح Deepgram المشترك (اللي حطّه السوبر أدمن مرة واحدة) — يُطبَّق لو الجهاز
      // مفيهوش مفتاح خاص، فكل المناديب ياخدوه تلقائياً بدون ما كل واحد يدخّله.
      fetchSharedDeepgramKey().then((shared) => {
        if (shared && !getDeepgramKey()) setDeepgramKey(shared);
      });
      if (profile && profile.role === "agent") {
        // حساب التجربة يتقطع فوراً بعد نهايته (بدون فترة سماح).
        const grace = profile.is_trial ? 0 : GRACE_DAYS;
        setIsTrial(!!profile.is_trial);
        setSub(subStatus(profile.subscription_end, grace));
        setCutOff(isCutOff(profile.subscription_end, profile.is_active, grace));
      }
      // heartbeat — «آخر ظهور» + نسخة البرنامج اللي المندوب شغّال بيها (للأدمن).
      // لو نسخة الـ RPC اللي بتاخد النسخة لسه ماتّشغّلتش (SQL)، بنرجع للنداء
      // القديم بدون بارامتر عشان «آخر ظهور» مايوقفش.
      supabase.rpc("touch_last_seen", { p_version: APP_VERSION }).then(
        () => {},
        () => { supabase.rpc("touch_last_seen").then(() => {}, () => {}); }
      );
    });
  }, []);

  async function handleLogout() {
    await logoutAgent();
    router.replace("/login");
  }

  // اشتراك مقطوع (بعد فترة السماح): شاشة حظر — المندوب مايستخدمش التطبيق.
  if (cutOff) {
    const text = isTrial
      ? "السلام عليكم، انتهت فترة التجربة المجانية وأرغب في الاشتراك في تطبيق قناص اللوحات."
      : "السلام عليكم، انتهى اشتراكي في تطبيق قناص اللوحات وأرغب في معرفة طريقة الدفع لإعادة تشغيل الخدمة.";
    return (
      <SessionGuard>
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-night px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/15">
            <CalendarClock size={30} className="text-danger" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">
              {isTrial ? "انتهت فترة التجربة المجانية" : "انتهى اشتراكك"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {isTrial
                ? "انتهت فترة التجربة المجانية (١٥ يوم). للاشتراك والاستمرار تواصل مع الأدمن."
                : "اشتراكك في التطبيق انتهى وتم إيقاف الخدمة. برجاء التواصل مع الإدارة لمعرفة طريقة الدفع وإعادة تشغيل الخدمة."}
            </p>
          </div>
          <a href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-night transition active:scale-95">
            <MessageCircle size={18} /> تواصل مع الإدارة (واتساب)
          </a>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition">
            <LogOut size={13} /> تسجيل الخروج
          </button>
        </div>
      </SessionGuard>
    );
  }

  return (
    <SessionGuard>
      <div className="min-h-screen bg-night pb-24 overflow-x-hidden w-full">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-1.5">
            {!isHome && <BackButton />}
            <PlateIcon size={56} />
            <span className="shrink-0 text-sm font-bold text-ink">قناص اللوحات</span>
            {/* عدد الأيام الباقية في اشتراك المندوب — ثابت فوق في كل الصفحات */}
            {sub && sub.status !== "none" && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none"
                style={{ color: sub.color, borderColor: `${sub.color}66` }}
                title="أيام الاشتراك المتبقية"
              >
                <CalendarClock size={11} />
                {sub.daysLeft >= 0 ? `${sub.daysLeft} يوم` : "منتهي"}
              </span>
            )}
            {/* زر تحديث البرنامج — ثابت فوق عشان المندوب يحدّث من أي مكان */}
            <button
              onClick={() => void refreshAppNow()}
              className="flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 p-1.5 text-ink transition hover:text-primary"
              title="تحديث البرنامج"
              aria-label="تحديث البرنامج"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/20"
                title="لوحة الأدمن"
              >
                <ShieldCheck size={14} />
                <span>الأدمن</span>
              </button>
            )}
            <button
              onClick={() => setMenuOpen(true)}
              className="flex items-center justify-center rounded-full border border-border bg-surface-2 p-2 text-ink transition hover:text-primary"
              title="القائمة"
              aria-label="القائمة"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        <UpdateBanner />
        {/* رسالة الأدمن المؤقتة — بتظهر في كل صفحات المندوب */}
        <NoticeBanner />
        {/* استطلاع رأي الأدمن — بيظهر في كل صفحات المندوب */}
        <PollBanner />
        <AgentPresenceReporter />

        {(() => {
          // آخر يوم / يوم السماح ياخدوا تحذير عاجل بنص واضح + طمأنة عن السجلات.
          const notice = sub ? subscriptionNotice(sub, isTrial) : null;
          if (!notice || bannerDismissed) return null;
          const tone = notice.urgent
            ? "border-danger/40 bg-danger/10 text-danger"
            : "border-alert/30 bg-alert/10 text-alert";
          return (
            <div className={`border-b px-4 py-2 text-xs ${tone}`}>
              <div className="flex items-start gap-2">
                <CalendarClock size={14} className="mt-0.5 shrink-0" />
                <span className={`flex-1 ${notice.urgent ? "font-bold" : ""}`}>{notice.text}</span>
                <a href={`https://wa.me/${ADMIN_WHATSAPP}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 font-bold underline">تواصل</a>
                <button onClick={() => setBannerDismissed(true)} className="shrink-0 opacity-70">✕</button>
              </div>
              {notice.note && (
                <p className="mt-1 pr-5 leading-relaxed opacity-90">{notice.note}</p>
              )}
            </div>
          );
        })()}

        <main className="mx-auto w-full max-w-md px-4 py-5 min-h-[calc(100dvh-9rem)] overflow-x-hidden">{children}</main>

        <BottomNav />
        <WantedAlertOverlay />
        <AppMenu open={menuOpen} onOpenChange={setMenuOpen} onLogout={handleLogout} />
      </div>
    </SessionGuard>
  );
}
