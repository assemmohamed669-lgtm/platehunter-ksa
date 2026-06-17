"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, LogOut, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { logoutAgent } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.replace("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        router.replace("/registration");
        return;
      }
      setChecking(false);
    }
    checkAdmin();
  }, [router]);

  async function handleLogout() {
    await logoutAgent();
    router.replace("/login");
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night text-muted text-sm">
        جارٍ التحقق من الصلاحيات...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night pb-10">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-primary" />
          <span className="font-bold text-ink">لوحة الأدمن</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/registration")}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-ink transition"
          >
            <ArrowRight size={13} />
            التطبيق
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-danger transition"
          >
            <LogOut size={13} />
            خروج
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-5">{children}</main>
    </div>
  );
}
