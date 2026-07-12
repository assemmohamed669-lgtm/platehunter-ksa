"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListFilter, Mic, MapPin, ScanLine } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const TILES = [
  {
    href: "/sorting",
    label: "الفرز",
    desc: "مطابقة قوائم البنوك",
    icon: ListFilter,
  },
  {
    href: "/registration",
    label: "التسجيل",
    desc: "صوت + GPS ميداني",
    icon: Mic,
  },
  {
    href: "/maps",
    label: "الخرائط",
    desc: "نقاط ومسارات الميدان",
    icon: MapPin,
  },
  {
    href: "/instant-check",
    label: "التشييك الفوري",
    desc: "كاميرا / كتابة / صوت",
    icon: ScanLine,
  },
] as const;

export default function DashboardPage() {
  const now = useLiveClock();
  const dateStr = now.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex flex-col gap-4 h-full min-h-[calc(100dvh-9rem)]">
      {/* Clock */}
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <PlateBadge value="قنص1234" size="sm" />
        <p className="text-xs text-muted" dir="rtl">{dateStr}</p>
        <p className="font-mono text-2xl font-black text-glow" dir="ltr">{timeStr}</p>
      </div>

      {/* Tiles grid — flex-1 to fill remaining height */}
      <div className="grid grid-cols-2 gap-3 flex-1" style={{ gridAutoRows: "1fr" }}>
        {TILES.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-4 text-center transition hover:border-primary/60 hover:shadow-glow active:scale-95 min-h-[120px]"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-dark text-primary">
              <Icon size={32} />
            </div>
            <div>
              <p className="text-base font-bold text-ink">{label}</p>
              <p className="text-xs text-muted leading-tight">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
