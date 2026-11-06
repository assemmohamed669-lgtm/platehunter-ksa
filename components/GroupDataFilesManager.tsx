"use client";

/**
 * 📂 «ملفات الداتا» — لمسئول المجموعة في «إدارة مجموعتي» (المالك ٦ نوفمبر ٢٠٢٦): يرفع **كذا ملف داتا**، ولكل ملف يختار
 * يظهر لمين: **المجموعة كلها** أو **أعضاء معيّنين**. العضو بيفرز على كل الملفات اللي ليه مع بعض (الفرز / «شهايد
 * النهارده» / «صوت فقط») من غير ما يفتحها ولا ينزّلها. `lib/groupDataFiles.ts` · `/api/group/data-files` ·
 * `docs/sql/group-data-files.sql`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Loader2, Upload, Trash2, Plus, AlertCircle, FileSpreadsheet, Users, UserCheck } from "lucide-react";
import {
  listGroupFiles, uploadGroupFile, setGroupFileAudience, deleteGroupFile, GROUP_FILES_MAX,
  type GroupFileMeta, type GroupFileAudience,
} from "@/lib/groupDataFiles";
import { countFile } from "@/components/MemberDataManager";

const TZ = "Asia/Riyadh";
const ar = (n: number) => n.toLocaleString("ar-EG");
const fmtDayTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ar-EG", { timeZone: TZ, day: "numeric", month: "long" })} · ${d.toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
  } catch { return "—"; }
};
const ACCEPT = ".xlsx,.xls,.xlsb,.xlsm,.csv,.ods";

type Member = { id: string; username: string | null };

/** «المجموعة كلها» / «أعضاء معيّنين» + علامة قدام كل عضو. */
function AudiencePicker({ members, leaderId, audience, picked, onAudience, onToggle, disabled }: {
  members: Member[]; leaderId: string | null; audience: GroupFileAudience; picked: Set<string>;
  onAudience: (a: GroupFileAudience) => void; onToggle: (id: string) => void; disabled?: boolean;
}) {
  const btn = (on: boolean) => `flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${on ? "bg-primary text-night" : "border border-border bg-surface text-muted"}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-ink">الملف يظهر لمين؟</p>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onAudience("all")} disabled={disabled} className={btn(audience === "all")}>
          <Users size={13} /> المجموعة كلها
        </button>
        <button type="button" onClick={() => onAudience("members")} disabled={disabled} className={btn(audience === "members")}>
          <UserCheck size={13} /> أعضاء معيّنين
        </button>
      </div>
      {audience === "members" && (
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = picked.has(m.id);
            return (
              <button key={m.id} type="button" onClick={() => onToggle(m.id)} disabled={disabled}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${on ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted"}`}>
                {on ? "✓ " : ""}{m.username ?? m.id.slice(0, 8)}{m.id === leaderId ? " (انت)" : ""}
              </button>
            );
          })}
          {members.length === 0 && <p className="text-[11px] text-muted">مافيش أعضاء في المجموعة.</p>}
        </div>
      )}
      {audience === "all" && <p className="text-[10px] text-muted">كل أعضاء المجموعة هيفرزوا عليه (من غيرك — انت اللي رافعه).</p>}
    </div>
  );
}

