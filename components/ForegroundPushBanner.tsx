"use client";

/**
 * 🔔 شريط فوق الشاشة لإشعار وصل والتطبيق مفتوح (أندرويد مابيعرضهوش في شريط الإشعارات لوحده) — `lib/foregroundPush.ts`.
 * الدوسة بتفتح نفس صفحة الإشعار (الشهايد)، وبيختفي لوحده بعد ١٢ ثانية.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { PUSH_BANNER_EVENT, type PushBanner } from "@/lib/foregroundPush";
import { setCheckTab } from "@/lib/checkTab";

const SHOW_MS = 12_000;

export default function ForegroundPushBanner() {
  const router = useRouter();
  const [b, setB] = useState<PushBanner | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const next = (e as CustomEvent<PushBanner>).detail;
      if (!next?.title) return;
      setB(next);
      try { navigator.vibrate?.(200); } catch { /* مش مدعوم */ }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setB(null), SHOW_MS);
    };
    window.addEventListener(PUSH_BANNER_EVENT, on);
    return () => { window.removeEventListener(PUSH_BANNER_EVENT, on); if (timer) clearTimeout(timer); };
  }, []);

  if (!b) return null;
  const open = () => {
    if (b.url.includes("tab=cert")) setCheckTab("cert");
    router.push(b.url);
    setB(null);
  };
  return (
    <div className="fixed inset-x-0 z-[200] flex justify-center px-3" style={{ top: "calc(var(--safe-top, 0px) + 8px)" }} dir="rtl">
      <div className="flex w-full max-w-md items-start gap-2 rounded-2xl border border-primary/40 bg-surface px-3 py-2.5 shadow-lg">
        <button onClick={open} className="flex-1 text-right">
          <div className="text-sm font-bold text-ink">{b.title}</div>
          {b.body && <div className="mt-0.5 text-xs text-muted">{b.body}</div>}
        </button>
        <button onClick={() => setB(null)} aria-label="إغلاق" className="rounded-lg p-1 text-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
