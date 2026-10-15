"use client";

/**
 * 🧭 «شغل الأعضاء» — لمسئول المجموعة في «إدارة مجموعتي» (المالك ١٥ أكتوبر ٢٠٢٦): لكل عضو آخر فرز عمله إمتى (ولو
 * مافرزش النهارده بيبان)، وبالدوس: كل اللي عمله آخر ٧ أيام — الفرز وطلع كام، فتح موقع عربية (اللوحة + الخريطة)،
 * مشاركة صورة/إكسيل/نص — ومكان العضو ساعتها على الخريطة. الأعضاء = أعضاء المجموعة دي بس (من الإعدادات).
 * المصدر: `team_agent_events` (`docs/sql/agent-events.sql`) — `lib/agentEvents.ts`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2, ChevronDown, MapPin, Filter, Share2, Navigation, AlertCircle } from "lucide-react";
import { fetchTeamEvents, summarizeTeamEvents, describeEvent, type TeamEvent } from "@/lib/agentEvents";
import { toMapsLink } from "@/lib/gps";

const TZ = "Asia/Riyadh";
const ar = (n: number) => n.toLocaleString("ar-EG");
const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
};
const fmtDayTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ar-EG", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })} · ${fmtTime(iso)}`;
  } catch { return "—"; }
};
const KIND_ICON = { sort: Filter, open_location: Navigation, share: Share2 } as const;

export default function TeamWorkLog({ team, members }: { team: string; members: { id: string; username: string | null }[] }) {
  const [events, setEvents] = useState<TeamEvent[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchTeamEvents(team);
      setMissing(!!r.missing);
      setEvents(r.events);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [team]);
  useEffect(() => { void load(); }, [load]);

  const work = useMemo(() => summarizeTeamEvents(events ?? [], members), [events, members]);

  if (missing) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-4 text-xs text-muted">
        <AlertCircle size={14} /> «شغل الأعضاء» محتاج خطوة على Supabase الأول (agent-events.sql).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">آخر ٧ أيام · الفرز وفتح المواقع والمشاركة ومكان العضو ساعتها</p>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} تحديث
        </button>
      </div>
      {events === null && <div className="flex justify-center py-6 text-muted"><Loader2 className="animate-spin" /></div>}
      {events !== null && work.map((m) => {
        const isOpen = open === m.id;
        return (
          <div key={m.id} className="rounded-xl border border-border bg-surface">
            <button onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-right">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{m.username}</p>
                <p className="text-[11px] text-muted">
                  {m.lastSortAt ? `آخر فرز: ${fmtDayTime(m.lastSortAt)}` : "مافرزش في آخر ٧ أيام"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.sortsToday > 0
                    ? <span className="rounded-full bg-green-600/15 px-2 py-0.5 text-[10px] font-bold text-green-600">فرز النهارده {ar(m.sortsToday)} مرة</span>
                    : <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">مافرزش النهارده</span>}
                  {m.opensToday > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">فتح {ar(m.opensToday)} موقع</span>}
                  {m.sharesToday > 0 && <span className="rounded-full bg-alert/15 px-2 py-0.5 text-[10px] font-bold text-alert">شارك {ar(m.sharesToday)} مرة</span>}
                </div>
              </div>
              <ChevronDown size={16} className={`mt-1 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t border-border px-3 py-2">
                {m.events.length === 0 && <p className="py-2 text-center text-[11px] text-muted">مافيش شغل متسجّل في آخر ٧ أيام.</p>}
                <ul className="flex flex-col gap-1.5">
                  {m.events.map((e) => {
                    const Icon = KIND_ICON[e.kind] ?? Filter;
                    const carLink = e.kind === "open_location" && typeof e.details?.link === "string" ? String(e.details.link) : "";
                    return (
                      <li key={e.id} className="flex items-start gap-2 rounded-lg bg-surface-2/60 px-2 py-1.5">
                        <Icon size={13} className="mt-0.5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-bold text-ink">{describeEvent(e)}</p>
                          <p className="text-[10px] text-muted">{fmtDayTime(e.at)}</p>
                          <div className="mt-0.5 flex flex-wrap gap-2">
                            {carLink && (
                              <a href={carLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[11px] font-bold text-primary underline">
                                <MapPin size={11} /> مكان العربية
                              </a>
                            )}
                            {e.lat != null && e.lng != null && (
                              <a href={toMapsLink(e.lat, e.lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[11px] font-bold text-alert underline">
                                <MapPin size={11} /> مكان {m.username} ساعتها
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