export default function GroupDataFilesManager({ team }: { team: string }) {
  const [files, setFiles] = useState<GroupFileMeta[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);   // رقم الملف أو «new»
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // رفع جديد
  const [adding, setAdding] = useState(false);
  const [audience, setAudience] = useState<GroupFileAudience>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // تعديل «مين يشوفه» لملف
  const [editId, setEditId] = useState<string | null>(null);
  const [editAud, setEditAud] = useState<GroupFileAudience>("all");
  const [editPicked, setEditPicked] = useState<Set<string>>(new Set());
  const newRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<GroupFileMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listGroupFiles(team);
    setMissing(!!r.missing);
    setFiles(r.files);
    setMembers(r.members);
    setLeaderId(r.leaderId);
    if (r.error) setMsg({ ok: false, text: r.error });
    setLoading(false);
  }, [team]);
  useEffect(() => {
    setFiles(null); setAdding(false); setEditId(null); setMsg(null); setProgress(null);
    void load();
  }, [load]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.username ?? "عضو";
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const audienceOk = (a: GroupFileAudience, p: Set<string>) => a === "all" || p.size > 0;
  const audienceText = (f: GroupFileMeta) => (f.audience === "all"
    ? "👥 المجموعة كلها"
    : `👤 ${f.memberIds.map(nameOf).join("، ") || "—"}`);

  /** رفع ملف أو أكتر بنفس «مين يشوفه». */
  async function onNewFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length === 0 || !audienceOk(audience, picked)) return;
    const room = GROUP_FILES_MAX - (files?.length ?? 0);
    if (list.length > room) {
      setMsg({ ok: false, text: `الحد ${ar(GROUP_FILES_MAX)} ملف للمجموعة — فاضل مكان لـ${ar(Math.max(0, room))} بس.` });
      return;
    }
    setBusy("new"); setMsg(null);
    const done: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setProgress(list.length > 1 ? `بيرفع ${ar(i + 1)} من ${ar(list.length)}: ${file.name}` : `بيرفع ${file.name}…`);
        const counts = await countFile(file);
        await uploadGroupFile(team, file, counts, audience, audience === "all" ? [] : [...picked]);
        done.push(file.name);
      }
      setMsg({ ok: true, text: `✅ اترفع ${done.length > 1 ? `${ar(done.length)} ملفات` : `«${done[0]}»`} — ${audience === "all" ? "للمجموعة كلها" : `لـ${[...picked].map(nameOf).join("، ")}`}` });
      setAdding(false); setAudience("all"); setPicked(new Set());
    } catch (err) {
      setMsg({ ok: false, text: `${done.length ? `اترفع ${ar(done.length)} وبعدها ` : ""}تعذّر الرفع: ${(err as Error)?.message ?? ""}` });
    } finally {
      setBusy(null); setProgress(null);
      await load();
    }
  }

  function chooseReplace(f: GroupFileMeta) {
    replaceTarget.current = f;
    replaceRef.current?.click();
  }
  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const f = replaceTarget.current;
    if (!file || !f) return;
    setBusy(f.id); setMsg(null); setProgress(`بيرفع ${file.name}…`);
    try {
      const counts = await countFile(file);
      await uploadGroupFile(team, file, counts, f.audience, f.memberIds, f.id);
      setMsg({ ok: true, text: `✅ «${f.fileName}» اتغيّر لـ«${file.name}» — لنفس الناس` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `تعذّر الرفع: ${(err as Error)?.message ?? ""}` });
    } finally { setBusy(null); setProgress(null); }
  }

  function startEdit(f: GroupFileMeta) {
    setEditId(f.id); setEditAud(f.audience); setEditPicked(new Set(f.memberIds));
  }
  async function saveEdit(f: GroupFileMeta) {
    if (!audienceOk(editAud, editPicked)) return;
    setBusy(f.id); setMsg(null);
    try {
      await setGroupFileAudience(team, f.id, editAud, editAud === "all" ? [] : [...editPicked]);
      setMsg({ ok: true, text: `✅ «${f.fileName}» بقى ${editAud === "all" ? "للمجموعة كلها" : `لـ${[...editPicked].map(nameOf).join("، ")}`}` });
      setEditId(null);
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `تعذّر: ${(err as Error)?.message ?? ""}` });
    } finally { setBusy(null); }
  }

  async function remove(f: GroupFileMeta) {
    if (!window.confirm(`تشيل «${f.fileName}»؟ الأعضاء مش هيفرزوا عليه تاني.`)) return;
    setBusy(f.id); setMsg(null);
    try {
      await deleteGroupFile(team, f.id);
      setMsg({ ok: true, text: `✅ «${f.fileName}» اتشال` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: `تعذّر: ${(err as Error)?.message ?? ""}` });
    } finally { setBusy(null); }
  }

  if (missing) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-4 text-xs text-muted">
        <AlertCircle size={14} /> «ملفات الداتا» محتاجة خطوة على Supabase الأول (group-data-files.sql).
      </p>
    );
  }

  const count = files?.length ?? 0;
  return (
    <div className="flex flex-col gap-2" dir="rtl">
      <input ref={newRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void onNewFiles(e)} />
      <input ref={replaceRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void onReplace(e)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted">
          ارفع كذا ملف داتا، ولكل ملف اختار يظهر لمين: المجموعة كلها أو أعضاء معيّنين. كل عضو بيفرز على كل الملفات اللي ليه
          مع بعض، ومايقدرش يفتحها ولا ينزّلها. (حد أقصى {ar(GROUP_FILES_MAX)} ملف)
        </p>
        <button onClick={() => void load()} disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} تحديث
        </button>
      </div>

      {msg && <p className={`text-center text-xs font-bold ${msg.ok ? "text-green-600" : "text-danger"}`}>{msg.text}</p>}
      {progress && <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary"><Loader2 size={13} className="animate-spin" /> {progress}</p>}
      {files === null && <div className="flex justify-center py-6 text-muted"><Loader2 className="animate-spin" /></div>}

      {files !== null && count === 0 && !adding && (
        <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-4 text-center text-xs text-muted">
          لسه مارفعتش ملفات هنا.
        </p>
      )}

      {(files ?? []).map((f) => {
        const isBusy = busy === f.id;
        const editing = editId === f.id;
        return (
          <div key={f.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-sm font-bold text-ink">
                  <FileSpreadsheet size={14} className="shrink-0 text-primary" /> <span className="truncate">{f.fileName}</span>
                </p>
                <p className="text-[11px] font-bold text-primary">{audienceText(f)}</p>
                <p className="text-[10px] text-muted">
                  {f.rowCount != null ? `${ar(f.rowCount)} صف` : ""}
                  {f.plateCount != null ? ` · ${ar(f.plateCount)} لوحة` : ""}
                  {f.rowCount != null || f.plateCount != null ? " · " : ""}
                  اترفع {fmtDayTime(f.updatedAt)}
                </p>
              </div>
              {isBusy && <Loader2 size={16} className="shrink-0 animate-spin text-muted" />}
            </div>
            {editing ? (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
                <AudiencePicker members={members} leaderId={leaderId} audience={editAud} picked={editPicked}
                  onAudience={setEditAud} onToggle={(id) => setEditPicked((p) => toggle(p, id))} disabled={!!busy} />
                <div className="flex gap-1.5">
                  <button onClick={() => void saveEdit(f)} disabled={!!busy || !audienceOk(editAud, editPicked)}
                    className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-night disabled:opacity-50">حفظ</button>
                  <button onClick={() => setEditId(null)} disabled={!!busy}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted disabled:opacity-50">إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => startEdit(f)} disabled={!!busy}
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary disabled:opacity-50">
                  <Users size={12} /> مين يشوفه
                </button>
                <button onClick={() => chooseReplace(f)} disabled={!!busy}
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink disabled:opacity-50">
                  <Upload size={12} /> تغيير الملف
                </button>
                <button onClick={() => void remove(f)} disabled={!!busy}
                  className="flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger disabled:opacity-50">
                  <Trash2 size={12} /> شيل
                </button>
              </div>
            )}
          </div>
        );
      })}

      {files !== null && (adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
          <AudiencePicker members={members} leaderId={leaderId} audience={audience} picked={picked}
            onAudience={setAudience} onToggle={(id) => setPicked((p) => toggle(p, id))} disabled={!!busy} />
          <div className="flex gap-1.5">
            <button onClick={() => newRef.current?.click()} disabled={!!busy || !audienceOk(audience, picked)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-night disabled:opacity-50">
              {busy === "new" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} اختار ملف أو أكتر
            </button>
            <button onClick={() => { setAdding(false); setAudience("all"); setPicked(new Set()); }} disabled={!!busy}
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted disabled:opacity-50">إلغاء</button>
          </div>
        </div>
      ) : count < GROUP_FILES_MAX && (
        <button onClick={() => setAdding(true)} disabled={!!busy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 py-2.5 text-xs font-bold text-primary disabled:opacity-50">
          <Plus size={14} /> رفع ملفات داتا
        </button>
      ))}
    </div>
  );
}
