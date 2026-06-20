"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import SessionGuard from "@/components/SessionGuard";
import BottomNav from "@/components/BottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import PlateIcon from "@/components/PlateIcon";
import BackButton from "@/components/BackButton";
import { logoutAgent } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const isHome = pathname === "/dashboard";

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      setIsAdmin(profile?.role === "admin");
    });
  }, []);

  async function handleLogout() {
    await logoutAgent();
    router.replace("/login");
  }

  return (
    <SessionGuard>
      <div className="min-h-screen bg-night pb-24">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            {!isHome && <BackButton />}
            <PlateIcon size={56} />
            <span className="text-sm font-bold text-ink">قناص اللوحات</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/20"
                title="لوحة الأدمن"
              >
                <ShieldCheck size={14} />
                <span>الأدمن</span>
              </button>
            )}
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted transition hover:text-danger"
              title="تسجيل الخروج"
            >
              <LogOut size={14} />
              <span>خروج</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md px-4 py-5 min-h-[calc(100dvh-9rem)]">{children}</main>

        <BottomNav />
      </div>
    </SessionGuard>
  );
}
