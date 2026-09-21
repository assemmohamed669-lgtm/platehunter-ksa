"use client";

/**
 * نافذة عجلة الحظ المنبثقة — بتظهر **تلقائياً** أول ما التطبيق يفتح.
 *
 * المرحلة ١ (تجربة): بتظهر **للسوبر أدمن بس** (وضع تجربة، بلا إضافة أيام) عشان
 * المالك يشوف شكلها. المرحلة ٢: هتظهر للمناديب النهاردة بس، لفّة واحدة لكل مندوب،
 * والسيرفر يضيف الأيام. متعرضش تاني في نفس الجلسة (عشان ماتزنّقش كل تنقّل).
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import FortuneWheel from "@/components/FortuneWheel";

const SHOWN_KEY = "pk_wheel_shown_session";

export default function WheelPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (sessionStorage.getItem(SHOWN_KEY)) return; // اتعرضت في الجلسة دي
      } catch { /* */ }
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || !alive) return;
      const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", uid).single();
      if (!alive) return;
      // المرحلة ١: سوبر أدمن بس.
      if ((prof as { is_super?: boolean } | null)?.is_super) {
        try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* */ }
        setShow(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-auto bg-black/60 p-4" dir="rtl">
      <div className="relative my-auto w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-2xl">
        <button
          onClick={() => setShow(false)}
          className="absolute left-3 top-3 rounded-full bg-surface-2 p-1.5 text-muted transition hover:text-ink"
          aria-label="إغلاق"
        >
          <X size={18} />
        </button>
        <div className="mb-1 text-center">
          <h2 className="text-2xl font-black text-ink">🎡 عجلة الحظ</h2>
          <p className="mt-1 text-sm text-muted">لُفّ العجلة واكسب أيام إضافية لاشتراكك!</p>
        </div>
        <FortuneWheel mode="test" />
      </div>
    </div>
  );
}
