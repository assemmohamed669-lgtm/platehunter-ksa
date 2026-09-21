"use client";

/**
 * نافذة عجلة الحظ المنبثقة — بتظهر **تلقائياً** أول ما التطبيق يفتح.
 *
 * - **سوبر أدمن** → وضع تجربة (بلا إضافة أيام)، عشان المالك يشوف الشكل.
 * - **مندوب** → وضع حقيقي (السيرفر بيضيف الأيام، لفّة واحدة لكل مندوب)، بشرط:
 *     اليوم مفعّل (WHEEL_EVENT_DATE = تاريخ النهاردة) **أو** حسابه في قائمة
 *     التجربة، **و**لسه ملفّش العجلة قبل كده (مفيش صف في wheel_spins).
 * - بتظهر **مرة واحدة في الجلسة** (عشان ماتزنّقش كل تنقّل). لو المندوب تجاهلها
 *   من غير ما يلفّ، تفتحله **تاني في المرة الجاية** (لأنه لسه ملفّش) — لحد ما
 *   يلفّها فعلاً، وبعدها متظهرش خالص.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import FortuneWheel from "@/components/FortuneWheel";

const SHOWN_KEY = "pk_wheel_shown_session";

// ⚙️ إعدادات الإطلاق:
//  - WHEEL_EVENT_DATE = "" يعني **مقفولة عن المناديب** (بس السوبر أدمن وحسابات
//    التجربة يشوفوها). وقت الإطلاق نحطها = تاريخ اليوم "YYYY-MM-DD" فتظهر
//    للمناديب في اليوم ده بس.
const WHEEL_EVENT_DATE = "";
//  - حسابات تجربة تشوف العجلة الحقيقية (للتأكد إن الأيام بتتضاف) بدون ما نطلقها
//    لكل المناديب. غيّرها لإيميل حساب المندوب التجريبي بتاعك.
const WHEEL_TEST_EMAILS = ["asemafify40@gmail.com"];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WheelPopup() {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"test" | "real">("test");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (sessionStorage.getItem(SHOWN_KEY)) return; // اتعرضت في الجلسة دي
      } catch { /* */ }
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      const email = data.user?.email ?? "";
      if (!uid || !alive) return;
      const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", uid).single();
      if (!alive) return;
      const isSuper = !!(prof as { is_super?: boolean } | null)?.is_super;

      if (isSuper) {
        try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* */ }
        setMode("test");
        setShow(true);
        return;
      }

      // مندوب: لازم اليوم مفعّل أو حساب تجربة.
      const eventActive =
        (!!WHEEL_EVENT_DATE && todayStr() === WHEEL_EVENT_DATE) || WHEEL_TEST_EMAILS.includes(email);
      if (!eventActive) return;

      // لفّ قبل كده؟ متظهرش. (لو تجاهلها بلا لفّ، مفيش صف → هتظهر تاني.)
      const { data: spinRow } = await supabase
        .from("wheel_spins").select("agent_id").eq("agent_id", uid).maybeSingle();
      if (!alive || spinRow) return;

      try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* */ }
      setMode("real");
      setShow(true);
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
        <FortuneWheel mode={mode} />
      </div>
    </div>
  );
}
