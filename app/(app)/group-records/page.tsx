"use client";

/**
 * سجلات المجموعة — كل سجلات كل أعضاء مجموعة المندوب، من السيرفر بالتقسيم + بحث.
 * البيانات كلها على Supabase (ممكن ملايين) — التطبيق بيجيب صفحة‑صفحة وإنت بتنزل،
 * مش بينزّل الكل على الجهاز (عشان مايقفلش). كل سجل مكتوب عليه مين سجّله.
 * الفرز على كل ده بيتعمل على السيرفر (ميزة منفصلة).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, Search, MapPin } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";

const PAGE = 100;

interface Row { id: string; plate: string; method: string | null; maps_link: string | null; checked_at: string; agent_id: string; }

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function GroupRecordsPage() {
  const router = useRouter();
  const [ready, setReady] = useState<null | "ok" | "no-team">(null);
  const [team, setTeam] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const memberIdsRef = useRef<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const loadedRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    const ids = memberIdsRef.current;
    if (ids.length === 0) return;
    loadingRef.current = true; setLoading(true);
    try {
      const offset = reset ? 0 : loadedRef.current;
      let q = supabase.from("field_checks")
        .select("id, plate, method, maps_link, checked_at, agent_id", reset ? { count: "exact" } : {})
        .in("agent_id", ids)
        .order("checked_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      const term = searchRef.current.trim();
      if (term) q = q.ilike("plate", `%${term}%`);
      const { data, count, error } = await q;
      if (error) return;
      const got = (data ?? []) as Row[];
      if (reset) { setRows(got); loadedRef.current = got.length; setTotal(count ?? null); }
      else { setRows((r) => [...r, ...got]); loadedRef.current += got.length; }
      setHasMore(got.length === PAGE);
    } finally { loadingRef.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("team").eq("id", data.user.id).single();
      const t = (me as { team?: string | null } | null)?.team ?? null;
      if (!t) { setReady("no-team"); return; }
      setTeam(t);
      const { data: mem } = await supabase.from("profiles").select("id, username").eq("team", t);
      const members = (mem ?? []) as { id: string; username: string }[];
      memberIdsRef.current = members.map((m) => m.id);
      setNames(Object.fromEntries(members.map((m) => [m.id, m.username])));
      setReady("ok");
      void load(true);
    })();
  }, [router, load]);

  function runSearch() { searchRef.current = search; setRows([]); setTotal(null); setHasMore(true); loadedRef.current = 0; void load(true); }

  return (
    <main className="min-h-screen bg-night pb-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition hover:text-ink">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> سجلات المجموعة</h1>
            {ready === "ok" && <p className="text-[11px] text-muted">مجموعة «{team}» — {Object.keys(names).length} مندوب</p>}
          </div>
          <span className="w-[52px]" />
        </div>

        {ready === "no-team" && (
          <p className="rounded-xl border border-border bg-surface px-3 py-8 text-center text-sm text-muted">
            إنت مش في مجموعة. تواصل مع الإدارة عشان يضيفوك.
          </p>
        )}

        {ready === "ok" && (
          <>
            {/* العدد الإجمالي */}
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-center">
              <p className="text-3xl font-black text-primary">{total != null ? total.toLocaleString("ar-EG") : "…"}</p>
              <p className="text-[11px] text-muted">إجمالي سجلات المجموعة{searchRef.current ? " (نتيجة البحث)" : ""}</p>
            </div>

            {/* بحث */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder="ابحث بلوحة..." dir="rtl"
                  className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button onClick={runSearch} className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-night">بحث</button>
            </div>

            {/* القائمة */}
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5">
                  <PlateBadge value={r.plate} size="sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-bold text-ink">{names[r.agent_id] ?? "—"}</p>
                    <p className="text-[10px] text-muted">{fmtDate(r.checked_at)}{r.method ? ` · ${r.method}` : ""}</p>
                  </div>
                  {r.maps_link && (
                    <a href={r.maps_link} target="_blank" rel="noopener noreferrer"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20" title="الموقع">
                      <MapPin size={15} />
                    </a>
                  )}
                </div>
              ))}
              {rows.length === 0 && !loading && <p className="py-8 text-center text-sm text-muted">مفيش سجلات{searchRef.current ? " للبحث ده" : ""}.</p>}
            </div>

            {loading && <p className="py-3 text-center text-sm text-muted">جارٍ التحميل...</p>}
            {!loading && hasMore && rows.length > 0 && (
              <button onClick={() => void load(false)}
                className="rounded-xl border border-border bg-surface py-2.5 text-sm font-bold text-primary transition hover:bg-surface-2">
                تحميل المزيد
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
