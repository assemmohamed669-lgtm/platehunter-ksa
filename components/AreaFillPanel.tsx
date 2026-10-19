"use client";

/**
 * 📍 «املأ الحي والشارع» — نفس المربع في مكانين (`lib/areaBackfill.ts`):
 *  · الأدمن (`/admin/area-fill`): السوبر أدمن يختار الحساب (مشترك أو أدمن) بالاسم من القايمة ⇒ كل سجلاته من زمان.
 *    المالك (١٩ أكتوبر ٢٠٢٦): «خلي الخيار اني اختار اسم المشترك او الادمن اللي هعمل معاه كدة».
 *  · سجلات المندوب (صفحة التشييك): زرار لسجلاته هو.
 * الصفحة لازم تفضل مفتوحة (خدمة العناوين طلب في الثانية)، وأي وقفة بتكمّل من الناقص.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, Square } from "lucide-react";
import { accountRoleLabel, pickAccounts, type PickAccount } from "@/lib/accountPicker";
import { reverseGeocode } from "@/lib/geocoding";
import {
  runAreaFill, areaFillStatusText, type AreaFillCall, type AreaFillProgress,
} from "@/lib/areaBackfill";

async function authHeaders(): Promise<Record<string, string>> {
  const at = await import("@/lib/supabaseClient")
    .then(({ supabase }) => supabase.auth.getSession())
    .then(({ data }) => data.session?.access_token)
    .catch(() => undefined);
  return at ? { Authorization: `Bearer ${at}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

/** نداء `/api/area-fill` لمندوب معيّن (فاضي = أنا). */
function makeCall(agentId: string | null, onName?: (n: string | null) => void): AreaFillCall {
  return async (body) => {
    const res = await fetch("/api/area-fill", {
      method: "POST", headers: await authHeaders(), cache: "no-store",
      body: JSON.stringify({ ...body, ...(agentId ? { agentId } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(j?.error || `السيرفر ردّ ${res.status}`));
    if (body.action === "scan" && onName) onName(j?.name ?? null);
    return j;
  };
}

type WakeLockLike = { release: () => Promise<void> };

export default function AreaFillPanel({
  mode, agentId, accounts, missingCount, beforeRun, afterRun,
}: {
  mode: "admin" | "self";
  /** المندوب (self: أنا). الأدمن بيختاره من القايمة. */
  agentId?: string | null;
  /** الأدمن: كل الحسابات (مشتركين وأدمنز) للاختيار بالاسم. */
  accounts?: PickAccount[];
  /** self: كام لوحة على الموبايل ليها موقع ومن غير حي (للعنوان بس). */
  missingCount?: number;
  /** self: ارفع اللي على الموبايل الأول (عشان كله يبقى على السيرفر). */
  beforeRun?: () => Promise<void>;
  /** self: نزّل الحي اللي اتكتب للموبايل. */
  afterRun?: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickAccount | null>(null);
  const matches = useMemo(() => pickAccounts(accounts ?? [], query), [accounts, query]);
  /** ID كامل اتلصق ومش في القايمة ⇒ نقدر نشتغل عليه برضه (السيرفر بيتأكد إنه موجود). */
  const rawId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.trim()) && !matches.length
    ? query.trim() : null;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AreaFillProgress | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(mode === "admin");
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; abortRef.current?.abort(); }, []);

  async function start() {
    const target = mode === "admin" ? (picked?.id ?? "") : (agentId ?? "");
    if (mode === "admin" && !target) { setProgress({ phase: "error", scanned: 0, total: 0, done: 0, filled: 0, reused: 0, failed: 0, etaSec: null, error: "اختار الحساب الأول" }); return; }
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setName(null);
    setProgress({ phase: "scan", scanned: 0, total: 0, done: 0, filled: 0, reused: 0, failed: 0, etaSec: null });
    // الشاشة ماتطفيش والشغل ماشي (لو الموبايل بيدعمها)
    let wake: WakeLockLike | null = null;
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } }).wakeLock;
      if (wl) wake = await wl.request("screen");
    } catch { /* مش متاح */ }
    try {
      if (beforeRun) { try { await beforeRun(); } catch { /* يكمّل باللي على السيرفر */ } }
      const res = await runAreaFill({
        call: makeCall(mode === "admin" ? target : null, (n) => { if (mounted.current) setName(n); }),
        reverse: reverseGeocode,
        signal: ac.signal,
        onProgress: (p) => { if (mounted.current) setProgress(p); },
      });
      if (afterRun && res.filled > 0) { try { await afterRun(); } catch { /* الفتحة الجاية */ } }
    } finally {
      try { await wake?.release(); } catch { /* ignore */ }
      if (mounted.current) setRunning(false);
      abortRef.current = null;
    }
  }

  const p = progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  const tone = !p ? "text-muted" : p.phase === "error" ? "text-danger" : p.phase === "done" ? "text-emerald-600" : "text-ink";

  if (mode === "self" && !open) {
    return (
      <button onClick={() => setOpen(true)} dir="rtl"
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/20">
        <MapPin size={14} /> املأ الحي والشارع للوحات اللي من غيره
        {missingCount ? <span className="rounded-full bg-primary/20 px-1.5">{missingCount.toLocaleString("ar-EG")}</span> : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3" dir="rtl">
      <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
        <MapPin size={15} /> {mode === "admin" ? "املأ الحي والشارع لسجلات مندوب" : "املأ الحي والشارع من موقع كل لوحة"}
      </p>
      <p className="text-[11px] leading-relaxed text-muted">
        {mode === "admin"
          ? "كل سجلات المندوب من زمان اللي ليها موقع ومن غير حي — الحي والشارع بيتكتبوا قدامها من موقع كل لوحة، واللي ليها حي مابتتلمسش. موبايله بينزّلها لوحده أول ما يفتح التشييك."
          : "كل لوحاتك اللي ليها موقع ومن غير حي — الحي والشارع بيتكتبوا قدامها من موقع كل لوحة، واللي ليها حي مابتتلمسش."}
        {" "}خلّي الصفحة مفتوحة لحد ما يخلص (حوالي لوحة في الثانية، واللوحات اللي جنب بعض أسرع). لو وقف، دوس «ابدأ» تاني وهيكمّل من الناقص.
      </p>

      {mode === "admin" && (picked ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-surface px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-ink">المختار: {picked.username || name || picked.id}</p>
            <p className="text-[10px] text-muted">{picked.username ? accountRoleLabel(picked) : "بالـID"}</p>
          </div>
          <button onClick={() => { setPicked(null); setProgress(null); setName(null); }} disabled={running}
            className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted disabled:opacity-40">تغيير</button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الإيميل أو الرقم (أو الصق الـID)"
              className="w-full rounded-lg border border-border bg-surface-2 py-2 pr-9 pl-3 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border bg-surface">
            {matches.map((a) => (
              <button key={a.id} onClick={() => { setPicked(a); setProgress(null); setName(null); }}
                className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-right last:border-b-0 hover:bg-primary/10">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-ink">{a.username || "بدون اسم"}</span>
                  {(a.email || a.phone) && <span className="block truncate text-[10px] text-muted" dir="ltr">{[a.email, a.phone].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.role === "admin" ? "bg-alert/15 text-alert" : "bg-primary/15 text-primary"}`}>{accountRoleLabel(a)}</span>
              </button>
            ))}
            {rawId && (
              <button onClick={() => { setPicked({ id: rawId, username: null, email: null, phone: null, role: "agent" }); setProgress(null); setName(null); }}
                className="w-full px-3 py-2 text-right text-xs font-bold text-primary hover:bg-primary/10">اشتغل على الـID ده</button>
            )}
            {!matches.length && !rawId && (
              <p className="px-3 py-3 text-center text-[11px] text-muted">{(accounts ?? []).length ? "مفيش حساب بالاسم ده" : "جارٍ تحميل الحسابات…"}</p>
            )}
          </div>
        </div>
      ))}
      {name && <p className="text-[11px] font-bold text-ink">المندوب: {name}</p>}

      <div className="flex gap-2">
        {!running ? (
          <button onClick={() => void start()} disabled={mode === "admin" && !picked}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-night transition active:scale-[0.99] disabled:opacity-40">
            <MapPin size={14} /> ابدأ
          </button>
        ) : (
          <button onClick={() => abortRef.current?.abort()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-bold text-danger transition">
            <Square size={13} /> وقّف
          </button>
        )}
        {mode === "self" && !running && (
          <button onClick={() => setOpen(false)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">قفل</button>
        )}
      </div>

      {p && (
        <div className="flex flex-col gap-1">
          {p.phase === "fill" && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className={`text-[12px] font-bold ${tone}`}>{areaFillStatusText(p)}</p>
          {(p.phase === "fill" || p.phase === "done" || p.phase === "stopped") && p.total > 0 && (
            <p className="text-[10px] text-muted">
              اتكتب {p.filled.toLocaleString("ar-EG")} · من غير طلب (جنب لوحة قبلها) {p.reused.toLocaleString("ar-EG")}
              {p.failed ? ` · مالقيناش ${p.failed.toLocaleString("ar-EG")}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
