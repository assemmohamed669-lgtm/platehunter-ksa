"use client";

/**
 * 🎡 نافذة عجلة الحظ المنبثقة.
 *
 * بتظهر **بس** لو الأدمن فعّل لفّة للمندوب ده (`profiles.wheel_spin_at`).
 * اللياوت بيقرا الخانة دي مع باقي بيانات المندوب فمافيش نداء شبكة زيادة.
 *
 * طلب المالك (٣٠ سبتمبر ٢٠٢٦): «لو نسي وقفل صفحة العجلة تظهرله تاني» — فالقفل
 * بيخفيها للجلسة دي بس؛ طول ما هو ملفّش، هترجع تظهر أول ما يفتح البرنامج تاني.
 * أول ما يلفّ، السيرفر بيصفّر التفعيل فمتظهرش خالص لحد ما الأدمن يفعّل من جديد.
 */
import { useState } from "react";
import { X } from "lucide-react";
import FortuneWheel from "@/components/FortuneWheel";

export default function WheelPopup({ granted }: { granted: boolean }) {
  const [closed, setClosed] = useState(false);
  const [won, setWon] = useState(false);

  if (!granted || closed) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-auto bg-black/60 p-4" dir="rtl">
      <div className="relative my-auto w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-2xl">
        <button
          onClick={() => setClosed(true)}
          className="absolute left-3 top-3 rounded-full bg-surface-2 p-1.5 text-muted transition hover:text-ink"
          aria-label="إغلاق"
        >
          <X size={18} />
        </button>
        <div className="mb-1 text-center">
          <h2 className="text-2xl font-black text-ink">🎡 عجلة الحظ</h2>
          <p className="mt-1 text-sm text-muted">
            {won ? "مبروك! الأيام اتضافت لاشتراكك." : "لُفّ العجلة واكسب أيام إضافية لاشتراكك!"}
          </p>
        </div>
        <FortuneWheel onWon={() => setWon(true)} />
      </div>
    </div>
  );
}
