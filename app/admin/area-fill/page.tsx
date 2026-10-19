"use client";

/**
 * لوحة الأدمن — 📍 «املأ الحي والشارع لسجلات مندوب» (سوبر أدمن فقط — `lib/areaBackfill.ts`).
 *
 * المالك (١٩ أكتوبر ٢٠٢٦): «ينفع لو جبتله ال يوزر اي دي بتاع المندوب دة نحطله اسم الشارع والحي بس عايز دة
 * يحصل ل كل الداتا بتاعته حتي اللي مصدرها من زمان». الحماية الحقيقية في السيرفر (`/api/area-fill`).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import AreaFillPanel from "@/components/AreaFillPanel";

export default function AreaFillAdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // السوبر أدمن فقط (مش أي أدمن عادي).
  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();   // مش getUser: فشل الشبكة ≠ خروج
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", userId).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/admin"); return; }
      setAuthorized(true);
    })();
  }, [router]);

  if (authorized === null) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">جارٍ التحقق...</div>;
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-ink">الحي والشارع للسجلات القديمة</h1>
        <button onClick={() => router.push("/admin")}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-ink transition">
          رجوع <ChevronLeft size={15} />
        </button>
      </div>
      <AreaFillPanel mode="admin" />
    </div>
  );
}
