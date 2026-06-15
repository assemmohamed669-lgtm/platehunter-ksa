"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import SessionGuard from "@/components/SessionGuard";
import BottomNav from "@/components/BottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import PlateBadge from "@/components/PlateBadge";
import { logoutAgent } from "@/lib/auth";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    await logoutAgent();
    router.replace("/login");
  }

  return (
    <SessionGuard>
      <div className="min-h-screen bg-night pb-24">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <PlateBadge value="قنص" size="sm" />
            <span className="text-sm font-bold text-ink">قناص اللوحات</span>
          </div>
          <div className="flex items-center gap-2">
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

        <main className="mx-auto max-w-md px-4 py-5">{children}</main>

        <BottomNav />
      </div>
    </SessionGuard>
  );
}
