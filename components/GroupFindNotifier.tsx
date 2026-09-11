"use client";

/**
 * إشعار المجموعة: مندوب في مجموعة (team) يلاقي لوحة مطلوبة → التطبيق يسجّل الصف
 * في group_finds، وباقي المجموعة يوصلهم لحظيًا (Supabase Realtime) → إشعار
 * بالاسم واللوحة وبياناتها وموقع اللي لقاها.
 *
 * متركّب مرة واحدة في اللياوت (زي WantedAlertOverlay). المندوب اللي مالوش
 * مجموعة (team = null) مايشتركش ومايبعتش — مفيش أي أثر عليه.
 */
import { useEffect, useRef, useState } from "react";
import { X, MapPin, Car } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";
import { WANTED_ALERT_EVENT, type WantedAlertDetail } from "@/lib/wantedAlert";
import { gpsService, toMapsLink, type GpsCoords } from "@/lib/gps";
import { playNoticeTone } from "@/lib/noticeTone";

interface GroupFind {
  id: string;
  finder_id: string;
  finder_name: string | null;
  plate: string;
  info: [string, string][] | null;
  maps_link: string | null;
}

export default function GroupFindNotifier() {
  // طابور — لو جت لقطتين ورا بعض، التانية ماتمسحش الأولى قبل ما المندوب يشوفها.
  const [queue, setQueue] = useState<GroupFind[]>([]);
  const notif = queue[0] ?? null;
  const meRef = useRef<{ id: string; team: string | null; name: string } | null>(null);
  const coordsRef = useRef<GpsCoords | null>(null);
  const recentRef = useRef<Map<string, number>>(new Map()); // dedup نفس اللوحة

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let gpsUnsub: (() => void) | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("team, username").eq("id", uid).single();
      const p = prof as { team?: string | null; username?: string | null } | null;
      const team = p?.team ?? null;
      meRef.current = { id: uid, team, name: p?.username ?? "زميلك" };
      if (!team) return; // مش في مجموعة → لا استقبال ولا إرسال

      gpsUnsub = gpsService.subscribe((c) => { coordsRef.current = c; });

      // استقبال لقطات المجموعة لحظيًا (من غيري).
      channel = supabase
        .channel(`group-finds-${team}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "group_finds", filter: `team=eq.${team}` },
          (payload) => {
            const row = payload.new as GroupFind;
            if (!row?.plate || row.finder_id === meRef.current?.id) return; // مش لقطتي أنا
            setQueue((q) => (q.some((x) => x.id === row.id) ? q : [...q, row]));
            try { playNoticeTone(); } catch { /* الصوت مش متاح */ }
          })
        .subscribe();
    })();

    // لما أنا ألاقي لوحة مطلوبة (أي طريقة: صوت/يدوي/كاميرا) → سجّلها لمجموعتي.
    const onFind = (e: Event) => {
      const me = meRef.current;
      if (!me?.team) return;
      const d = (e as CustomEvent<WantedAlertDetail>).detail;
      if (!d?.plate) return;
      const now = Date.now();
      // dedup: نفس اللوحة خلال دقيقة = مرة واحدة (نداء النطق بيعيد الحدث أحيانًا).
      const last = recentRef.current.get(d.plate) ?? 0;
      if (now - last < 60_000) return;
      recentRef.current.set(d.plate, now);
      const c = coordsRef.current;
      void supabase.from("group_finds").insert({
        team: me.team, finder_id: me.id, finder_name: me.name,
        plate: d.plate, info: d.info ?? null,
        maps_link: c ? toMapsLink(c.lat, c.lng) : null,
      });
    };
    window.addEventListener(WANTED_ALERT_EVENT, onFind);

    return () => {
      window.removeEventListener(WANTED_ALERT_EVENT, onFind);
      gpsUnsub?.();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (!notif) return null;

  return (
    <div className="fixed inset-x-0 top-2 z-[70] flex justify-center px-3" style={{ direction: "rtl" }}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border-2 border-brand bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-2 bg-brand px-3 py-2 text-night">
          <span className="flex items-center gap-1.5 text-sm font-black">
            <Car size={16} /> {notif.finder_name || "زميلك"} لقى سيارة مطلوبة!{queue.length > 1 ? ` (+${queue.length - 1})` : ""}
          </span>
          <button onClick={() => setQueue((q) => q.slice(1))} className="text-night/80 transition hover:text-night"><X size={18} /></button>
        </div>
        <div className="flex flex-col items-center gap-2 px-4 py-3">
          <PlateBadge value={notif.plate} size="md" />
          {notif.info && notif.info.length > 0 && (
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-surface-2 p-2.5">
              {notif.info.map(([k, v], i) => (
                <div key={i} className="flex min-w-0 gap-1 text-[11px]">
                  <span className="shrink-0 text-muted">{k}:</span>
                  <span className="truncate font-bold text-ink">{v}</span>
                </div>
              ))}
            </div>
          )}
          {notif.maps_link && (
            <a href={notif.maps_link} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary transition hover:bg-primary/20">
              <MapPin size={14} /> مكان السيارة (فين لقاها)
            </a>
          )}
          <button onClick={() => setQueue((q) => q.slice(1))} className="mt-0.5 w-full rounded-xl border border-border py-2 text-xs font-bold text-muted">تمام</button>
        </div>
      </div>
    </div>
  );
}
