"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { BUILD_ID, refreshAppNow } from "@/lib/appVersion";

const LS_DISMISSED = "ph:updateDismissedBuild";
// معرّف البناء اللي عملنا له تحديث تلقائي في الجلسة دي — ضد اللوب لو النشر على
// الـCDN لسه ماوصلش (نحدّث مرة واحدة بس لكل نسخة، وبعدها نعرض بانر يدوي).
const SS_AUTO = "ph:autoRefreshedBuild";

/**
 * تحديث **تلقائي** للتطبيق: بيقارن معرّف البناء اللي على الجهاز بالمنشور على
 * السيرفر (بيتغيّر مع كل نشر). لو الجهاز شغّال نسخة قديمة → بيحدّث نفسه لوحده
 * (يمسح الكاش ويجيب آخر نسخة) من غير ما المندوب يدوس أي حاجة. الفحص بيتم عند فتح
 * التطبيق ولما يرجع للواجهة. لو التحديث التلقائي ما نجحش (نفس النسخة تاني) بيظهر
 * بانر «تحديث الآن» يدوي احتياطي.
 */
export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const d = (await r.json()) as { buildId?: string; note?: string };
        if (cancelled) return;
        const server = d?.buildId;
        // نسخة أحدث منشورة؟ (نتجاهل بيئة التطوير "dev")
        if (!server || server === BUILD_ID || BUILD_ID === "dev") return;

        // تحديث تلقائي مرة واحدة لكل معرّف بناء في الجلسة (ضد اللوب).
        let already = "";
        try { already = sessionStorage.getItem(SS_AUTO) || ""; } catch { /* ignore */ }
        if (already !== server) {
          try { sessionStorage.setItem(SS_AUTO, server); } catch { /* ignore */ }
          await refreshAppNow();   // يمسح الكاش + يعيد التحميل بآخر نسخة
          return;
        }

        // احتياطي: التحديث التلقائي ما وصّلش لآخر نسخة (كاش/CDN) → بانر يدوي.
        let dismissed = "";
        try { dismissed = localStorage.getItem(LS_DISMISSED) || ""; } catch { /* ignore */ }
        if (server === dismissed) return;
        setLatest(server);
        setNote(d.note || "");
      } catch { /* أوفلاين — عادي */ }
    }

    void check();
    // فحص كمان لما التطبيق يرجع للواجهة (المندوب فتحه بعد ما كان في الخلفية).
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!latest) return null;

  return (
    <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary" dir="rtl">
      <Download size={14} className="shrink-0" />
      <span className="flex-1">فيه تحديث جديد للبرنامج{note ? ` — ${note}` : " — اضغط تحديث الآن."}</span>
      <button onClick={() => refreshAppNow()} className="shrink-0 rounded-lg bg-primary px-2.5 py-1 font-bold text-night">تحديث الآن</button>
      <button
        onClick={() => { try { localStorage.setItem(LS_DISMISSED, latest); } catch { /* ignore */ } setLatest(null); }}
        className="shrink-0 text-primary/70 hover:text-primary"
        aria-label="إغلاق"
      >
        <X size={14} />
      </button>
    </div>
  );
}
