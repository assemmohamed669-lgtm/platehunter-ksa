/**
 * plateHistoryBackup — نسخة احتياطية لسجل السيارات على **Supabase Storage**
 * (مش الداتابيز) عشان المندوب مايفقدش سجله لو غيّر تليفون أو حذف التطبيق.
 *
 * ليه Storage مش جدول:
 *   • الداتابيز مساحتها محدودة وحسّاسة (وفيها شغل المناديب) — Storage منفصلة تماماً.
 *   • صف لكل لوحة لكل مندوب = ملايين صفوف (مئات الميجا). كتلة مضغوطة لكل مندوب
 *     لكل شهر = ~١٢٠٠ ملف في السنة و~٢٥ ميجا لـ١٠٠ مندوب. أوفر ١٥ مرة.
 *   • مفيش حاجة لاستعلامات SQL: كل مندوب بيقرا سجله هو بس (خصوصية كاملة).
 *
 * الشكل: bucket "plate-history" فيه مسار لكل مندوب:
 *   {agentId}/summary.json.gz     ← الملخص الدائم (أول رصد/العدد/الحالة) لكل اللوحات
 *   {agentId}/{YYYY-MM}.json.gz   ← تفاصيل الشهر (بيتكتب الشهر الحالي بس)
 *
 * الخصوصية: سياسات RLS على الـbucket تخلّي المندوب يقرا/يكتب في مجلده بس
 * (السكربت في supabase/plate-history-storage.sql). مندوب مايقدرش يشوف مجلد غيره.
 *
 * الضغط بـ CompressionStream (متاح في WebView الحديث). لو مش متاح → JSON عادي.
 */
import type { HistoryMap, PlateHistoryEntry, PlateAction } from "./plateHistory";
import { newHistoryMap } from "./plateHistory";

export const HISTORY_BUCKET = "plate-history";

/** الحد الأدنى من الحقول للملخص الدائم — أصغر ما يمكن. */
interface SummaryRow {
  p: string;   // plate
  f: string;   // firstSeen
  l: string;   // lastSeen
  c: number;   // count
  s?: string;  // status (لو مش none)
  sa?: string; // statusAt
  nf?: number; // notFoundCount
}

function toSummary(e: PlateHistoryEntry): SummaryRow {
  const r: SummaryRow = { p: e.plate, f: e.firstSeen, l: e.lastSeen, c: e.count };
  if (e.status && e.status !== "none") { r.s = e.status; if (e.statusAt) r.sa = e.statusAt; }
  if (e.notFoundCount) r.nf = e.notFoundCount;
  return r;
}

function fromSummary(r: SummaryRow): PlateHistoryEntry {
  return {
    plate: r.p, firstSeen: r.f, lastSeen: r.l, count: r.c,
    dates: [],
    status: (r.s as PlateHistoryEntry["status"]) ?? "none",
    statusAt: r.sa,
    notFoundCount: r.nf,
  };
}

// ── ضغط/فك (مع fallback لو المتصفح مايدعمش) ────────────────────────────────

// الضغط اختياري: أي بيئة مافيهاش CompressionStream (أو Blob.stream) بترفع JSON
// عادي — الوظيفة مابتفشلش، بس الحجم يبقى أكبر. الاسترجاع بيتعامل مع الشكلين.
async function gzip(text: string): Promise<Blob> {
  const bytes = new TextEncoder().encode(text);
  const CS = (globalThis as { CompressionStream?: new (f: string) => TransformStream }).CompressionStream;
  if (!CS) return new Blob([bytes], { type: "application/json" });
  try {
    const src = new Blob([bytes]);
    if (typeof src.stream !== "function") return new Blob([bytes], { type: "application/json" });
    return await new Response(src.stream().pipeThrough(new CS("gzip"))).blob();
  } catch {
    return new Blob([bytes], { type: "application/json" });
  }
}

