/**
 * ✏️ تعديل ملف الداتا اللي في صفحة الفرز — المالك (١٤ أكتوبر ٢٠٢٦): «تحته كلمه تعديل لما المندوب يدوس عليها يبقي فيها
 * علامه بحث … تظهرلو السيارة … بكل الاعمدة … 10 لوحات قبلها و10 لوحات بعدها … لو مكررة 20 مرة … يظهرلو ال20 … يحذف
 * اللوحه دي تتحذف من الشيت نهائي … يضيف في عمود الملاحظات او في اي عمود … يدوس حفظ ف يتحفظ كل التغييرات».
 * قراراته: المكرر ⇒ كل المرات ببياناتها · المسح ⇒ الصف يتشال من الشيت كله · زرار تصدير بعد الحفظ.
 *
 * الملف نوعين في التخزين:
 * - **صغير**: سجل واحد (`getUploadedFile("local", slot)`) فيه كل الصفوف.
 * - **كبير** (اترفع على دفعات — ملفات الـ٤٠٠ ألف صف): دفعات في قاعدة `dataStore`. البحث بيقرا دفعة دفعة، والحفظ
 *   بيعيد كتابة **الدفعات اللي اتعدّلت بس** — مابيحمّلش الملف كله في الذاكرة (الآيفون بيقع).
 *
 * كل صف ليه «مكان» (`loc`): `r:<رقم الصف>` للصغير و`c:<مفتاح الدفعة>:<مكانه فيها>` للكبير. وبصمة الملف (`stamp`)
 * بتتاخد وقت البحث وبتتأكد وقت الحفظ — لو الملف اتغيّر في النص (اترفع ملف تاني) مابنحفظش على صفوف غلط.
 */
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "./plateParser";
import { resolveDataPlateCol } from "./dataSources";
import { getUploadedFile, saveUploadedFile, type UploadedFileRecord } from "./idb";
import { getDataMeta, type DataMeta } from "./dataStore";
import { openDataDB, CHUNKS, META } from "./dataStoreDb";
import { decodeChunk, encodeChunk } from "./chunkCodec";
import { buildBigExcelBlob } from "./excel";

export type DataFileRef =
  | { kind: "small"; slot: string }
  | { kind: "large"; slot: string; store: string };

export interface EditRow {
  loc: string;
  /** رقم الصف في الورقة (من ١، من غير صف العناوين). */
  rowNo: number;
  sheet: string;
  row: Record<string, string>;
  /** هي اللوحة اللي اتدوّر عليها (مش من اللي قبلها/بعدها). */
  match: boolean;
}

export interface SearchResult {
  query: string;
  matches: number;
  rows: EditRow[];
  /** المكرر أكتر من الحد اللي بيتعرض. */
  truncated: boolean;
  /** بصمة الملف وقت البحث — `saveDataEdits` بيتأكد منها. */
  stamp?: string;
}

export interface RowBatch {
  rows: Record<string, string>[];
  locOf: (i: number) => string;
  rowNoStart: number;
  sheet: string;
  plateCol: string;
}

/** «يهل76» = «ي ه ل 0076» = «76 LHY» — نفس تطبيع الفرز بالظبط. */
export function plateQueryKey(q: string): string {
  return normalizePlate(bankPlateToArabic(String(q ?? "").trim()));
}

/**
 * البحث: مرة واحدة ⇒ اللوحة + `context` قبلها و`context` بعدها (في نفس الورقة) · أكتر من مرة ⇒ كل المرات بس.
 */
