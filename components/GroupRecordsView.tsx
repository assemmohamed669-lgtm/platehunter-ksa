"use client";

/**
 * سجلات المجموعة — كل سجلات كل أعضاء مجموعة المندوب، من السيرفر بالتقسيم + بحث.
 *
 * **مكوّن واحد بيتعرض في مكانين**: صفحة /group-records، وجوّه تبويب «السجلات»
 * كزر «سجلات المجموعة». نسختين من نفس المنطق كانت هتبقى نفس غلطة قارئ الإكسيل
 * (إصلاح بيوصل لمكان ويفوت التاني) — فمكان واحد بس.
 * البيانات كلها على Supabase (ممكن ملايين) — التطبيق بيجيب صفحة‑صفحة وإنت بتنزل،
 * مش بينزّل الكل على الجهاز (عشان مايقفلش). كل سجل مكتوب عليه مين سجّله.
 * الفرز على كل ده بيتعمل على السيرفر (ميزة منفصلة).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, Search, MapPin, AlertCircle, Pencil, Check, X, ZoomIn, ZoomOut } from "lucide-react";
import VehicleTypeSelect from "@/components/VehicleTypeSelect";
import EditableTextCell from "@/components/EditableTextCell";
import { NOTES_KEY, TYPE_KEY } from "@/lib/fieldCheckEdit";
import { supabase } from "@/lib/supabaseClient";
import { dedupeDuplicateRows } from "@/lib/fieldCheck";

const PAGE = 100;

type Source = "plates" | "chassis";
interface Row {
  id: string;
  primary: string;                       // اللوحة أو الشاص
  sub: string | null;                    // الحالة (صوتي/يدوي…) أو نوع المركبة
  maps_link: string | null;
  checked_at: string;
  agent_id: string;
  extra: Record<string, string>;         // الحي-الشارع + النوع + الملاحظات
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function GroupRecordsView({ embedded = false }: { embedded?: boolean }) {
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
  const [source, setSource] = useState<Source>("plates");   // لوحات / شاص
  const sourceRef = useRef<Source>("plates");
  const [err, setErr] = useState<string | null>(null);
  const [meId, setMeId] = useState<string>("");          // سجلاتي أنا = القابلة للتعديل
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [zoom, setZoom] = useState(1);                    // نفس فكرة تكبير شيت السجلات
  const genRef = useRef(0);   // رقم الطلب الحالي — يلغي نتيجة أي طلب قديم
  const loadedRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    // «تحميل المزيد» بس اللي بيتمنع وقت وجود طلب شغّال؛ تبديل المصدر/البحث لازم
    // يمشي دايمًا (الطلب القديم بيترمي بفرق رقم الطلب) وإلا القايمة تفضل قديمة.
    if (loadingRef.current && !reset) return;
    const ids = memberIdsRef.current;
    if (ids.length === 0) return;
    loadingRef.current = true; setLoading(true);
    try {
      const gen = genRef.current;          // أي تبديل مصدر/بحث بيزوّدها فنرمي النتيجة القديمة
      const offset = reset ? 0 : loadedRef.current;
      const isCh = sourceRef.current === "chassis";
      const tbl = isCh ? "chassis_records" : "field_checks";
      const pcol = isCh ? "chassis" : "plate";
      const scol = isCh ? "vehicle_type" : "method";
      // ⚠️ chassis_records مفتاحها local_id (مفيش عمود id) — الاختيار الغلط كان
      //    بيفشل الاستعلام فتاب «شاص» يطلع فاضي.
      const idCol = isCh ? "local_id" : "id";
      let q = supabase.from(tbl)
        .select(`${idCol}, ${pcol}, ${scol}, maps_link, checked_at, agent_id${isCh ? "" : ", extra"}`, reset ? { count: "exact" } : {})
        .in("agent_id", ids)
        .order("checked_at", { ascending: false })
        .order(idCol, { ascending: false })   // فاصل ثابت — يمنع تكرار/تخطّي صفوف بين الصفحات
        .range(offset, offset + PAGE - 1);
      const term = searchRef.current.trim();
      if (term) q = q.ilike(pcol, `%${term}%`);
      const { data, count, error } = await q;
      if (gen !== genRef.current) return;   // اتبدّل المصدر/البحث وإحنا مستنيين → ارمِ النتيجة
      if (error) { setErr("تعذّر تحميل السجلات. جرّب تاني."); return; }
      setErr(null);
      const got = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r[idCol]), primary: String(r[pcol] ?? ""), sub: (r[scol] as string) ?? null,
        maps_link: (r.maps_link as string) ?? null, checked_at: String(r.checked_at), agent_id: String(r.agent_id),
        extra: (r.extra as Record<string, string>) ?? {},
      })) as Row[];
      // محرك الصوت بيعيد إرسال نفس النطق ⇒ نفس اللوحة بتتسجّل كذا مرة في نفس
      // الدقيقة. بنوريها مرة واحدة (لكل مندوب على حدة — مندوبين مختلفين ممكن
      // يشيّكوا نفس اللوحة في نفس الدقيقة بشكل شرعي).
      const clean = dedupeDuplicateRows(got, (r) => ({ plate: r.primary, at: r.checked_at, owner: r.agent_id, location: r.maps_link }));
      if (reset) { setRows(clean); loadedRef.current = got.length; setTotal(count ?? null); }
      else { setRows((r) => dedupeDuplicateRows([...r, ...clean], (x) => ({ plate: x.primary, at: x.checked_at, owner: x.agent_id, location: x.maps_link }))); loadedRef.current += got.length; }
      setHasMore(got.length === PAGE);
    } finally { loadingRef.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      setMeId(data.user.id);
      const { data: me } = await supabase.from("profiles").select("team").eq("id", data.user.id).single();
      const t = (me as { team?: string | null } | null)?.team ?? null;
      if (!t) { setReady("no-team"); return; }
      setTeam(t);
      // أعضاء المجموعة عبر دالة security definer — قراءة profiles مباشرة بترجّع
      // المندوب نفسه بس (RLS)، فالمشاركة ماكانتش بتحصل.
      const { data: mem } = await supabase.rpc("my_team_members");
      const members = (mem ?? []) as { id: string; username: string }[];
      memberIdsRef.current = members.map((m) => m.id);
      setNames(Object.fromEntries(members.map((m) => [m.id, m.username])));
      setReady("ok");
      void load(true);
    })();
  }, [router, load]);

  /** تعديل سجل — سجلاتي أنا بس. RLS بيرفض أي صف لحد تاني، فده حارس تاني مش الوحيد. */
  async function saveRow(r: Row, patch: { plate?: string; type?: string; notes?: string }) {
    if (r.agent_id !== meId || sourceRef.current === "chassis") return;
    const extra = { ...r.extra };
    if (patch.type !== undefined) extra[TYPE_KEY] = patch.type;
    if (patch.notes !== undefined) extra[NOTES_KEY] = patch.notes;
    const upd: Record<string, unknown> = { extra };
    if (patch.plate !== undefined) upd.plate = patch.plate;
    const { error } = await supabase.from("field_checks").update(upd).eq("id", r.id);
    if (error) { setErr("تعذّر حفظ التعديل: " + error.message); return; }
    setErr(null);
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, extra, primary: patch.plate ?? x.primary } : x)));
  }

  function runSearch() { genRef.current++; searchRef.current = search; setRows([]); setTotal(null); setHasMore(true); setErr(null); loadedRef.current = 0; void load(true); }
  function switchSource(s: Source) {
    if (s === source) return;
    genRef.current++;
    setSource(s); sourceRef.current = s;
    setRows([]); setTotal(null); setHasMore(true); setErr(null); loadedRef.current = 0; setSearch(""); searchRef.current = "";
    void load(true);
  }

  const content = (
    <>
        {!embedded && (
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
        )}
        {embedded && ready === "ok" && (
          <p className="text-center text-[11px] text-muted">مجموعة «{team}» — {Object.keys(names).length} مندوب</p>
        )}

        {ready === "no-team" && (
          <p className="rounded-xl border border-border bg-surface px-3 py-8 text-center text-sm text-muted">
            إنت مش في مجموعة. تواصل مع الإدارة عشان يضيفوك.
          </p>
        )}

        {ready === "ok" && (
          <>
            {/* لوحات / شاص */}
            <div className="flex gap-1.5">
              {([["plates", "لوحات"], ["chassis", "شاص"]] as [Source, string][]).map(([k, label]) => (
                <button key={k} onClick={() => switchSource(k)}
                  className={`flex-1 rounded-full border px-3 py-1.5 text-xs transition ${source === k ? "border-primary bg-primary/15 font-bold text-primary" : "border-border text-muted"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* العدد الإجمالي */}
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-center">
              <p className="text-3xl font-black text-primary">{total != null ? total.toLocaleString("ar-EG") : "…"}</p>
              <p className="text-[11px] text-muted">إجمالي {source === "chassis" ? "شاص" : "لوحات"} المجموعة{searchRef.current ? " (نتيجة البحث)" : ""}</p>
            </div>

            {/* بحث */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder={source === "chassis" ? "ابحث برقم الشاص..." : "ابحث بلوحة..."} dir="rtl"
                  className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button onClick={runSearch} className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-night">بحث</button>
            </div>

            {err && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
                <AlertCircle size={15} className="shrink-0" /> {err}
              </div>
            )}

            {/* تكبير/تصغير زي شيت السجلات */}
            <div className="flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <button onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))} className="text-muted hover:text-ink"><ZoomOut size={15} /></button>
              <span className="text-[11px] font-bold text-muted">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} className="text-muted hover:text-ink"><ZoomIn size={15} /></button>
            </div>

            {/* الجدول — نفس شكل شيت السجلات بالظبط */}
            <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
              <div style={{ fontSize: `${zoom * 12}px`, minWidth: "max-content" }}>
                <table className="w-full border-collapse" style={{ direction: "rtl" }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-2 text-muted">
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">{source === "chassis" ? "رقم الشاص" : "رقم اللوحة"}</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">النوع</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">ملاحظات</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">الحي-الشارع</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">المندوب</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">الحالة</th>
                      <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">GPS</th>
                      <th className="whitespace-nowrap border-b border-border px-3 py-2 text-right font-bold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const mine = r.agent_id === meId && source !== "chassis";
                      return (
                        <tr key={r.id} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                          <td className="whitespace-nowrap border-l border-border px-3 py-2 font-bold text-brand">
                            {editId === r.id ? (
                              <span className="inline-flex items-center gap-1">
                                <input dir="rtl" autoFocus value={editVal}
                                  onChange={(e) => setEditVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { void saveRow(r, { plate: editVal.trim() }); setEditId(null); }
                                    if (e.key === "Escape") setEditId(null);
                                  }}
                                  className="w-24 rounded border border-primary bg-surface-2 px-2 py-1 text-center text-ink outline-none" />
                                <button onClick={() => { void saveRow(r, { plate: editVal.trim() }); setEditId(null); }} className="text-brand" title="حفظ"><Check size={14} /></button>
                                <button onClick={() => setEditId(null)} className="text-muted" title="إلغاء"><X size={14} /></button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5" dir={source === "chassis" ? "ltr" : "rtl"}>
                                {r.primary}
                                {mine && (
                                  <button onClick={() => { setEditId(r.id); setEditVal(r.primary); }}
                                    className="text-muted transition hover:text-primary" title="تعديل اللوحة"><Pencil size={12} /></button>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap border-l border-border px-3 py-2 text-ink">
                            {mine
                              ? <VehicleTypeSelect value={r.extra[TYPE_KEY] ?? ""} onChange={(code) => void saveRow(r, { type: code })} />
                              : <span>{r.extra[TYPE_KEY] || (source === "chassis" ? (r.sub ?? "—") : "—")}</span>}
                          </td>
                          <td className="min-w-[120px] border-l border-border px-3 py-2 text-ink">
                            <EditableTextCell disabled={!mine} value={r.extra[NOTES_KEY] ?? ""} placeholder="ملاحظة…"
                              onSave={(v) => void saveRow(r, { notes: v })} />
                          </td>
                          <td className="whitespace-nowrap border-l border-border px-3 py-2 text-muted">{r.extra["الحي-الشارع"] || "—"}</td>
                          <td className="whitespace-nowrap border-l border-border px-3 py-2 text-ink">
                            {names[r.agent_id] ?? "—"}
                            {mine && <span className="mr-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.75em] font-bold text-primary">أنا</span>}
                          </td>
                          <td className="whitespace-nowrap border-l border-border px-3 py-2">
                            {r.sub ? <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.8em] font-bold text-brand">{r.sub}</span> : <span className="text-muted">—</span>}
                          </td>
                          <td className="border-l border-border px-3 py-2">
                            {r.maps_link
                              ? <a href={r.maps_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 whitespace-nowrap text-primary underline"><MapPin size={10} /> خريطة</a>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="whitespace-nowrap border-border px-3 py-2 text-muted">{fmtDate(r.checked_at)}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && !loading && (
                      <tr><td colSpan={8} className="py-8 text-center text-sm text-muted">مفيش سجلات{searchRef.current ? " للبحث ده" : ""}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
    </>
  );

  if (embedded) return <div className="flex flex-col gap-3">{content}</div>;
  return (
    <main className="min-h-screen bg-night pb-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5">{content}</div>
    </main>
  );
}
