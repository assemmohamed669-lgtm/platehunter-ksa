"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Menu } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import SessionGuard from "@/components/SessionGuard";
import BottomNav from "@/components/BottomNav";
import PlateIcon from "@/components/PlateIcon";
import BackButton from "@/components/BackButton";
import IncomingExcelHandler from "@/components/IncomingExcelHandler";
import AppMenu from "@/components/AppMenu";
import { logoutAgent } from "@/lib/auth";
import { initAppearance } from "@/lib/appSettings";
import { supabase } from "@/lib/supabaseClient";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === "/dashboard";

  // Apply the saved appearance (font size / colours) app-wide on every load.
  useEffect(() => { initAppearance(); }, []);

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
      <div className="min-h-screen bg-night pb-24 overflow-x-hidden w-full">
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
            <button
              onClick={() => setMenuOpen(true)}
              className="flex items-center justify-center rounded-full border border-border bg-surface-2 p-2 text-ink transition hover:text-primary"
              title="القائمة"
              aria-label="القائمة"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md px-4 py-5 min-h-[calc(100dvh-9rem)] overflow-x-hidden">{children}</main>

        <BottomNav />
        <IncomingExcelHandler />
        <AppMenu open={menuOpen} onOpenChange={setMenuOpen} onLogout={handleLogout} />
      </div>
    </SessionGuard>
  );
}