export async function searchBatches(
  batches: Iterable<RowBatch> | AsyncIterable<RowBatch>,
  query: string,
  opts: { context?: number; max?: number } = {},
): Promise<SearchResult> {
  const context = opts.context ?? 10;
  const max = opts.max ?? 300;
  const key = plateQueryKey(query);
  if (!key) return { query, matches: 0, rows: [], truncated: false };

  let matches = 0;
  const hits: EditRow[] = [];
  let ring: EditRow[] = [];
  let curSheet: string | null = null;
  let first: { before: EditRow[]; row: EditRow; after: EditRow[]; open: boolean } | null = null;

  for await (const b of batches as AsyncIterable<RowBatch>) {
    if (b.sheet !== curSheet) {
      ring = [];
      curSheet = b.sheet;
      if (first) first.open = false;                 // اللي بعدها مابيعدّيش لورقة تانية
    }
    for (let i = 0; i < b.rows.length; i++) {
      const row = b.rows[i];
      const isHit = normalizePlate(bankPlateToArabic(String(row[b.plateCol] ?? ""))) === key;
      const er: EditRow = { loc: b.locOf(i), rowNo: b.rowNoStart + i, sheet: b.sheet, row, match: isHit };
      if (first?.open) {
        first.after.push(er);
        if (first.after.length >= context) first.open = false;
      }
      if (isHit) {
        matches++;
        if (hits.length < max) hits.push(er);
        if (matches === 1) first = { before: ring.slice(), row: er, after: [], open: context > 0 };
      }
      ring.push({ ...er, match: false });
      if (ring.length > context) ring.shift();
    }
  }

  if (matches === 1 && first) {
    return { query, matches, rows: [...first.before, first.row, ...first.after], truncated: false };
  }
  return { query, matches, rows: hits, truncated: matches > hits.length };
}

/** خانات بتتغيّر + صفوف بتتشال (من غير ما يلمس الأصل). */
export function applyRowEdits(
  rows: Record<string, string>[],
  edits: Map<number, Record<string, string>>,
  deletes: Set<number>,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (deletes.has(i)) continue;
    const patch = edits.get(i);
    out.push(patch ? { ...rows[i], ...patch } : rows[i]);
  }
  return out;
}

const NOTES_RE = /^(ال)?ملاحظ(ة|ات|ه)?$/;
const NOTES_HEADER = "ملاحظات";

/** عمود الملاحظات لو موجود في الشيت. */
export function notesColumnOf(headers: string[]): string | null {
  return headers.find((h) => NOTES_RE.test(String(h ?? "").trim())) ?? null;
}

/** أعمدة شاشة التعديل: أعمدة الشيت زي ما هي + «ملاحظات» في الآخر لو مش موجود (بيتضاف للشيت لما يتكتب فيه). */
export function editorHeaders(headers: string[]): { headers: string[]; virtualNotes: string | null } {
  if (notesColumnOf(headers)) return { headers: [...headers], virtualNotes: null };
  return { headers: [...headers, NOTES_HEADER], virtualNotes: NOTES_HEADER };
}

const ar = (n: number) => n.toLocaleString("ar-EG");

/** سطور رسالة التأكيد قبل الحفظ. */
export function editSummary(s: { cells: number; rows: number; deletes: number }): string[] {
  const out: string[] = [];
  if (s.cells > 0) out.push(`هيتعدّل ${ar(s.cells)} خانة في ${ar(s.rows)} صف.`);
  if (s.deletes > 0) out.push(`هيتمسح ${ar(s.deletes)} صف من الشيت نهائياً.`);
  return out;
}

// ── التخزين ──────────────────────────────────────────────────────────────────

type SmallRec = UploadedFileRecord & { editedAt?: string };
type LargeMeta = DataMeta & { editedAt?: string };

async function readSmall(slot: string): Promise<SmallRec> {
  const rec = (await getUploadedFile("local", slot as never)) as SmallRec | null;
  if (!rec || rec.streamed) throw new Error("ملف الداتا مش موجود — ارفعه الأول من صفحة الفرز.");
  return rec;
}

async function readMeta(store: string): Promise<LargeMeta> {
  const meta = (await getDataMeta(store)) as LargeMeta | null;
  if (!meta) throw new Error("ملف الداتا مش موجود — ارفعه الأول من صفحة الفرز.");
  return meta;
}

const smallStamp = (r: SmallRec) => `${r.uploadedAt}|${r.editedAt ?? ""}|${r.rows.length}|${r.fileName}`;
const largeStamp = (m: LargeMeta) => `${m.importedAt}|${m.editedAt ?? ""}|${m.rowCount}|${m.fileName}`;

