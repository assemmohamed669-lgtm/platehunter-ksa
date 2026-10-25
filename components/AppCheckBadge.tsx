"use client";

/**
 * 📢 سطر صغير تحت مربع التشييك (٢٥ أكتوبر ٢٠٢٦) — المالك: «يظهر عند المناديب انه شغال علي تشييك البرنامج».
 *  · المندوب: «شغّال على تشييك البرنامج» · «شغّال على تشييكك انت» · «بينزّل…».
 *  · الأدمن: اللي هيرفعه هنا بينزل عند كل المناديب + نتيجة آخر نشر.
 * مابيظهرش خالص عند اللي الميزة مش شغّالة عنده (`lib/appCheck.ts`).
 */
import { useEffect, useSyncExternalStore } from "react";
import { APP_CHECK_FOR_ALL, getAppCheckState, refreshAppCheckUi, subscribeAppCheck } from "@/lib/appCheck";

export default function AppCheckBadge() {
  const s = useSyncExternalStore(subscribeAppCheck, getAppCheckState, getAppCheckState);
  useEffect(() => { void refreshAppCheckUi(); }, []);
  if (!s.enabled) return null;

  const pill = (text: string, tone: "ok" | "own" | "wait" | "bad") => (
    <p
      dir="rtl"
      className={`rounded-xl px-3 py-1.5 text-[11px] font-bold leading-relaxed ${
        tone === "ok" ? "bg-primary/10 text-primary"
          : tone === "own" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : tone === "bad" ? "bg-danger/10 text-danger"
              : "bg-surface-2 text-muted"
      }`}
    >
      {text}
    </p>
  );

  if (s.publisher) {
    if (s.lastPublish && s.lastPublish.ok) {
      return pill(`✅ اتبعت ${APP_CHECK_FOR_ALL ? "لكل المناديب" : "لحسابات التجربة"} (${s.lastPublish.files} ملف) — هينزل عندهم كأنهم رافعينه`, "ok");
    }
    if (s.lastPublish && !s.lastPublish.ok) return pill(`❌ ماتبعتش للمناديب: ${s.lastPublish.error}`, "bad");
    return pill(`📢 أي ملف تشييك ترفعه هنا بينزل عند ${APP_CHECK_FOR_ALL ? "كل المناديب" : "حسابات التجربة (قبل الفتح للكل)"}`, "wait");
  }
  if (s.syncing) return pill("⏳ بينزّل تشييك البرنامج…", "wait");
  if (s.mode === "app") return pill(`📢 شغّال على تشييك البرنامج${s.files > 1 ? ` (${s.files} ملفات)` : ""}`, "ok");
  if (s.mode === "own") return pill("📁 شغّال على تشييكك انت — لو مسحته هيشتغل على تشييك البرنامج تلقائي", "own");
  return null;
}
