"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListFilter, Mic, MapPin, Database, ScanLine } from "lucide-react";
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
  {
    href: "/checking",
    label: "قاعدة البيانات",
    desc: "كل السجلات + تصدير",
    icon: Database,
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
  const timeStr = now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <PlateBadge value="قنص1234" size="sm" />
        <p className="text-xs text-muted" dir="rtl">{dateStr}</p>
        <p className="font-mono text-lg font-bold text-glow" dir="ltr">{timeStr}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-5 text-center transition hover:border-primary/60 hover:shadow-glow active:scale-95"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-dark text-primary">
              <Icon size={26} />
            </div>
            <span className="text-sm font-bold text-ink">{label}</span>
            <span className="text-xs text-muted">{desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
