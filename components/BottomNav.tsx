"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ListFilter, Mic, MapPin, ScanLine, Crosshair } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const TABS = [
  { href: "/sorting", label: "الفرز", icon: ListFilter },
  { href: "/instant-check", label: "التشييك", icon: ScanLine },
  // التسجيل للسوبر أدمن فقط (superOnly) — مخفي عن المناديب.
  { href: "/registration", label: "التسجيل", icon: Mic, superOnly: true },
  { href: "/maps", label: "الخرائط", icon: MapPin },
  { href: "/wanted", label: "المطلوب", icon: Crosshair },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const [isSuper, setIsSuper] = useState(false);

  // هل المستخدم الحالي سوبر أدمن؟ (يحدد ظهور تبويب التسجيل).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        setIsSuper(!!prof?.is_super);
      } catch { /* غير متاح — يفضل مخفي */ }
    })();
  }, []);

  const tabs = TABS.filter((t) => !("superOnly" in t && t.superOnly) || isSuper);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md justify-between px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs transition ${
                active ? "text-glow" : "text-muted hover:text-ink"
              }`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 2}
                className={active ? "drop-shadow-[0_0_6px_rgba(107,163,232,0.55)]" : ""}
              />
              <span className={active ? "font-bold" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
