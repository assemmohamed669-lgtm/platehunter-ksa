"use client";

/**
 * ✏️ تعديل ملف الداتا — بتتفتح من زرار «تعديل» تحت ملف الداتا في صفحة الفرز (`?slot=data` أو `data-N`).
 *
 * المالك (١٤ أكتوبر ٢٠٢٦): «علامه بحث يقدر المندوب من خلالها يبحث عن سيارة … تظهرلو … بكل الاعمدة … 10 لوحات قبلها
 * و10 لوحات بعدها … لو مكررة … يظهرلو ال20 … يحذف اللوحه دي تتحذف من الشيت نهائي … يضيف في عمود الملاحظات او في اي
 * عمود … لينك جي بي اس … يدوس حفظ ف يتحفظ كل التغييرات … ويتقالو انه سيتم حفظ التعديلات او سيتم مسح اللوحات».
 * المحرّك: `lib/dataEdit.ts` · الجدول: `components/DataEditTable.tsx`.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Save, Trash2, X, Loader2, Share2, AlertTriangle, CheckCircle2, ArrowRight, Lock, FileSpreadsheet } from "lucide-react";
import DataEditTable from "@/components/DataEditTable";
import {
  DATA_EDIT_FOR_ALL, editorHeaders, editSummary, exportDataFile, listEditableDataFiles, loadDataFileInfo,
  saveDataEdits, searchDataFile, startXlsxExport, type DataFileRef, type EditRow, type SearchResult, type DataExport,
} from "@/lib/dataEdit";
import { shareExcelBlob } from "@/lib/excel";
import { gpsService, toMapsLink } from "@/lib/gps";
import { supabase } from "@/lib/supabaseClient";

type FileItem = { ref: DataFileRef; label: string; fileName: string; rowCount: number };
type Msg = { level: "ok" | "warn" | "error"; text: string };

const ar = (n: number) => n.toLocaleString("ar-EG");

export default function DataEditPage() {
  // 🛑 السوبر أدمن الأول (`DATA_EDIT_FOR_ALL`)
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { setIsSuper(false); return; }
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        setIsSuper((prof as { is_super?: boolean } | null)?.is_super === true);
      } catch { setIsSuper(false); }
    })();
  }, []);
  const allowed = DATA_EDIT_FOR_ALL || isSuper === true;

  // قفل الداتا من صفحة الفرز — «محدش يقدر يمسحها»: البحث شغّال، الحفظ لأ.
  const [locked, setLocked] = useState(false);
  useEffect(() => { try { setLocked(localStorage.getItem("ph:sorting:dataLocked") === "1"); } catch { /* ignore */ } }, []);

  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [fileIdx, setFileIdx] = useState(0);
  /**
   * ✏️ المربع اللي اتفتح منه «تعديل» — الصفحة بتفضل على **ملفه هو بس** (المالك ١٨ أكتوبر ٢٠٢٦: «عايز كل واحده تبقي خاصه
   * ب مربعها والتعديل فيها ل وحدها»). ملفه مش موجود ⇒ بنقول كده، مش بنفتح ملف تاني (كانت بتفتح الداتا الأساسية).
   */
  const [boxSlot, setBoxSlot] = useState<string | null>(null);
  const [boxLabel, setBoxLabel] = useState<string | null>(null);
  const [boxMissing, setBoxMissing] = useState(false);
  const file = boxMissing ? null : (files?.[fileIdx] ?? null);
  const [headers, setHeaders] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const list = await listEditableDataFiles().catch(() => []);
      const qs = new URLSearchParams(window.location.search);
      const want = qs.get("slot");
      setBoxSlot(want);
      setBoxLabel(qs.get("box"));
      const i = want ? list.findIndex((f) => f.ref.slot === want) : 0;
      if (want && i < 0) setBoxMissing(true);
      else setFileIdx(Math.max(0, i));
      setFiles(list);
    })();
  }, []);
  useEffect(() => {
    if (!file) return;
    loadDataFileInfo(file.ref).then((info) => setHeaders(editorHeaders(info.headers).headers)).catch(() => setHeaders([]));
  }, [file]);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [deletes, setDeletes] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "search" | "save" | "export">(null);
  // 📗 التصدير: أنهي صيغة شغّالة + وصل لكام ٪ (الملف الكبير)
  const [exporting, setExporting] = useState<null | "xlsx" | "csv">(null);
  const [exportPct, setExportPct] = useState<number | null>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pending = useMemo(() => {
    let cells = 0, rows = 0;
    for (const [loc, p] of Object.entries(edits)) {
      if (deletes.has(loc)) continue;
      const n = Object.keys(p).length;
      if (n) { cells += n; rows++; }
    }
    return { cells, rows, deletes: deletes.size };
  }, [edits, deletes]);
  const hasPending = pending.cells + pending.deletes > 0;
  // ملف متعدد الورقات ممكن أعمدة ورقة تختلف عن التانية ⇒ أي عمود موجود في الصفوف اللي ظاهرة بيظهر برضه.
  const shownHeaders = useMemo(() => {
    const out = [...headers];
    for (const r of result?.rows ?? []) for (const k of Object.keys(r.row)) if (k && !out.includes(k)) out.push(k);
    return out;
  }, [headers, result]);

  function resetPending() { setEdits({}); setDeletes(new Set()); setPicked(new Set()); }

  async function runSearch() {
    if (!file || !query.trim()) return;
    if (hasPending && !confirm("عندك تعديلات ماتحفظتش — هتضيع لو دوّرت على لوحة تانية. تكمّل؟")) return;
    setBusy("search"); setMsg(null);
    try {
      setResult(await searchDataFile(file.ref, query));
      resetPending();
    } catch (e) {
      setMsg({ level: "error", text: (e as Error)?.message ?? "تعذّر البحث." });
    } finally { setBusy(null); }
  }

  function onCell(r: EditRow, h: string, v: string) {
    setEdits((prev) => {
      const cur = { ...(prev[r.loc] ?? {}) };
      if ((r.row[h] ?? "") === v) delete cur[h]; else cur[h] = v;
      const next = { ...prev };
      if (Object.keys(cur).length) next[r.loc] = cur; else delete next[r.loc];
      return next;
    });
  }
  function onPick(loc: string) {
    setPicked((s) => { const n = new Set(s); if (n.has(loc)) n.delete(loc); else n.add(loc); return n; });
  }
  function deletePicked() {
    setDeletes((s) => new Set([...s, ...picked]));
    setPicked(new Set());
  }
  function undoDelete(loc: string) {
    setDeletes((s) => { const n = new Set(s); n.delete(loc); return n; });
  }
  async function onMyLocation(r: EditRow, h: string) {
    setLocating(`${r.loc}|${h}`);
    try {
      const fix = await gpsService.getFreshFix({ timeoutMs: 12000, maxAccuracyM: 100 });
      if (!fix) { setMsg({ level: "warn", text: "⚠️ ماقدرتش أجيب موقعك — شغّل الـGPS وجرّب تاني." }); return; }
      onCell(r, h, toMapsLink(fix.lat, fix.lng));
    } catch {
      setMsg({ level: "warn", text: "⚠️ ماقدرتش أجيب موقعك — اسمح للبرنامج بالموقع وجرّب تاني." });
    } finally { setLocating(null); }
  }

  async function doSave() {
    if (!file || !result) return;
    setBusy("save");
    try {
      const res = await saveDataEdits(file.ref, { edits, deletes: [...deletes] }, result?.stamp);
      const parts: string[] = [];
      if (res.cells) parts.push(`✅ اتحفظت التعديلات في الشيت (${ar(res.cells)} خانة)`);
      if (res.deleted) parts.push(`✅ اتمسح ${ar(res.deleted)} صف من الشيت`);
      resetPending();
      setConfirmOpen(false);
      // الشاشة زي الشيت بعد الحفظ بالظبط
      setResult(await searchDataFile(file.ref, result.query));
      const list = await listEditableDataFiles().catch(() => files ?? []);
      setFiles(list);
      setMsg({ level: "ok", text: `${parts.join(" · ") || "✅ اتحفظ"} — اعمل فرز تاني عشان النتيجة تمشي على التعديل.` });
      // ⚡ الملف الكبير: Excel بيبدأ يتجهّز في الخلفية دلوقتي ⇒ «تصدير Excel» بعدها بشوية بيبقى فوري
      if (file.ref.kind === "large") {
        const ref = file.ref;
        void loadDataFileInfo(ref).then((info) => { startXlsxExport(ref, info.stamp); }).catch(() => {});
      }
    } catch (e) {
      setConfirmOpen(false);
      setMsg({ level: "error", text: `❌ ${(e as Error)?.message ?? "تعذّر الحفظ."}` });
    } finally { setBusy(null); }
  }

  /**
   * 📗 تصدير بالصيغة اللي اختارها — المالك (١٨ أكتوبر ٢٠٢٦): «يختار يصدر الملف باي صيغه». Excel للملف الكبير بيتعمل
   * «حتة حتة» ولو كان اتجهّز في الخلفية بعد الحفظ بيطلع على طول.
   */
  async function doExport(format: "xlsx" | "csv") {
    if (!file) return;
    if (hasPending && !confirm("فيه تعديلات لسه ماتحفظتش — التصدير هيطلع الشيت من غيرها. تكمّل؟")) return;
    const total = Math.max(1, file.rowCount);
    const pct = (n: number) => Math.min(100, Math.round((n / total) * 100));
    setBusy("export"); setExporting(format); setExportPct(null); setMsg(null);
    try {
      let out: DataExport;
      if (format === "xlsx" && file.ref.kind === "large") {
        const job = startXlsxExport(file.ref, (await loadDataFileInfo(file.ref)).stamp);
        setExportPct(pct(job.done));
        const off = job.onProgress((n) => setExportPct(pct(n)));
        try { out = await job.promise; } finally { off(); }
      } else {
        out = await exportDataFile(file.ref, { format, onRows: (n) => setExportPct(pct(n)) });
      }
      if (out.fellBack) setMsg({ level: "warn", text: "⚠️ الموبايل ده مايقدرش يعمل Excel للملف الكبير ده — اتعمل CSV (بيتفتح في الإكسيل عادي)." });
      await shareExcelBlob(out.blob, out.name, "الشيت بعد التعديل", { keepName: true, rtlDone: out.rtlDone });
    } catch (e) {
      setMsg({ level: "error", text: `❌ ${(e as Error)?.message ?? "تعذّر التصدير."}` });
    } finally { setBusy(null); setExporting(null); setExportPct(null); }
  }

  if (isSuper === null && !DATA_EDIT_FOR_ALL) return <div className="flex justify-center py-10 text-muted"><Loader2 className="animate-spin" /></div>;
  if (!allowed) {
    return <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted" dir="rtl">الصفحة دي لسه مش متاحة.</p>;
  }

  const status = !result ? null
    : result.matches === 0 ? { cls: "bg-surface-2 text-muted", text: "اللوحة دي مش موجودة في الشيت." }
    : result.matches === 1 ? { cls: "bg-emerald-600/10 text-emerald-600", text: "✅ موجودة مرة واحدة في الشيت — ومعاها اللي قبلها واللي بعدها في نفس المنطقة." }
    : { cls: "bg-alert/15 text-alert", text: `⚠️ موجودة ${ar(result.matches)} مرة في الشيت${result.truncated ? ` (ظاهر أول ${ar(result.rows.length)})` : ""}.` };

  return (
    <div className="flex flex-col gap-3 pb-28" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-ink">تعديل ملف الداتا</h1>
          {file && <p className="text-[11px] text-muted">{boxLabel ? `${boxLabel} · ` : ""}{file.fileName} · {ar(file.rowCount)} صف</p>}
        </div>
        <Link href="/sorting" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink">
          <ArrowRight size={13} /> الفرز
        </Link>
      </div>

      {boxMissing && (
        <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
          الملف بتاع المربع ده مش موجود — ارجع للفرز واتأكد إن المربع فيه ملف، وبعدين دوس «تعديل» اللي تحته.
        </p>
      )}
      {files && files.length === 0 && !boxMissing && (
        <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">مفيش ملف داتا — ارفعه الأول من صفحة الفرز.</p>
      )}
      {files && files.length > 1 && !boxSlot && (
        <select value={fileIdx} disabled={hasPending}
          onChange={(e) => { setFileIdx(Number(e.target.value)); setResult(null); resetPending(); }}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs font-bold text-ink">
          {files.map((f, i) => <option key={f.ref.slot} value={i}>{f.label} — {f.fileName}</option>)}
        </select>
      )}
      {locked && (
        <p className="flex items-center gap-1.5 rounded-lg bg-alert/10 px-3 py-2 text-[11px] font-bold text-alert">
          <Lock size={13} /> الداتا مقفولة — تقدر تدوّر، بس عشان تحفظ تعديل افتح القفل من صفحة الفرز.
        </p>
      )}

      {file && (
        <form onSubmit={(e) => { e.preventDefault(); void runSearch(); }} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اكتب رقم اللوحة…" dir="auto"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-primary" />
          <button type="submit" disabled={busy === "search" || !query.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-night disabled:opacity-50">
            {busy === "search" ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} بحث
          </button>
        </form>
      )}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-[12px] font-bold leading-relaxed ${
          msg.level === "ok" ? "bg-emerald-600/10 text-emerald-600" : msg.level === "warn" ? "bg-alert/10 text-alert" : "bg-danger/10 text-danger"}`}>
          {msg.text}
        </p>
      )}
      {status && <p className={`rounded-lg px-3 py-2 text-[12px] font-bold ${status.cls}`}>{status.text}</p>}

      {result && result.rows.length > 0 && (<>
        {picked.size > 0 && (
          <button onClick={deletePicked}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-danger/50 bg-danger/10 py-2 text-xs font-bold text-danger">
            <Trash2 size={14} /> امسح الصفوف المعلّمة من الشيت ({ar(picked.size)})
          </button>
        )}
        <DataEditTable headers={shownHeaders} rows={result.rows} edits={edits} deletes={deletes} picked={picked}
          onCell={onCell} onPick={onPick} onUndoDelete={undoDelete} onMyLocation={(r, h) => void onMyLocation(r, h)} locating={locating} />
        <p className="text-[10px] text-muted">اكتب في أي خانة زي الإكسيل · علّم ☐ على صف وامسحه · «📍 موقعي» بيحط موقعك دلوقتي في خانة الـGPS. ماحدش هيتحفظ غير لما تدوس «حفظ التغييرات».</p>
      </>)}

      {file && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-muted">تصدير الشيت بعد التعديل:</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void doExport("xlsx")} disabled={busy === "export"}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-600/50 bg-emerald-600/10 py-2.5 text-xs font-bold text-emerald-700 disabled:opacity-50">
              {exporting === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} تصدير Excel
            </button>
            <button onClick={() => void doExport("csv")} disabled={busy === "export"}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-bold text-ink disabled:opacity-50">
              {exporting === "csv" ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} تصدير CSV
            </button>
          </div>
          {exporting && (
            <p className="text-center text-[11px] font-bold text-primary">
              بيجهّز الملف…{exportPct != null && exportPct > 0 ? ` ${ar(exportPct)}٪` : ""}
            </p>
          )}
        </div>
      )}

      {/* شريط التعديلات اللي لسه ماتحفظتش */}
      {hasPending && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 flex justify-center px-3">
          <div className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-primary/50 bg-surface px-3 py-2.5 shadow-lg">
            <span className="flex-1 text-[11px] font-bold text-ink">
              {[pending.cells ? `${ar(pending.cells)} تعديل` : "", pending.deletes ? `${ar(pending.deletes)} صف هيتمسح` : ""].filter(Boolean).join(" · ")}
            </span>
            <button onClick={() => { if (confirm("تلغي كل التعديلات اللي ماتحفظتش؟")) resetPending(); }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted">إلغاء</button>
            <button onClick={() => setConfirmOpen(true)} disabled={locked || busy === "save"}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-night disabled:opacity-50">
              <Save size={13} /> حفظ التغييرات
            </button>
          </div>
        </div>
      )}

      {/* تأكيد الحفظ — «سيتم حفظ التعديلات / سيتم مسح اللوحات» */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => busy !== "save" && setConfirmOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4" dir="rtl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink"><AlertTriangle size={15} className="text-alert" /> تأكيد الحفظ</h3>
              <button onClick={() => setConfirmOpen(false)} disabled={busy === "save"} className="text-muted"><X size={17} /></button>
            </div>
            <ul className="mb-2 flex flex-col gap-1 text-[12px] font-bold text-ink">
              {editSummary(pending).map((l) => <li key={l}>• {l}</li>)}
            </ul>
            <p className="mb-3 text-[11px] text-muted">التعديل بيتحفظ في شيت الداتا اللي جوّه البرنامج، والفرز الجاي هيمشي عليه. ولو عايز ملف بالتعديلات دوس «تصدير Excel» أو «تصدير CSV».</p>
            <button onClick={() => void doSave()} disabled={busy === "save"}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-50">
              {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} احفظ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
