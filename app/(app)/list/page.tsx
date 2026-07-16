"use client";

/**
 * صفحة قائمة لوحات موحّدة — بتوصلها من كروت الإحصائيات في القائمة الجانبية عبر
 * ?type=records|wanted|voice:
 *   - records → كل لوحات شيت السجلات (field_check).
 *   - wanted  → المطلوبين اللي اتلاقوا (field_check المطابقة لملف التشييك).
 *   - voice   → لوحات التسجيلات الصوتية (recordings, !isManual).
 * بتقرا من المخزّن الدائم (IndexedDB) فبتفضل موجودة حتى لو المندوب مسح نتيجة
 * التشييك المؤقتة. فيها مسح يدوي + مشاركة (RecordingsTable).
 */
import { useEffect, useState } from "react";
import { Crosshair, ScanLine, Mic } from "lucide-react";
import RecordingsTable from "@/components/RecordingsTable";
import {
  getAllFieldCheckEntries, getAllRecordings, getUploadedFile,
  deleteFieldCheckEntry, deleteRecording,
  type RecordingEntry, type FieldCheckEntry,
} from "@/lib/idb";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { supabase } from "@/lib/supabaseClient";

type ListType = "records" | "wanted" | "voice";

const META: Record<ListType, { title: string; icon: typeof Crosshair; desc: string }> = {
  records: { title: "لوحات السجلات", icon: ScanLine, desc: "كل اللوحات في شيت السجلات." },
  wanted: { title: "مطلوبة اتلاقت", icon: Crosshair, desc: "السيارات المطلوبة اللي اتلاقت." },
  voice: { title: "التسجيلات الصوتية", icon: Mic, desc: "لوحات التسجيل الصوتي." },
};

function fieldToRec(e: FieldCheckEntry): RecordingEntry {
  return {
    localId: e.id,
    agentId: e.agentId || "",
    plate: e.plate,
    vehicleType: e.row?.["النوع"] || e.row?.["نوع السيارة"] || undefined,
    street: e.row?.["الشارع"] || undefined,
    district: e.row?.["الحي"] || e.row?.["اسم الموقع"] || undefined,
    notes: e.method || e.row?.["ملاحظات"] || undefined,
    lat: e.lat,
    lng: e.lng,
    mapsLink: e.mapsLink,
    recordedAt: e.checkedAt,
    synced: true,
  };
}

export default function ListPage() {
  const [type, setType] = useState<ListType>("records");
  const [rows, setRows] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const t = (new URLSearchParams(window.location.search).get("type") || "records") as ListType;
      setType(META[t] ? t : "records");
      const kind: ListType = META[t] ? t : "records";

      if (kind === "voice") {
        const { data } = await supabase.auth.getUser();
        const recs = data.user ? await getAllRecordings(data.user.id) : [];
        setRows(recs.filter((r) => !r.isManual));
        return;
      }

      const entries = await getAllFieldCheckEntries();
      if (kind === "wanted") {
        const check = await getUploadedFile("local", "check");
        if (!check) { setRows([]); return; }
        const col = detectPlateColumn(check.headers, check.rows);
        const wanted = new Set(
          check.rows.map((r) => normalizePlate(bankPlateToArabic(String(r[col ?? ""] ?? "")))).filter(Boolean),
        );
        setRows(entries.filter((e) => wanted.has(normalizePlate(bankPlateToArabic(e.plate)))).map(fieldToRec));
      } else {
        setRows(entries.map(fieldToRec));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function handleDelete(id: string) {
    if (type === "voice") await deleteRecording(id); else await deleteFieldCheckEntry(id);
    setRows((prev) => prev.filter((r) => r.localId !== id));
  }
  async function handleDeleteMany(ids: string[]) {
    for (const id of ids) { if (type === "voice") await deleteRecording(id); else await deleteFieldCheckEntry(id); }
    const s = new Set(ids);
    setRows((prev) => prev.filter((r) => !s.has(r.localId)));
  }

  const meta = META[type];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon size={20} className="text-primary" />
        <div>
          <h1 className="text-lg font-bold text-ink">{meta.title}</h1>
          <p className="text-xs text-muted">{meta.desc}</p>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">جاري التحميل...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-sm text-muted" dir="rtl">
          مفيش لوحات هنا لسه.
        </p>
      ) : (
        <RecordingsTable
          recordings={rows}
          onDelete={handleDelete}
          onDeleteMany={handleDeleteMany}
        />
      )}
    </div>
  );
}
