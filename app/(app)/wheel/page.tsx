"use client";

/**
 * صفحة عجلة الحظ. **المرحلة ١: للسوبر أدمن بس** (وضع تجربة) — عشان المالك يشوف
 * الشكل والاحتفال قبل ما نظهرها للمناديب (المرحلة ٢). أي حساب مش سوبر أدمن
 * بيترجّع لصفحة التشييك.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FortuneWheel from "@/components/FortuneWheel";

export default function WheelPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", uid).single();
      if (!alive) return;
      const ok = !!(prof as { is_super?: boolean } | null)?.is_super;
      setAllowed(ok);
      if (!ok) router.replace("/instant-check");
    })();
    return () => { alive = false; };
  }, [router]);

  if (allowed !== true) return null;

  return (
    <div className="flex flex-col gap-5 py-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-black text-ink">🎡 عجلة الحظ</h1>
        <p className="mt-1 text-sm text-muted">لُفّ العجلة واكسب أيام إضافية لاشتراكك!</p>
      </div>
      <FortuneWheel mode="test" />
    </div>
  );
}
