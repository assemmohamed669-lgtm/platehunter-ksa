"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
  MapPin,
} from "lucide-react";
import { getAllRecordings, deleteRecording, type RecordingEntry } from "@/lib/idb";
import { syncPending } from "@/lib/sync";
import { findDuplicates } from "@/lib/plateParser";
import { exportRecordingsToExcel } from "@/lib/excel";
import { supabase } from "@/lib/supabaseClient";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const COLUMNS: { key: keyof RecordingEntry; label: string }[] = [
  { key: "plate",        label: "رقم اللوحة" },
  { key: "vehicleType",  label: "نوع السيارة" },
  { key: "street",       label: "الشارع" },
  { key: "district",     label: "الحي" },
  { key: "recordedAt",   label: "التاريخ" },
  { key: "notes",        label: "ملاحظات" },
  { key: "recorderName", label: "المسجّل" },
];

export default function CheckingPage() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPass, setExportPass] = useState("");
  const [exportPassError, setExportPassError] = useState<string | null>(null);
  const [verifyingExport, setVerifyingExport] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAgentId(data.user.id);
        load(data.user.id);
      }
    });
  }, []);

  async function load(aid: string) {
    const recs = await getAllRecordings(aid);
    setRecordings(recs);
  }

  async function handleSync() {
    if (!agentId) return;
    setSyncing(true);
    await syncPending(agentId);
    await load(agentId);
    setSyncing(false);
  }

  async function handleDelete(id: string) {
    await deleteRecording(id);
    if (agentId) load(agentId);
  }

  async function handleExport() {
    setExportPassError(null);
    setVerifyingExport(true);
    const { data: isValid, error } = await supabase.rpc("verify_secondary_password", {
      p_password: exportPass,
    });
    setVerifyingExport(false);
    if (error || !isValid) {
      setExportPassError("كلمة المرور غير صحيحة.");
      return;
    }
    exportRecordingsToExcel(recordings, `platehunter-${new Date().toISOString().slice(0,10)}`);
    setShowExportModal(false);
    setExportPass("");
  }

  const duplicates = useMemo(
    () => findDuplicates(recordings.map((r) => r.plate)),
    [recordings]
  );

  const filtered = useMemo(() => {
    if (!search) return recordings;
    const q = search.toLowerCase();
    return recordings.filter(
      (r) =>
        r.plate.toLowerCase().includes(q) ||
        r.street?.toLowerCase().includes(q) ||
        r.district?.toLowerCase().includes(q) ||
        r.vehicleType?.includes(q) ||
        r.recorderName?.toLowerCase().includes(q)
    );
  }, [recordings, search]);

  const stats = {
    total: recordings.length,
    synced: recordings.filter((r) => r.synced).length,
    dups: duplicates.size,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">التشيك</h1>
          <p className="text-xs text-muted">قاعدة البيانات الميدانية</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-ink transition"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            مزامنة
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-night"
          >
            <Download size={13} />
            تصدير
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "إجمالي", val: stats.total, color: "text-ink", icon: <Database size={14}/> },
          { label: "مزامَن", val: stats.synced, color: "text-primary", icon: <CheckCircle2 size={14}/> },
          { label: "مكرر",   val: stats.dups,   color: "text-alert",   icon: <AlertCircle size={14}/> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
            <div className={`flex items-center justify-center gap-1 ${s.color} mb-1`}>
              {s.icon}
              <span className="text-xl font-black">{s.val}</span>
            </div>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالرقم أو الشارع أو الحي..."
          className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          dir="rtl"
        />
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full border-collapse text-xs" style={{ direction: "rtl" }}>
            <thead>
              <tr className="bg-surface-2 text-muted">
                <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">#</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const isDup = duplicates.has(entry.plate.replace(/\s/g, "").toLowerCase());
                return (
                  <tr
                    key={entry.localId}
                    className={`border-b border-border transition ${
                      isDup ? "bg-alert/10 hover:bg-alert/20" : "hover:bg-surface-2"
                    }`}
                  >
                    {/* Row number + sync status */}
                    <td className="border-l border-border px-2 py-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-muted">{i + 1}</span>
                        {entry.synced
                          ? <CheckCircle2 size={11} className="text-primary" />
                          : <Clock size={11} className="text-muted" />
                        }
                      </div>
                    </td>

                    {COLUMNS.map((col) => {
                      const raw = entry[col.key];
                      const val = col.key === "recordedAt"
                        ? formatDate(String(raw ?? ""))
                        : String(raw ?? "");

                      return (
                        <td key={col.key} className="border-l border-border px-3 py-2">
                          {col.key === "plate" ? (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className={`font-bold ${isDup ? "text-alert" : "text-ink"}`}>
                                {entry.plate.startsWith("📍") ? entry.plate : val}
                              </span>
                              {isDup && (
                                <span className="rounded-full bg-alert/20 px-1.5 py-0.5 text-[10px] font-bold text-alert">
                                  مكرر
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink">{val || "—"}</span>
                          )}
                        </td>
                      );
                    })}

                    {/* GPS link */}
                    <td className="border-l border-border px-3 py-2">
                      {entry.mapsLink ? (
                        <a
                          href={entry.mapsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary underline whitespace-nowrap"
                        >
                          <MapPin size={11} /> خريطة
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* Delete */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => handleDelete(entry.localId)}
                        className="text-muted hover:text-danger transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Database size={36} className="text-muted/30" />
          <p className="text-sm text-muted">
            {search ? "لا توجد نتائج للبحث." : "لا توجد سجلات بعد."}
          </p>
        </div>
      )}

      {/* Export password modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <h3 className="mb-1 font-bold text-ink">تأكيد التصدير</h3>
            <p className="mb-3 text-xs text-muted">
              أدخل كلمة مرور الأدمن لتصدير البيانات إلى Excel.
            </p>
            <input
              type="password"
              value={exportPass}
              onChange={(e) => setExportPass(e.target.value)}
              placeholder="كلمة المرور"
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {exportPassError && (
              <p className="mb-3 text-xs text-danger">{exportPassError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowExportModal(false); setExportPass(""); setExportPassError(null); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted"
              >إلغاء</button>
              <button
                onClick={handleExport}
                disabled={verifyingExport}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60"
              >
                {verifyingExport ? "جارٍ التحقق..." : (
                  <span className="flex items-center justify-center gap-1">
                    <Download size={14} /> تصدير Excel
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
