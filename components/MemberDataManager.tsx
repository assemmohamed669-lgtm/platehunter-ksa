"use client";

/**
 * 🗂️ «داتا الأعضاء» — لمسئول المجموعة في «إدارة مجموعتي» (المالك ١٥ أكتوبر ٢٠٢٦): يخصّص لكل عضو ملف داتا بعينه (مكة
 * لمحمد، الطايف لمحمود…). العضو بيلاقيه في الفرز «داتا من المسئول» ويفرز عليه **هو بس** بدل داتا المجموعة — من غير ما
 * يفتحه ولا ينزّله. ملف واحد لكل عضو (الجديد بيستبدل القديم). الأعضاء = أعضاء المجموعة دي بس (السيرفر بيتأكد).
 * `lib/memberData.ts` · `/api/group/member-data` · `docs/sql/member-data.sql`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Loader2, Upload, Trash2, Plus, AlertCircle, FileSpreadsheet } from "lucide-react";
import { listMemberData, uploadMemberData, clearMemberData, type MemberDataRow } from "@/lib/memberData";

const TZ = "Asia/Riyadh";
const ar = (n: number) => n.toLocaleString("ar-EG");
const fmtDayTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ar-EG", { timeZone: TZ, day: "numeric", month: "long" })} · ${d.toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
  } catch { return "—"; }
};
const ACCEPT = ".xlsx,.xls,.xlsb,.xlsm,.csv,.ods";
// الملف الكبير مابيتفتحش هنا (عشان الموبايل مايقعش) — العدد بيبان عند العضو بعد ما يتقري عنده.
const COUNT_LIMIT_BYTES = 3 * 1024 * 1024;

/** عدد الصفوف واللوحات (للملف الصغير بس). */
async function countFile(file: File): Promise<{ rowCount: number | null; plateCount: number | null }> {
  if (file.size > COUNT_LIMIT_BYTES) return { rowCount: null, plateCount: null };
  try {
    const [{ parseExcelFile }, { resolveDataPlateCol }, { normalizePlate, bankPlateToArabic }] = await Promise.all([
      import("@/lib/excel"), import("@/lib/dataSources"), import("@/lib/plateParser"),
    ]);
    const t = await parseExcelFile(file);
    const pc = resolveDataPlateCol(t.headers, t.rows, null);
    if (!pc) return { rowCount: t.rows.length, plateCount: null };
    const plates = new Set<string>();
    for (const r of t.rows) {
      const n = normalizePlate(bankPlateToArabic(String(r[pc] ?? "")));
      if (/[0-9]/.test(n) && /[^0-9]/.test(n)) plates.add(n);
    }
    return { rowCount: t.rows.length, plateCount: plates.size };
  } catch { return { rowCount: null, plateCount: null }; }
}

export default function MemberDataManager({ team }: { team: string }) {
  const [rows, setRows] = useState<MemberDataRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listMemberData(team);
    setMissing(!!r.missing);
    setRows(r.rows);
    if (r.error) setMsg({ ok: false, text: r.error });
    setLoading(false);
  }, [team]);
  useEffect(() => { setRows(null); setAdding(false); setPick(""); setMsg(null); void load(); }, [load]);

  const nameOf = (id: string) => rows?.find((r) => r.agentId === id)?.username ?? "العضو";

  function chooseFile(agentId: string) {
    targetRef.current = agentId;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const agentId = targetRef.current;
    if (!file || !agentId) return;
    setBusyId(agentId); setMsg(null);
    try {
      const counts = await countFile(file);
      await uploadMemberData(team, agentId, file, counts);
      setMsg({ ok: true, text: `✅ «${file.name}» اترفعت لـ${nameOf(agentId)} — هيفرز عليها هو بس` });
      setAdding(false); setPick("");
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `تعذّر الرفع: ${(err as Error)?.message ?? ""}` });
    } finally { setBusyId(null); }
  }

  async function remove(agentId: string) {
    if (!window.confirm(`تشيل الداتا المخصوصة من ${nameOf(agentId)}؟ هيرجع يفرز على داتا المجموعة.`)) return;
    setBusyId(agentId); setMsg(null);
    try {
      await clearMemberData(team, agentId);
      setMsg({ ok: true, text: `✅ اتشالت من ${nameOf(agentId)}` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `تعذّر: ${(err as Error)?.message ?? ""}` });
    } finally { setBusyId(null); }
  }

  if (missing) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-4 text-xs text-muted">
        <AlertCircle size={14} /> «داتا الأعضاء» محتاجة خطوة على Supabase الأول (member-data.sql).
      </p>
    );
  }

  const withFile = (rows ?? []).filter((r) => r.file);
  const withoutFile = (rows ?? []).filter((r) => !r.file);

  return (
    <div className="flex flex-col gap-2">
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void onFile(e)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted">
          ملف داتا لكل عضو — بيفرز عليه هو بس (بدل داتا المجموعة)، ومايقدرش يفتحه ولا ينزّله. الملف الجديد بيستبدل القديم.
        </p>
        <button onClick={() => void load()} disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} تحديث
        </button>
      </div>

      {msg && <p className={`text-center text-xs font-bold ${msg.ok ? "text-green-600" : "text-danger"}`}>{msg.text}</p>}
      {rows === null && <div className="flex justify-center py-6 text-muted"><Loader2 className="animate-spin" /></div>}

      {rows !== null && withFile.length === 0 && !adding && (
        <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-4 text-center text-xs text-muted">
          لسه مافيش عضو ليه داتا مخصوصة — كلهم بيفرزوا على داتا المجموعة.
        </p>
      )}

      {withFile.map((r) => {
        const f = r.file!;
        const busy = busyId === r.agentId;
        return (
          <div key={r.agentId} className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{r.username ?? "—"}</p>
                <p className="flex items-center gap-1 truncate text-[11px] font-bold text-primary">
                  <FileSpreadsheet size={12} className="shrink-0" /> <span className="truncate">{f.fileName}</span>
                </p>
                <p className="text-[10px] text-muted">
                  {f.rowCount != null ? `${ar(f.rowCount)} صف` : ""}
                  {f.plateCount != null ? ` · ${ar(f.plateCount)} لوحة` : ""}
                  {f.rowCount != null || f.plateCount != null ? " · " : ""}
                  اترفعت {fmtDayTime(f.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => chooseFile(r.agentId)} disabled={!!busyId}
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary disabled:opacity-50">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} تغيير
                </button>
                <button onClick={() => void remove(r.agentId)} disabled={!!busyId}
                  className="flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger disabled:opacity-50">
                  <Trash2 size={12} /> شيل
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {rows !== null && withoutFile.length > 0 && (adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
          <p className="text-xs font-bold text-ink">تخصيص داتا لعضو</p>
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink">
            <option value="">اختار العضو…</option>
            {withoutFile.map((r) => <option key={r.agentId} value={r.agentId}>{r.username ?? r.agentId.slice(0, 8)}</option>)}
          </select>
          <div className="flex gap-1.5">
            <button onClick={() => pick && chooseFile(pick)} disabled={!pick || !!busyId}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-night disabled:opacity-50">
              {busyId === pick && pick ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} اختار ملف الداتا
            </button>
            <button onClick={() => { setAdding(false); setPick(""); }} disabled={!!busyId}
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted disabled:opacity-50">إلغاء</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} disabled={!!busyId}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 py-2.5 text-xs font-bold text-primary disabled:opacity-50">
          <Plus size={14} /> تخصيص داتا لعضو
        </button>
      ))}
    </div>
  );
}
