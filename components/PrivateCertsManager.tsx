"use client";

/**
 * 🔒 **الشهايد الخاصة** — مربع التحكّم في «إحصائيات الشهايد» (السوبر أدمن بس — الصفحة نفسها والـAPI مقفولين عليه).
 *
 * المالك (١٧ نوفمبر ٢٠٢٦): حساب درايف تاني لناس معيّنة بس. قراراته: الاختيار **بالاسم** (يضيف ويشيل) ولكل واحد
 * «الجديد بس» أو «الجديد والقديم» · الإشعار للمختارين بس بنفس شكل الإشعار الحالي (`lib/certPrivate.ts`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Search, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { CERT_ACCESS_MODE_LABELS, type CertAccessMode } from "@/lib/certPrivate";

interface Member { agentId: string; name: string; team: string | null; mode: CertAccessMode }
interface State { configured: boolean; setup?: boolean; today: { total: number; parsed: number } | null; members: Member[] }
interface Match { agentId: string; name: string; team: string | null }

const ar = (n: number) => n.toLocaleString("ar-EG");
const MODES: CertAccessMode[] = ["private_only", "both"];

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function PrivateCertsManager() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cert-private", { headers: await authHeaders(), cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState((await res.json()) as State);
      setError("");
    } catch {
      setError("مش قادر يجيب القايمة — دوس «تحديث» تاني.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // 🔎 البحث بالاسم (بعد ما يبطّل كتابة شوية)
  useEffect(() => {
    const term = q.trim();
    if (!term) { setMatches([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/cert-private?q=${encodeURIComponent(term)}`, { headers: await authHeaders(), cache: "no-store" });
        const d = (await res.json()) as { matches?: Match[] };
        if (seq === searchSeq.current) setMatches(d.matches ?? []);
      } catch { if (seq === searchSeq.current) setMatches([]); }
      finally { if (seq === searchSeq.current) setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/cert-private", {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      await load();
    } catch {
      setError("التعديل ماتحفظش — جرّب تاني.");
    } finally {
      setBusy(null);
    }
  }

  const members = state?.members ?? [];
  const already = new Set(members.map((m) => m.agentId));

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
        <Lock size={15} /> الشهايد الخاصة (الحساب التاني)
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
        شهايد الإيميل التاني بتظهر وبيوصل إشعارها للي انت تختارهم هنا بس. الباقيين مابيتغيّرلهمش حاجة.
      </p>

      {!state && !error && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted"><Loader2 size={12} className="animate-spin" /> بيحمّل…</p>
      )}
      {error && <p className="mb-2 rounded-lg bg-danger/10 px-2.5 py-2 text-[11px] font-bold text-danger">{error}</p>}

      {state && (
        <>
          <p className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-relaxed ${
            state.configured ? "bg-emerald-600/10 text-emerald-600" : "bg-alert/10 text-alert"
          }`}>
            {state.configured
              ? <>✅ الحساب التاني متوصّل{state.today ? <> — اترفع النهارده: {ar(state.today.total)} شهادة</> : null}</>
              : <>⚠️ الحساب التاني لسه ماتوصلش — محتاج مفتاحه يتحط في Vercel (GDRIVE2_REFRESH_TOKEN).</>}
          </p>

          {state.setup ? (
            <p className="rounded-lg bg-alert/10 px-2.5 py-2 text-[11px] font-bold leading-relaxed text-alert">
              محتاج خطوة على سوبابيز الأول (docs/sql/cert-private.sql). بعدها تقدر تختار الناس من هنا.
            </p>
          ) : (
            <>
              <div className="relative mb-2">
                <Search size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="اكتب اسم المندوب عشان تضيفه…"
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-2.5 pr-8 text-xs text-ink placeholder:text-muted"
                />
              </div>
              {q.trim() && (
                <div className="mb-2 flex flex-col gap-1">
                  {searching && matches.length === 0 && <p className="text-[11px] text-muted">بيدوّر…</p>}
                  {!searching && matches.length === 0 && <p className="text-[11px] text-muted">مفيش حد بالاسم ده.</p>}
                  {matches.map((m) => (
                    <button key={m.agentId} disabled={already.has(m.agentId) || busy !== null}
                      onClick={() => { void act({ action: "add", agentId: m.agentId, mode: "both" }, `add:${m.agentId}`); setQ(""); }}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2 text-right text-xs text-ink transition hover:border-primary/40 disabled:opacity-50">
                      <span>{m.name}{m.team ? <span className="text-[10px] text-muted"> · {m.team}</span> : null}</span>
                      <span className="text-[10px] font-bold text-primary">{already.has(m.agentId) ? "موجود" : "+ ضيف"}</span>
                    </button>
                  ))}
                </div>
              )}

              {members.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-muted">لسه ماختارتش حد.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {members.map((m) => (
                    <div key={m.agentId} data-member className="rounded-lg border border-border bg-surface px-2.5 py-2">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-ink">
                          {m.name || "—"}{m.team ? <span className="text-[10px] font-normal text-muted"> · {m.team}</span> : null}
                        </p>
                        <button aria-label="شيل" disabled={busy !== null}
                          onClick={() => { if (window.confirm(`تشيل ${m.name || "المندوب ده"} من الشهايد الخاصة؟`)) void act({ action: "remove", agentId: m.agentId }, `rm:${m.agentId}`); }}
                          className="text-muted transition hover:text-danger disabled:opacity-50">
                          <X size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {MODES.map((mode) => (
                          <button key={mode} aria-pressed={m.mode === mode} disabled={busy !== null || m.mode === mode}
                            onClick={() => void act({ action: "mode", agentId: m.agentId, mode }, `mode:${m.agentId}`)}
                            className={`rounded-md border py-1.5 text-[11px] font-bold transition ${
                              m.mode === mode ? "border-primary bg-primary/15 text-primary" : "border-border text-muted hover:text-ink"
                            }`}>
                            {CERT_ACCESS_MODE_LABELS[mode]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
