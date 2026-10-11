"use client";

/**
 * 🔔 تفاصيل «لقى سيارة مطلوبة» — بتتفتح لما المسئول/الزميل يدوس على إشعار الموبايل (`components/PushRegistrar.tsx`).
 * المالك (١١ أكتوبر ٢٠٢٦): «لما المسئول يفتح الاشعار يتفتحلو علي البرنامج ويشوف كل البيانات بتاع السيارة بالموقع
 * بتاعها بكل حاجه ومين حصلها من اعضاء المجموعه بالتاريخ والوقت».
 *
 * بتقرا صف اللقطة من `group_finds` — قواعد السيرفر هي اللي بتحدّد مين يشوفها (المجموعة، و«للمسئول بس» لو مفتوح).
 */
import { useEffect, useState } from "react";
import { Car, MapPin, User, Users, Clock } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";
import { formatFindTime, type FindRow } from "@/lib/findPush";

export default function GroupFindPage() {
  const [row, setRow] = useState<FindRow | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    if (!id) { setState("missing"); return; }
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("group_finds")
          .select("id, team, finder_name, plate, info, maps_link, created_at").eq("id", id).maybeSingle();
        if (!alive) return;
        if (data) { setRow(data as FindRow); setState("ok"); } else setState("missing");
      } catch { if (alive) setState("missing"); }
    })();
    return () => { alive = false; };
  }, []);

  if (state === "loading") return <p className="py-10 text-center text-sm text-muted">جارٍ التحميل…</p>;
  if (state === "missing" || !row) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted" dir="rtl">
        اللقطة دي مش متاحة — ممكن تكون اتمسحت أو مش من مجموعتك.
      </p>
    );
  }

  const fullTime = row.created_at
    ? new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "full", timeStyle: "short" }).format(new Date(row.created_at))
    : "";

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div className="overflow-hidden rounded-2xl border-2 border-brand bg-surface shadow-lg">
        <div className="flex items-center gap-1.5 bg-brand px-3 py-2 text-sm font-black text-night">
          <Car size={16} /> {row.finder_name || "زميلك"} لقى سيارة مطلوبة
        </div>
        <div className="flex flex-col items-center gap-3 px-4 py-4">
          <PlateBadge value={row.plate} size="lg" />
          <div className="grid w-full gap-1.5 text-sm">
            <p className="flex items-center gap-2 text-ink"><User size={15} className="text-primary" /> اللي لقاها: <b>{row.finder_name || "—"}</b></p>
            {row.team && <p className="flex items-center gap-2 text-ink"><Users size={15} className="text-primary" /> المجموعة: <b>{row.team}</b></p>}
            {fullTime && <p className="flex items-center gap-2 text-ink"><Clock size={15} className="text-primary" /> {fullTime} <span className="text-muted">({formatFindTime(row.created_at)})</span></p>}
          </div>
          {row.info && row.info.length > 0 && (
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-surface-2 p-3">
              {row.info.map(([k, v], i) => (
                <div key={i} className="flex min-w-0 gap-1 text-xs">
                  <span className="shrink-0 text-muted">{k}:</span>
                  <span className="truncate font-bold text-ink">{v}</span>
                </div>
              ))}
            </div>
          )}
          {row.maps_link ? (
            <a href={row.maps_link} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-night transition active:scale-95">
              <MapPin size={16} /> مكان السيارة على الخريطة
            </a>
          ) : (
            <p className="text-xs text-muted">الموقع ماكانش متاح وقت ما لقاها.</p>
          )}
        </div>
      </div>
    </div>
  );
}
