"use client";

/**
 * صفحة «أرقام الشاص» — سجل تشييك الشاص (رقم الهيكل) اللي المندوب دخّله من
 * التشييك (كاميرا/رفع/كتابة، وضع «شاص»). بيعرض كل رقم مع حالته (مطلوب/مشتبه/غير
 * مطابق) + لوحة السيارة والبنك والنوع لو طابق + الموقع والوقت. فيه:
 *   • «تصدير لملف الشاص» → شيت إكسيل منفصل لأرقام الشاص (فتح/مشاركة).
 *   • الفرز على الإحالات بالشاص بيتعمل من صفحة الفرز (وضع «فرز بالشاص»).
 */
import { useEffect, useState, useCallback } from "react";
import { Barcode, FileSpreadsheet, Share2, Trash2, MapPin, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getAllChassisEntries, deleteChassisEntry, clearChassisEntries, type ChassisEntry } from "@/lib/idb";
import { buildChassisExportRows } from "@/lib/chassisRecords";
import { buildSpreadsheetBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";
import PlateBadge from "@/components/PlateBadge";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export default function ChassisPage() {
  const [entries, setEntries] = useState<ChassisEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getAllChassisEntries().then(setEntries).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const onAdd = () => load();
    window.addEventListener("chassisEntryAdded", onAdd);
    return () => window.removeEventListener("chassisEntryAdded", onAdd);
  }, [load]);

  async function exportFile(share: boolean) {
    if (entries.length === 0 || busy) return;
    setBusy(true);
    try {
      const rows = buildChassisExportRows(entries);
      const { blob, ext } = buildSpreadsheetBlob(rows, "أرقام الشاص");
      const name = `ارقام-الشاص-${todayStamp()}.${ext}`;
      if (share) await shareExcelBlob(blob, name, "شيت أرقام الشاص");
      else await openExcelBlob(blob, name);
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذّر تصدير ملف الشاص.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(id: string) {
    await deleteChassisEntry(id).catch(() => {});
    load();
  }

  async function clearAll() {
    if (entries.length === 0) return;
    if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${entries.length} رقم شاص؟ مش هيرجعوا.`)) return;
    await clearChassisEntries().catch(() => {});
    load();
  }

  const matched = entries.filter((e) => e.found).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Barcode size={20} className="text-brand" />
        <div>
          <h1 className="text-lg font-bold text-ink">أرقام الشاص</h1>
          <p className="text-xs text-muted">سجل تشييك الشاص — {entries.length} رقم ({matched} مطابق).</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => exportFile(false)}
          disabled={entries.length === 0 || busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-50 active:scale-[0.99]"
        >
          <FileSpreadsheet size={16} /> تصدير لملف الشاص
        </button>
        <button
          onClick={() => exportFile(true)}
          disabled={entries.length === 0 || busy}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm font-bold text-ink transition disabled:opacity-50 active:scale-95"
        >
          <Share2 size={16} />
        </button>
      </div>

      <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-[11px] text-muted">
        للفرز على الإحالات بالشاص: روح صفحة «الفرز» → وضع «فرز بالشاص».
      </p>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-2 py-10 text-center text-sm text-muted">
          مفيش أرقام شاص متسجّلة.
          <br />
          شيّك شاص من: التشييك → كاميرا → تبويب «شاص».
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={clearAll} className="flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-bold text-danger active:scale-95 transition">
              <Trash2 size={13} /> مسح الكل
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {entries.map((e) => {
              const fuzzy = e.matchType === "fuzzy";
              return (
                <div
                  key={e.id}
                  className={`rounded-2xl border p-3 ${e.found ? (fuzzy ? "border-alert/50 bg-alert/5" : "border-brand/50 bg-brand/5") : "border-border bg-surface-2"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {e.found ? (
                          fuzzy ? <AlertTriangle size={15} className="shrink-0 text-alert" /> : <CheckCircle2 size={15} className="shrink-0 text-brand" />
                        ) : (
                          <XCircle size={15} className="shrink-0 text-muted" />
                        )}
                        <span dir="ltr" className="truncate font-mono text-sm font-bold text-ink">{e.chassis}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold">
                        {e.found ? (
                          <span className={fuzzy ? "text-alert" : "text-brand"}>{fuzzy ? `مشتبه ${e.similarity ?? ""}%` : "مطلوب"}</span>
                        ) : (
                          <span className="text-muted">غير مطابق</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeOne(e.id)} className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-danger active:scale-95">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {e.found && (e.plate || e.bank || e.vehicleType) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {e.plate && <PlateBadge value={e.plate} size="sm" />}
                      {e.bank && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink">بنك: {e.bank}</span>}
                      {e.vehicleType && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink">{e.vehicleType}</span>}
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{fmt(e.checkedAt)}</span>
                    {e.mapsLink ? (
                      <a href={e.mapsLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand underline">
                        <MapPin size={12} /> خريطة
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 opacity-60"><MapPin size={12} /> بدون موقع</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
