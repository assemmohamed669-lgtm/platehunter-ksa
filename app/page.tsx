"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PlateBadge from "@/components/PlateBadge";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Detect password recovery redirect from Supabase email link
    if (window.location.hash.includes("type=recovery")) {
      router.replace("/auth/reset-password");
      return;
    }
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
      <PlateBadge value="قنص1234" />
      <p className="text-sm text-muted">جاري التحميل...</p>
    </main>
  );
}
