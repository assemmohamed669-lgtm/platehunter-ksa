"use client";

/**
 * لوحة الأدمن — مواقع المناديب على الخريطة (لايف + آخر ظهور).
 * بتقرا آخر موقع محفوظ لكل مندوب من profiles وبترسمهم على نفس مكوّن الخريطة
 * (MapView). بتتحدّث تلقائياً كل ٣٠ث. النقطة الخضرا = نشط الآن، الرمادي = مش فاتح.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronLeft, MapPin, RefreshCw, Navigation, CircleUserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { activityStatus } from "@/lib/presence";
import { toMapsLink } from "@/lib/gps";
import type { MapPoint } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-surface text-muted text-sm">
      جارٍ تحميل الخريطة...
    </div>
  ),
});

interface AgentLoc {
  id: string;
  username: string;
  phone: string | null;
  last_seen: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_loc_accuracy: number | null;
  last_loc_at: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// أخضر = نشط الآن، برتقالي = آخر ساعة، رمادي = أقدم / غير معروف.
function dotColor(lastSeen: string | null): string {
  const s = activityStatus(lastSeen);
  if (s.online) return "#22c55e";
  if (s.minsAgo != null && s.minsAgo < 60) return "#f59e0b";
  return "#9ca3af";
}

export default function AgentLocationsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentLoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number>(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, phone, last_seen, last_lat, last_lng, last_loc_accuracy, last_loc_at")
      .eq("role", "agent")
      .order("username", { ascending: true });
    if (data) setAgents(data as AgentLoc[]);
    setLoading(false);
    setRefreshedAt(Date.now());
  }, []);

  // Access guard — السوبر أدمن فقط (مش أي أدمن عادي).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/sorting"); return; }
      setAuthorized(true);
      load();
    })();
  }, [router, load]);

  // تحديث تلقائي كل ٣٠ث عشان النقط تتحرّك لوحدها.
  useEffect(() => {
    if (!authorized) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [authorized, load]);

  const withLoc = useMemo(() => agents.filter((a) => a.last_lat != null && a.last_lng != null), [agents]);
  const noLoc = useMemo(() => agents.filter((a) => a.last_lat == null || a.last_lng == null), [agents]);

  const points = useMemo<MapPoint[]>(
    () => withLoc.map((a) => ({
      lat: a.last_lat as number,
      lng: a.last_lng as number,
      plate: a.username || "مندوب",
      subtitle: activityStatus(a.last_seen).label + (a.phone ? ` · ${a.phone}` : ""),
      when: fmt(a.last_loc_at ?? a.last_seen),
      mapsLink: toMapsLink(a.last_lat as number, a.last_lng as number),
      color: dotColor(a.last_seen),
    })),
    [withLoc]
  );

  // القائمة — النشط أولاً، وبعده الأحدث ظهوراً.
  const sorted = useMemo(() => {
    return [...agents].sort((x, y) => {
      const sx = activityStatus(x.last_seen), sy = activityStatus(y.last_seen);
      if (sx.online !== sy.online) return sx.online ? -1 : 1;
      const tx = x.last_seen ? new Date(x.last_seen).getTime() : 0;
      const ty = y.last_seen ? new Date(y.last_seen).getTime() : 0;
      return ty - tx;
    });
  }, [agents]);

  const onlineCount = useMemo(() => agents.filter((a) => activityStatus(a.last_seen).online).length, [agents]);

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  return (
    <main className="min-h-screen bg-night">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.push("/admin")}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-ink transition">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-ink">مواقع المناديب</h1>
            <p className="text-[11px] text-muted">لايف + آخر ظهور</p>
          </div>
          <button onClick={load}
            className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition">
            <RefreshCw size={14} /> تحديث
          </button>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-bold text-green-500">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" /> {onlineCount} نشط الآن
          </span>
          <span className="text-xs text-muted">{withLoc.length} ظاهر على الخريطة</span>
          {refreshedAt > 0 && <span className="mr-auto text-[10px] text-muted">آخر تحديث {fmt(new Date(refreshedAt).toISOString())}</span>}
        </div>

        {/* Map */}
        {withLoc.length > 0 ? (
          <MapView points={points} userLocation={null} heightPx={440} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface py-10 text-center">
            <MapPin size={34} className="text-muted/30" />
            <p className="text-sm text-muted">
              {loading ? "جارٍ التحميل..." : "لسه مفيش مندوب شارك موقعه. لازم المندوب يفتح التطبيق ويسمح بالوصول للموقع."}
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex flex-col gap-2">
          {sorted.map((a) => {
            const st = activityStatus(a.last_seen);
            const hasLoc = a.last_lat != null && a.last_lng != null;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <CircleUserRound size={26} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.online ? "bg-green-500 animate-pulse" : "bg-muted/40"}`} />
                    <span className="truncate text-sm font-bold text-ink">{a.username}</span>
                  </div>
                  <p className="truncate text-[11px] text-muted">
                    <span className={st.online ? "font-bold text-green-500" : ""}>{st.label}</span>
                    {a.last_loc_accuracy != null && hasLoc && <span> · دقة ±{Math.round(a.last_loc_accuracy)}م</span>}
                    {a.phone && <span> · {a.phone}</span>}
                  </p>
                </div>
                {hasLoc ? (
                  <a href={toMapsLink(a.last_lat as number, a.last_lng as number)} target="_blank" rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition">
                    <Navigation size={12} /> الموقع
                  </a>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] text-muted">بدون موقع</span>
                )}
              </div>
            );
          })}
          {!loading && agents.length === 0 && <p className="py-8 text-center text-sm text-muted">لا يوجد مناديب.</p>}
        </div>

        {noLoc.length > 0 && withLoc.length > 0 && (
          <p className="text-[11px] text-muted">
            {noLoc.length} مندوب لسه ما شاركوش موقعهم (لازم يفتحوا التطبيق ويسمحوا بالموقع).
          </p>
        )}
      </div>
    </main>
  );
}
