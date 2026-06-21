"use client";

import { useState, useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import RecordingsTable from "@/components/RecordingsTable";
import { getAllRecordings, deleteRecording, type RecordingEntry } from "@/lib/idb";
import { syncPending } from "@/lib/sync";
import { exportRecordingsToExcel } from "@/lib/excel";
import { supabase } from "@/lib/supabaseClient";

export default function CheckingPage() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
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

  async function handleDeleteMany(ids: string[]) {
    for (const id of ids) await deleteRecording(id);
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

      {/* Table */}
      {recordings.length > 0 ? (
        <RecordingsTable
          recordings={recordings}
          onDelete={handleDelete}
          onDeleteMany={handleDeleteMany}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted">لا توجد سجلات بعد.</p>
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
