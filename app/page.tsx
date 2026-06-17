"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PlateBadge from "@/components/PlateBadge";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    });
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-night">
      {/* تم إضافة تنسيق inline لضمان عرض النص بالترتيب الصحيح */}
      <div style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
        <PlateBadge value="قنص1234" />
      </div>
      <p className="text-sm text-muted">جاري التحميل...</p>
    </main>
  );
}