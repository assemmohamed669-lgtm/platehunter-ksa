"use client";

/**
 * فرز إحالة على سجلات المجموعة — على السيرفر.
 * المندوب يرفع إحالة → التطبيق يطبّع لوحاتها ويبعتها (RPC match_group_plates) →
 * السيرفر يطابقها على سجلات كل المجموعة ويرجّع اللي طابق (ببياناته + مين لقاه +
 * موقعه). مفيش تنزيل للملايين على الجهاز.
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, FileUp, MapPin, AlertCircle } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";
import { parseExcelFile } from "@/lib/excel";
import {
  collectReferralEntries, detectArabicPlateColumn, detectArabicPlateColumnByContent,
  detectPlateColumn, normalizePlate, bankPlateToArabic,
} from "@/lib/plateParser";

interface Match {
  id: string; plate: string; method: string | null; maps_link: string | null;
  checked_at: string; agent_id: string; refRow: Record<string, string> | null;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function GroupSortPage() {
  const router = useRouter();
  const [ready, setReady] = useState<null | "ok" | "no-team">(null);
  const [team, setTeam] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Match[] | null>(null);
  const [refCount, setRefCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("team").eq("id", data.user.id).single();
      const t = (me as { team?: string | null } | null)?.team ?? null;
      if (!t) { setReady("no-team"); return; }
      setTeam(t);
      const { data: mem } = await supabase.from("profiles").select("id, username").eq("team", t);
      setNames(Object.fromEntries(((mem ?? []) as { id: string; username: string }[]).map((m) => [m.id, m.username])));
      setReady("ok");
    })();
  }, [router]);

  async function onFile(file: File) {
    setError(null); setResults(null); setBusy(true);
    try {
      const table = await parseExcelFile(file);
      const arabicCol = detectArabicPlateColumn(table.headers) ?? detectArabicPlateColumnByContent(table.headers, table.rows);
      const plateCol = arabicCol ?? detectPlateColumn(table.headers, table.rows);
      if (!plateCol) { setError("مش لاقي عمود لوحة في الملف."); return; }
      const entries = collectReferralEntries([{ rows: table.rows, plateCol, isArabic: arabicCol !== null }]);
      setRefCount(entries.length);
      const normMap = new Map<string, Record<string, string>>();
      for (const e of entries) if (!normMap.has(e.norm)) normMap.set(e.norm, e.row);
      const norms = [...normMap.keys()];
      if (norms.length === 0) { setError("مفيش لوحات في الملف."); return; }

      const { data, error: rpcErr } = await supabase.rpc("match_group_plates", { p_norms: norms });
      if (rpcErr) { setError("تعذّر الفرز على السيرفر: " + rpcErr.message); return; }
      const rows = (data ?? []) as Omit<Match, "refRow">[];
      const matches: Match[] = rows
        .map((r) => ({ ...r, refRow: normMap.get(normalizePlate(bankPlateToArabic(r.plate))) ?? null }))
        .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1));
      setResults(matches);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setError(/password|protected|محمي|كلمة/i.test(msg) ? "الملف محمي بكلمة مرور — افتحه واحفظه بدون حماية." : "تعذّر قراءة الملف: " + msg);
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <main className="min-h-screen bg-night pb-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition hover:text-ink">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> فرز على سجلات المجموعة</h1>
            {ready === "ok" && <p className="text-[11px] text-muted">مجموعة «{team}»</p>}
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
            <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              ارفع ملف الإحالة، والبرنامج هيفرزه على **كل سجلات المجموعة** (على السيرفر) ويطلّعلك السيارات المطلوبة اللي أي حد في المجموعة لقاها — ببياناتها ومكانها.
            </p>

            <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsb,.ods,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition active:scale-[0.99] disabled:opacity-60">
              <FileUp size={17} /> {busy ? "جارٍ الفرز على السيرفر..." : "ارفع الإحالة وافرز"}
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
                <AlertCircle size={15} className="shrink-0" /> {error}
              </div>
            )}

            {results && (
              <>
                <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-center">
                  <p className="text-3xl font-black text-primary">{results.length.toLocaleString("ar-EG")}</p>
                  <p className="text-[11px] text-muted">سيارة مطلوبة اتلاقت في سجلات المجموعة (من {refCount.toLocaleString("ar-EG")} لوحة في الإحالة)</p>
                </div>

                <div className="flex flex-col gap-2">
                  {results.map((r) => {
                    const info = r.refRow ? Object.entries(r.refRow).filter(([, v]) => v && String(v).trim()).slice(0, 6) : [];
                    return (
                      <div key={r.id} className="rounded-xl border border-border bg-surface p-2.5">
                        <div className="flex items-center gap-2.5">
                          <PlateBadge value={r.plate} size="sm" />
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate text-xs font-bold text-ink">لقاها: {names[r.agent_id] ?? "—"}</p>
                            <p className="text-[10px] text-muted">{fmtDate(r.checked_at)}{r.method ? ` · ${r.method}` : ""}</p>
                          </div>
                          {r.maps_link && (
                            <a href={r.maps_link} target="_blank" rel="noopener noreferrer"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20" title="الموقع">
                              <MapPin size={15} />
                            </a>
                          )}
                        </div>
                        {info.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface-2 p-2">
                            {info.map(([k, v], i) => (
                              <div key={i} className="flex min-w-0 gap-1 text-[11px]">
                                <span className="shrink-0 text-muted">{k}:</span>
                                <span className="truncate font-bold text-ink">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {results.length === 0 && <p className="py-8 text-center text-sm text-muted">مفيش أي سيارة من الإحالة اتلاقت في سجلات المجموعة.</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