async function gunzip(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // gzip magic: 1f 8b — لو مش مضغوط اقراه نص مباشرة
  const isGz = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const DS = (globalThis as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream;
  if (!isGz || !DS) return new TextDecoder().decode(buf);
  try {
    const src = new Blob([buf]);
    if (typeof src.stream !== "function") return new TextDecoder().decode(buf);
    return await new Response(src.stream().pipeThrough(new DS("gzip"))).text();
  } catch {
    return new TextDecoder().decode(buf);
  }
}

/** شهر التاريخ (YYYY-MM) — مفتاح ملف التفاصيل. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

// ── الرفع ───────────────────────────────────────────────────────────────────

/**
 * يرفع الملخص الكامل + تفاصيل شهر واحد (الشهر الحالي عادةً).
 * أي فشل بيترمي — المستدعي بيتعامل معاه بصمت (النسخة الاحتياطية مش حرجة).
 */
export async function backupHistory(
  agentId: string,
  map: HistoryMap,
  today: string
): Promise<{ summaryBytes: number; monthBytes: number }> {
  const { supabase } = await import("./supabaseClient");
  const mk = monthKey(today);

  // (١) الملخص الدائم — كل اللوحات، أصغر شكل ممكن.
  const summary = [...map.values()].map(toSummary);
  const sBlob = await gzip(JSON.stringify({ v: 1, agentId, rows: summary }));
  const up1 = await supabase.storage.from(HISTORY_BUCKET)
    .upload(`${agentId}/summary.json.gz`, sBlob, { upsert: true, contentType: "application/gzip" });
  if (up1.error) throw new Error(up1.error.message);

  // (٢) تفاصيل الشهر الحالي — التواريخ والإجراءات اللي جوه الشهر ده بس.
  const monthRows = [...map.values()]
    .map((e) => ({
      p: e.plate,
      d: e.dates.filter((d) => monthKey(d) === mk),
      a: (e.actions ?? []).filter((x) => monthKey(x.date) === mk),
    }))
    .filter((r) => r.d.length > 0 || r.a.length > 0);
  const mBlob = await gzip(JSON.stringify({ v: 1, agentId, month: mk, rows: monthRows }));
  const up2 = await supabase.storage.from(HISTORY_BUCKET)
    .upload(`${agentId}/${mk}.json.gz`, mBlob, { upsert: true, contentType: "application/gzip" });
  if (up2.error) throw new Error(up2.error.message);

  return { summaryBytes: sBlob.size, monthBytes: mBlob.size };
}

// ── الاسترجاع ───────────────────────────────────────────────────────────────

/**
 * يرجّع سجل المندوب من Storage (الملخص + تفاصيل آخر keepMonths شهر).
 * بيستخدم لما الجهاز مالوش سجل محلي (تليفون جديد / إعادة تثبيت).
 */
export async function restoreHistory(
  agentId: string,
  today: string,
  keepMonths = 5
): Promise<HistoryMap> {
  const { supabase } = await import("./supabaseClient");
  const map = newHistoryMap();

  // (١) الملخص
  const dl = await supabase.storage.from(HISTORY_BUCKET).download(`${agentId}/summary.json.gz`);
  if (dl.error || !dl.data) return map;   // مفيش نسخة — سجل جديد
  const parsed = JSON.parse(await gunzip(dl.data)) as { rows?: SummaryRow[] };
  for (const r of parsed.rows ?? []) map.set(r.p, fromSummary(r));

  // (٢) تفاصيل آخر الشهور
  const months: string[] = [];
  const [y0, m0] = today.split("-").map((n) => parseInt(n, 10));
  for (let i = 0; i < keepMonths; i++) {
    const t = (y0 * 12 + (m0 - 1)) - i;
    months.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  for (const mk of months) {
    const d = await supabase.storage.from(HISTORY_BUCKET).download(`${agentId}/${mk}.json.gz`);
    if (d.error || !d.data) continue;
    try {
      const body = JSON.parse(await gunzip(d.data)) as {
        rows?: { p: string; d?: string[]; a?: PlateAction[] }[];
      };
      for (const r of body.rows ?? []) {
        const e = map.get(r.p);
        if (!e) continue;
        e.dates = [...new Set([...(r.d ?? []), ...e.dates])].sort().reverse();
        e.actions = [...(r.a ?? []), ...(e.actions ?? [])];
      }
    } catch { /* ملف تالف — نتخطاه */ }
  }
  return map;
}

/** يمسح الشهور الأقدم من keepMonths من Storage (تنظيف تلقائي). */
export async function pruneRemoteMonths(agentId: string, today: string, keepMonths = 5): Promise<number> {
  const { supabase } = await import("./supabaseClient");
  const list = await supabase.storage.from(HISTORY_BUCKET).list(agentId, { limit: 200 });
  if (list.error || !list.data) return 0;
  const keep = new Set<string>();
  const [y0, m0] = today.split("-").map((n) => parseInt(n, 10));
  for (let i = 0; i < keepMonths; i++) {
    const t = (y0 * 12 + (m0 - 1)) - i;
    keep.add(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}.json.gz`);
  }
  const stale = list.data
    .map((f) => f.name)
    .filter((n) => /^\d{4}-\d{2}\.json\.gz$/.test(n) && !keep.has(n));
  if (!stale.length) return 0;
  const del = await supabase.storage.from(HISTORY_BUCKET).remove(stale.map((n) => `${agentId}/${n}`));
  if (del.error) return 0;
  return stale.length;
}
