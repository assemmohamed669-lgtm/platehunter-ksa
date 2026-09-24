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
  getAllFieldCheckEntries, getAllRecordings,
  deleteFieldCheckEntries, deleteRecording,
  type RecordingEntry, type FieldCheckEntry,
} from "@/lib/idb";
import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { loadAllCheckSources, buildCombinedCheckIndex } from "@/lib/checkSheets";
import { wantedExtraColumns, wantedExtraValues } from "@/lib/wantedRowDetails";
import { supabase } from "@/lib/supabaseClient";
import { pushFieldCheckDeletes } from "@/lib/syncFieldCheck";
import { collapseDuplicateChecks, duplicateCheckIds } from "@/lib/fieldCheck";

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
  // معرّف الصف الظاهر → كل معرّفات مجموعته المخفية. المسح لازم يشيل المجموعة
  // كلها، وإلا يطلع مكان الممسوح أخوه والمندوب يقول «مسحته ورجع».
  const [dupGroups, setDupGroups] = useState<Map<string, string[]>>(new Map());
  /**
   * 📋 بيانات كل لوحة مطلوبة كاملة: صف السجل + **صف المحفظة** المطابق له.
   * المفتاح = `localId`. من غير ده الجدول بيعرض ٦ خانات بس والمندوب بيروح
   * للعربية وهو مش عارف موديلها ولا لونها ولا سنة صنعها.
   */
  const [detailsById, setDetailsById] = useState<Map<string, Record<string, string>>>(new Map());
  const [detailCols, setDetailCols] = useState<string[]>([]);

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

      // محرك الصوت بيعيد إرسال نفس النطق، فلوحة واحدة كانت بتطلع لحد ٨ مرات في
      // أقل من دقيقتين بنفس الـGPS. بنجمّع نفس اللوحة في نفس الدقيقة في صف واحد
      // **للعرض والتصدير بس** — السجل الأصلي في قاعدة البيانات مابيتمسحش.
      const allEntries = await getAllFieldCheckEntries();
      setDupGroups(duplicateCheckIds(allEntries));
      const entries = collapseDuplicateChecks(allEntries);
      if (kind === "wanted") {
        // 🔴 كانت بتقرا **ملف التشييك الأساسي بس** وبتتجاهل كل الملفات الإضافية —
        //    عكس صفحة التشييك نفسها اللي بتقراهم كلهم بـ`loadAllCheckSources`.
        //    النتيجة: لوحة اتلاقت مطلوبة من ملف إضافي **ماكانتش بتظهر هنا خالص**
        //    (بلاغ المالك ٢٤ سبتمبر: «١٠ مطلوبة وبيظهر ٤»). دلوقتي نفس المصدر
        //    ونفس الفهرس اللي بيقرّر «مطلوبة» في التشييك بالظبط.
        const sources = await loadAllCheckSources();
        const checkIndex = buildCombinedCheckIndex(sources);
        if (checkIndex.size === 0) { setRows([]); setDetailsById(new Map()); setDetailCols([]); return; }
        const keyOf = (plate: string) => normalizePlate(bankPlateToArabic(plate));
        const hits = entries.filter((e) => checkIndex.has(keyOf(e.plate)));
        // بيانات كاملة لكل صف: أعمدة السجل + أعمدة المحفظة المطابقة.
        const details = new Map<string, Record<string, string>>();
        for (const e of hits) details.set(e.id, wantedExtraValues(e.row, checkIndex.get(keyOf(e.plate))));
        setDetailsById(details);
        setDetailCols(wantedExtraColumns([...details.values()]));
        setRows(hits.map(fieldToRec));
      } else {
        setDetailsById(new Map()); setDetailCols([]);
        setRows(entries.map(fieldToRec));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // المسح لازم يوصل السيرفر كمان — من غير كده `restoreFieldChecks` بيسحب الصف
  // تاني أول ما المندوب يفتح صفحة التشييك، فالسجلات «بترجع بعد المسح».
  async function propagateDeletes() {
    try {
      const uid = (await supabase.auth.getSession()).data.session?.user?.id;
      if (uid) await pushFieldCheckDeletes(uid);
    } catch { /* أوفلاين — الشاهدة بتفضل وتتنفّذ المرة الجاية */ }
  }

  /** يضيف الصفوف المخفية (تكرار نفس الدقيقة) لأي مجموعة معرّفات هتتمسح. */
  function withHiddenDuplicates(ids: string[]): string[] {
    const out = new Set(ids);
    for (const id of ids) for (const sib of dupGroups.get(id) ?? []) out.add(sib);
    return [...out];
  }

  async function handleDelete(id: string) {
    if (type === "voice") await deleteRecording(id);
    else await deleteFieldCheckEntries(withHiddenDuplicates([id]));
    setRows((prev) => prev.filter((r) => r.localId !== id));
    if (type !== "voice") void propagateDeletes();
  }
  async function handleDeleteMany(ids: string[]) {
    if (type === "voice") { for (const id of ids) await deleteRecording(id); }
    else await deleteFieldCheckEntries(withHiddenDuplicates(ids)); // معاملة واحدة — «تحديد الكل» على آلاف السجلات
    const s = new Set(ids);
    setRows((prev) => prev.filter((r) => !s.has(r.localId)));
    if (type !== "voice") void propagateDeletes();
  }

  const meta = META[type];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon size={20} className="text-primary" />
        <div>
          <h1 className="text-xl font-black text-ink">{meta.title}</h1>
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
          extraColumns={detailCols}
          extraValuesFor={(e) => detailsById.get(e.localId)}
        />
      )}
    </div>
  );
}
