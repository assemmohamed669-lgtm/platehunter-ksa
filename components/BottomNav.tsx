"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListFilter, Mic, MapPin, ScanLine } from "lucide-react";

const TABS = [
  { href: "/sorting", label: "الفرز", icon: ListFilter },
  { href: "/instant-check", label: "التشييك", icon: ScanLine },
  { href: "/registration", label: "التسجيل", icon: Mic },
  { href: "/maps", label: "الخرائط", icon: MapPin },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md justify-between px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map(({ href, label, icon: Icon }) => {
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
