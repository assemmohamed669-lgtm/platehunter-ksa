"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  RefreshCw,
  Trash2,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { getAllRecordings, deleteRecording, type RecordingEntry } from "@/lib/idb";
import { syncPending } from "@/lib/sync";
import { findDuplicates } from "@/lib/plateParser";
import { exportRecordingsToExcel } from "@/lib/excel";
import { supabase } from "@/lib/supabaseClient";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

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
        r.vehicleType?.includes(q)
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
          { label: "مكرر", val: stats.dups, color: "text-alert", icon: <AlertCircle size={14}/> },
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
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.map((entry) => {
          const isDup = duplicates.has(entry.plate.replace(/\s/g,"").toLowerCase());
          return (
            <div
              key={entry.localId}
              className={`rounded-xl border p-3 ${
                isDup ? "border-alert/60 bg-alert/10" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.plate.startsWith("📍") ? (
                    <span className="text-sm font-bold text-primary">{entry.plate}</span>
                  ) : (
                    <PlateBadge value={entry.plate} size="sm" />
                  )}
                  {entry.vehicleType && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {entry.vehicleType}
                    </span>
                  )}
                  {isDup && (
                    <span className="rounded-full bg-alert/20 px-2 py-0.5 text-xs font-bold text-alert">
                      مكرر!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.synced
                    ? <CheckCircle2 size={14} className="text-primary"/>
                    : <Clock size={14} className="text-muted"/>
                  }
                  <button
                    onClick={() => handleDelete(entry.localId)}
                    className="text-muted hover:text-danger transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {(entry.street || entry.lat) && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin size={11} />
                  {entry.street
                    ? `${entry.street}${entry.district ? " • " + entry.district : ""}`
                    : `${entry.lat?.toFixed(4)}°N, ${entry.lng?.toFixed(4)}°E`}
                  {entry.mapsLink && (
                    <a href={entry.mapsLink} target="_blank" rel="noopener noreferrer"
                      className="mr-1 text-primary underline">خريطة</a>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-muted/70">{formatDate(entry.recordedAt)}</p>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Database size={36} className="text-muted/30" />
            <p className="text-sm text-muted">
              {search ? "لا توجد نتائج للبحث." : "لا توجد سجلات بعد."}
            </p>
          </div>
        )}
      </div>

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
                  <>
                    <Download size={14} className="inline ml-1" />
                    تصدير Excel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