function smallPlateCol(rec: SmallRec, slot: string): string {
  if (slot === "data") return detectPlateColumn(rec.headers, rec.rows) ?? rec.headers[0] ?? "";
  return resolveDataPlateCol(rec.headers, rec.rows, null) ?? detectPlateColumn(rec.headers, rec.rows) ?? rec.headers[0] ?? "";
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function* largeBatches(store: string, meta: LargeMeta): AsyncGenerator<RowBatch> {
  const db = await openDataDB(store);
  try {
    const keys = (await idbReq(db.transaction(CHUNKS, "readonly").objectStore(CHUNKS).getAllKeys())) as IDBValidKey[];
    const rowNoBySheet = new Map<string, number>();
    for (const key of keys) {
      const rec = await idbReq(db.transaction(CHUNKS, "readonly").objectStore(CHUNKS).get(key));
      const { rows, sheet } = decodeChunk(rec);
      if (!rows.length) continue;
      const start = (rowNoBySheet.get(sheet) ?? 0) + 1;
      rowNoBySheet.set(sheet, start - 1 + rows.length);
      const plateCol = meta.sheets?.find((s) => s.name === sheet)?.plateCol || meta.plateCol;
      yield { rows, locOf: (i) => `c:${String(key)}:${i}`, rowNoStart: start, sheet, plateCol };
    }
  } finally {
    db.close();
  }
}

/** معلومات الملف لشاشة التعديل. */
export async function loadDataFileInfo(ref: DataFileRef): Promise<{ headers: string[]; fileName: string; rowCount: number; stamp: string }> {
  if (ref.kind === "small") {
    const rec = await readSmall(ref.slot);
    return { headers: rec.headers, fileName: rec.fileName, rowCount: rec.rows.length, stamp: smallStamp(rec) };
  }
  const meta = await readMeta(ref.store);
  return { headers: meta.headers, fileName: meta.fileName, rowCount: meta.rowCount, stamp: largeStamp(meta) };
}

/** ملفات الداتا اللي ينفع تتعدّل (الأساسي + الإضافية) — داتا المجموعة والسجلات مش منهم. */
export async function listEditableDataFiles(): Promise<{ ref: DataFileRef; label: string; fileName: string; rowCount: number }[]> {
  const out: { ref: DataFileRef; label: string; fileName: string; rowCount: number }[] = [];
  const main = (await getUploadedFile("local", "data").catch(() => null)) as SmallRec | null;
  if (main && !main.streamed) {
    out.push({ ref: { kind: "small", slot: "data" }, label: "ملف الداتا 1", fileName: main.fileName, rowCount: main.rows.length });
  } else {
    const meta = await getDataMeta("data").catch(() => null);
    if (meta) out.push({ ref: { kind: "large", slot: "data", store: "data" }, label: "ملف الداتا 1", fileName: meta.fileName, rowCount: meta.rowCount });
  }
  for (let n = 2; n < 100; n++) {
    const rec = (await getUploadedFile("local", `data-${n}` as never).catch(() => null)) as SmallRec | null;
    if (!rec) break;
    if (rec.streamed && rec.streamSlot) {
      const meta = await getDataMeta(rec.streamSlot).catch(() => null);
      if (meta) out.push({ ref: { kind: "large", slot: `data-${n}`, store: rec.streamSlot }, label: `ملف الداتا ${n}`, fileName: meta.fileName, rowCount: meta.rowCount });
    } else {
      out.push({ ref: { kind: "small", slot: `data-${n}` }, label: `ملف الداتا ${n}`, fileName: rec.fileName, rowCount: rec.rows.length });
    }
  }
  return out;
}

/** البحث عن لوحة في ملف داتا (صغير أو كبير). */
export async function searchDataFile(ref: DataFileRef, query: string, opts: { context?: number; max?: number } = {}): Promise<SearchResult> {
  if (ref.kind === "small") {
    const rec = await readSmall(ref.slot);
    const batch: RowBatch = { rows: rec.rows, locOf: (i) => `r:${i}`, rowNoStart: 1, sheet: "", plateCol: smallPlateCol(rec, ref.slot) };
    return { ...(await searchBatches([batch], query, opts)), stamp: smallStamp(rec) };
  }
  const meta = await readMeta(ref.store);
  return { ...(await searchBatches(largeBatches(ref.store, meta), query, opts)), stamp: largeStamp(meta) };
}

export interface DataChanges {
  /** loc ⇒ الخانات الجديدة. */
  edits: Record<string, Record<string, string>>;
  /** صفوف تتشال من الشيت كله. */
  deletes: string[];
}

const STALE = "ملف الداتا اتغيّر من ساعة ما دوّرت (اترفع ملف تاني؟) — دوّر تاني وعدّل.";

/**
 * الحفظ في شيت الداتا اللي جوّه البرنامج (الفرز الجاي بيمشي عليه). بيرجّع عدد الخانات اللي اتغيّرت فعلاً والصفوف
 * اللي اتشالت.
 */
export async function saveDataEdits(ref: DataFileRef, changes: DataChanges, stamp?: string): Promise<{ cells: number; deleted: number }> {
  const now = new Date().toISOString();
  const deletes = new Set(changes.deletes);
  const newCols = new Set<string>();

  if (ref.kind === "small") {
    const rec = await readSmall(ref.slot);
    if (stamp && smallStamp(rec) !== stamp) throw new Error(STALE);
    const edits = new Map<number, Record<string, string>>();
    let cells = 0;
    for (const [loc, patch] of Object.entries(changes.edits)) {
      const m = /^r:(\d+)$/.exec(loc);
      if (!m) continue;
      const i = Number(m[1]);
      const orig = rec.rows[i];
      if (!orig || deletes.has(loc)) continue;
      const real: Record<string, string> = {};
      for (const [k, v] of Object.entries(patch)) {
        if ((orig[k] ?? "") === v) continue;
        real[k] = v; cells++;
        if (!rec.headers.includes(k)) newCols.add(k);
      }
      if (Object.keys(real).length) edits.set(i, real);
    }
    const del = new Set<number>();
    for (const loc of deletes) { const m = /^r:(\d+)$/.exec(loc); if (m && rec.rows[Number(m[1])]) del.add(Number(m[1])); }
    const rows = applyRowEdits(rec.rows, edits, del);
    const headers = [...rec.headers, ...[...newCols].filter((c) => !rec.headers.includes(c))];
    let fileBlob = rec.fileBlob;
    try { fileBlob = buildBigExcelBlob(rows, headers, "داتا"); } catch { /* «فتح» يفضل على الملف الأصلي */ }
    await saveUploadedFile({ ...rec, rows, headers, fileBlob, editedAt: now } as SmallRec);
    return { cells, deleted: del.size };
  }

  const meta = await readMeta(ref.store);
  if (stamp && largeStamp(meta) !== stamp) throw new Error(STALE);
  // دفعة ⇒ (مكان ⇒ تعديل) + (أماكن المسح)
  const byChunk = new Map<string, { edits: Map<number, Record<string, string>>; dels: Set<number> }>();
  const slotOf = (loc: string) => {
    const m = /^c:(.+):(\d+)$/.exec(loc);
    if (!m) return null;
    let g = byChunk.get(m[1]);
    if (!g) { g = { edits: new Map(), dels: new Set() }; byChunk.set(m[1], g); }
    return { g, i: Number(m[2]) };
  };
  for (const [loc, patch] of Object.entries(changes.edits)) {
    if (deletes.has(loc)) continue;
    const s = slotOf(loc);
    if (s) s.g.edits.set(s.i, patch);
  }
  for (const loc of deletes) { const s = slotOf(loc); if (s) s.g.dels.add(s.i); }

  let cells = 0, deleted = 0;
  const deletedBySheet = new Map<string, number>();
  const db = await openDataDB(ref.store);
  try {
    for (const [keyStr, g] of byChunk) {
      const key = Number.isFinite(Number(keyStr)) ? Number(keyStr) : keyStr;
      const store = db.transaction(CHUNKS, "readonly").objectStore(CHUNKS);
      const rec = await idbReq(store.get(key));
      if (!rec) continue;
      const { rows, sheet } = decodeChunk(rec);
      const real = new Map<number, Record<string, string>>();
      for (const [i, patch] of g.edits) {
        const orig = rows[i];
        if (!orig) continue;
        const p: Record<string, string> = {};
        for (const [k, v] of Object.entries(patch)) {
          if ((orig[k] ?? "") === v) continue;
          p[k] = v; cells++;
          if (!meta.headers.includes(k)) newCols.add(k);
        }
        if (Object.keys(p).length) real.set(i, p);
      }
      const dels = new Set([...g.dels].filter((i) => rows[i]));
      deleted += dels.size;
      if (dels.size) deletedBySheet.set(sheet, (deletedBySheet.get(sheet) ?? 0) + dels.size);
      const next = applyRowEdits(rows, real, dels);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const st = tx.objectStore(CHUNKS);
        if (next.length === 0) st.delete(key);
        else st.put({ ...encodeChunk(next, sheet || undefined), id: key });
      });
    }
    const nextMeta: LargeMeta = {
      ...meta,
      headers: [...meta.headers, ...[...newCols].filter((c) => !meta.headers.includes(c))],
      rowCount: Math.max(0, meta.rowCount - deleted),
      sheets: meta.sheets?.map((s) => ({ ...s, rowCount: Math.max(0, s.rowCount - (deletedBySheet.get(s.name) ?? 0)) })),
      // الأصل القديم مابقاش هو الشيت ⇒ «فتح» يطلّعه من الدفعات بالتعديلات (`openStoredData` في صفحة الفرز)
      fileBlob: undefined,
      editedAt: now,
    };
    if (!meta.sheets) delete nextMeta.sheets;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(META).put(nextMeta);
    });
  } finally {
    db.close();
  }
  return { cells, deleted };
}

