"use client";

/**
 * ✏️ زرار «تعديل» تحت ملف الداتا في صفحة الفرز ⇒ صفحة التعديل على نفس الملف (`/data-edit?slot=…` — `lib/dataEdit.ts`).
 * شرط السوبر أدمن هنا مش في صفحة الفرز (صفحة الفرز كلها مفتوحة للكل ومافيهاش شرط سوبر أدمن). «انشر للكل» =
 * `DATA_EDIT_FOR_ALL = true`.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { DATA_EDIT_FOR_ALL } from "@/lib/dataEdit";
import { supabase } from "@/lib/supabaseClient";

/** `label` = اسم المربع زي ما ظاهر في الفرز («داتا إضافية 3») — صفحة التعديل بتكتبه فوق. */
export default function DataEditLink({ slot, show, label }: { slot: string; show: boolean; label?: string }) {
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => {
    if (DATA_EDIT_FOR_ALL) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        setIsSuper((prof as { is_super?: boolean } | null)?.is_super === true);
      } catch { /* مش عارفين — من غير الزرار */ }
    })();
  }, []);
  if (!show || !(DATA_EDIT_FOR_ALL || isSuper)) return null;
  return (
    <Link href={`/data-edit?slot=${slot}${label ? `&box=${encodeURIComponent(label)}` : ""}`}
      className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary transition hover:bg-primary/20">
      <Pencil size={13} /> تعديل
    </Link>
  );
}
