"use client";

/**
 * نشاط المجموعة — **للمسئول بس** (أو أدمن في المجموعة). المحتوى كله في `components/GroupActivityView.tsx` (نفسه
 * بيتعرض كتاب «تقرير النشاط» في «إدارة مجموعتي»).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import GroupActivityView from "@/components/GroupActivityView";
import { currentSession } from "@/lib/authSession";

export default function GroupActivityPage() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId && signedOut) router.replace("/login");
    })();
  }, [router]);

  return (
    <div dir="rtl" className="mx-auto max-w-lg px-4 pb-24 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => router.back()} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="رجوع"><ChevronLeft size={22} /></button>
        <h1 className="flex items-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> نشاط المجموعة</h1>
      </div>
      <GroupActivityView />
    </div>
  );
}