function exportName(fileName: string, ext: "xlsx" | "csv"): string {
  const base = String(fileName ?? "داتا").replace(/\.[^.]+$/, "") || "داتا";
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${base}-معدّل-${ymd}.${ext}`;
}

const csvEsc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * تصدير الشيت بعد التعديل. صغير ⇒ إكسيل. كبير (أكتر من `csvAbove` صف) ⇒ CSV متجمّع دفعة دفعة — بيفتح في الإكسيل
 * عادي، ومن غير ما الملف كله يتحمّل في الذاكرة (إكسيل بالحجم ده بيقفل الآيفون).
 */
export async function exportDataFile(ref: DataFileRef, opts: { csvAbove?: number } = {}): Promise<{ blob: Blob; name: string; ext: "xlsx" | "csv" }> {
  const csvAbove = opts.csvAbove ?? 100_000;
  if (ref.kind === "small") {
    const rec = await readSmall(ref.slot);
    return { blob: buildBigExcelBlob(rec.rows, rec.headers, "داتا"), name: exportName(rec.fileName, "xlsx"), ext: "xlsx" };
  }
  const meta = await readMeta(ref.store);
  if (meta.rowCount <= csvAbove) {
    const rows: Record<string, string>[] = [];
    for await (const b of largeBatches(ref.store, meta)) rows.push(...b.rows);
    return { blob: buildBigExcelBlob(rows, meta.headers, "داتا"), name: exportName(meta.fileName, "xlsx"), ext: "xlsx" };
  }
  const parts: string[] = ["﻿" + meta.headers.map(csvEsc).join(",")];
  for await (const b of largeBatches(ref.store, meta)) {
    parts.push("\r\n" + b.rows.map((r) => meta.headers.map((h) => csvEsc(r[h])).join(",")).join("\r\n"));
  }
  return { blob: new Blob(parts, { type: "text/csv;charset=utf-8" }), name: exportName(meta.fileName, "csv"), ext: "csv" };
}

/** 🛑 السوبر أدمن الأول — `true` = زرار «تعديل» يظهر لكل المناديب («انشر للكل»). */
export const DATA_EDIT_FOR_ALL = false;

/** عمود موقع/GPS (يظهر جنبه زرار «📍 موقعي»). */
export function isGpsHeader(h: string): boolean {
  return /gps|جي ?بي ?اس|الموقع|لوكيشن|location|إحداثي|احداثي/i.test(String(h ?? ""));
}
