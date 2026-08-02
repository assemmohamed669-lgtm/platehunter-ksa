/**
 * سجل قياس الطيّار — سطر لكل نبضة (utterance)، أسبوع كامل، **معزول تماماً**.
 * =============================================================================
 * الطيّار ده **قياس** قبل ما يبقى ميزة: لازم نعرف بعد أسبوع نسبة الاتفاق
 * الحقيقية في الشارع (المقيس على الذهبي كان ٨١٫٧٪ اتفاق و٩٩٫٠٪ صح عنده)، وكام
 * نبضة سكت فيها الرأي التاني وليه، وزمن الخدمة الفعلي عبر النفق.
 *
 * ─── ليه IndexedDB مش localStorage؟ (بالحجم، مش بالذوق) ──────────────────────
 *   الحجم: ٢٠٠ لوحة/يوم × ٧ أيام = **١٤٠٠ سجل**. السجل الواحد ~٤٠٠ بايت
 *   (وقت ISO + لوحتين + مصدر + سبب + ٣ أرقام ثقة + أزمنة + أعلام) ⇒ **~٠٫٦
 *   ميجا/أسبوع**.
 *   localStorage: السقف ~٥ ميجا **للأصل كله** وهو **مشترك** مع
 *   `ic-ptt-results` (كل صفوف الصوت) و`ic-hits` و`ic-manual-draft` وخرايط
 *   التعلّم ومفتاح Deepgram. يعني الطيّار كان هياخد ~١٢٪ من ميزانية المندوب
 *   نفسه في أسبوع واحد — وده على جهاز حصلت فيه **حادثة فقد داتا موثّقة** سببها
 *   طرد التخزين في الـWebView. وكمان localStorage **متزامن**: كل كتابة بتوقف
 *   الخيط الرئيسي وسط التفريغ الحي.
 *   IndexedDB: غير متزامن، سقف عملي أكبر بمراتب، وبيسمح بـ**قاعدة منفصلة**
 *   باسمها (`platehunter_judge_pilot`) — لا هي قاعدة التطبيق (`platehunter`)
 *   ولا قاعدة التدريب (`platehunter_training`). العزل هنا شرط في المهمة.
 *
 * ─── العزل عن أي مستخدم تاني — طبقتين ────────────────────────────────────────
 *   ١. قاعدة منفصلة باسم خاص بالطيّار.
 *   ٢. `appendJudgeLog` **بترفض** أي سجل مش `agentId` بتاعه المالك
 *      (`isPilotOwner`). يعني لو الكود اتنادى بالغلط على جهاز تاني، مافيش ولا
 *      بايت بيتكتب. الفحص هنا كمان عشان الملف ده يبقى آمن لوحده مش معتمد على
 *      المنادي.
 */
import { isPilotOwner } from "./plateJudgeGate";

export const JUDGE_LOG_DB_NAME = "platehunter_judge_pilot";
const DB_VERSION = 1;
const STORE = "utterances";

/** مصدر القرار — نفس `FusionSource` + «سكت» (مافيش رأي تاني للنبضة دي). */
export type JudgeLogSource = "agree" | "ours" | "deepgram" | "none" | "skipped";

export interface JudgeLogRecord {
  /** = `PttRow.id` — فعلامة «اتصدّر» بتبقى تحديث مباشر بالمفتاح. */
  id: string;
  ts: string;
  agentId: string;
  sessionId: string;
  /** لوحة Deepgram (مطبّعة) — اللي المندوب شافها وقت النطق. */
  dgPlate: string;
  /** لوحة موديلنا (نص الموديل الخام). */
  oursPlate: string;
  /** قرار `fusePlate` النهائي. */
  fusedPlate: string;
  source: JudgeLogSource;
  reason: string;
  agreed: boolean;
  needsReview: boolean;
  /** قرار بوابة الثقة على مخرَج موديلنا (null لو مافيش رد). */
  accepted: boolean | null;
  refuseReason: string | null;
  meanLogprob: number | null;
  minLogprob: number | null;
  noSpeechProb: number | null;
  /** زمن الخدمة اللي هي قالته. */
  serverMs: number | null;
  /** الزمن من عند التطبيق (شامل الشبكة والنفق). */
  clientMs: number | null;
  /** حجم الصوت المبعوت. */
  bytes: number | null;
  /** نافذة القصّ المطلوبة (زمن ميديا). */
  startMs: number | null;
  endMs: number | null;
  /**
   * أي قاعدة طلّعت النافذة (`words` · `words_capped` · `wallclock` · `explicit`).
   * لازم يتسجّل: الإصلاح كله إن النافذة بقت من **توقيت كلمات Deepgram** مش من
   * لحظة الوصول، فبلا العمود ده مافيش طريقة نعرف بعد أسبوع كام نبضة مشيت على
   * القاعدة الصح وكام رجعت للاحتياطي.
   */
  windowSource: string | null;
  /** سبب سكوت الرأي التاني (no_timing / prefix_too_large / timeout / http_401 …). */
  skipped: string | null;
  /** اتحوّل الصف لشيت السجلات بعدين؟ */
  exported: boolean;
}

/**
 * يبني سجل كامل بقيم افتراضية آمنة. **مهم**: كل حقل ناقص بيبقى `null` مش
 * `undefined` — لأن `JSON.stringify` بيرمي مفاتيح الـundefined، فسطور الـJSONL
 * كانت هتطلع بأعمدة مختلفة والتحليل بعد أسبوع بيبقى وجع.
 */
export function newJudgeLogRecord(p: Partial<JudgeLogRecord> & { id: string; agentId: string }): JudgeLogRecord {
  return {
    id: p.id,
    ts: p.ts ?? new Date().toISOString(),
    agentId: p.agentId,
    sessionId: p.sessionId ?? "",
    dgPlate: p.dgPlate ?? "",
    oursPlate: p.oursPlate ?? "",
    fusedPlate: p.fusedPlate ?? "",
    source: p.source ?? "skipped",
    reason: p.reason ?? "",
    agreed: p.agreed ?? false,
    needsReview: p.needsReview ?? true,
    accepted: p.accepted ?? null,
    refuseReason: p.refuseReason ?? null,
    meanLogprob: p.meanLogprob ?? null,
    minLogprob: p.minLogprob ?? null,
    noSpeechProb: p.noSpeechProb ?? null,
    serverMs: p.serverMs ?? null,
    clientMs: p.clientMs ?? null,
    bytes: p.bytes ?? null,
    startMs: p.startMs ?? null,
    endMs: p.endMs ?? null,
    windowSource: p.windowSource ?? null,
    skipped: p.skipped ?? null,
    exported: p.exported ?? false,
  };
}

/**
 * كل أكواد نتيجة النبضة اللي التطبيق يقدر يسجّلها — **القايمة المرجعية**.
 *   • الخمسة الأولى (بعد `answered`) من `planJudgeSlice` — سكوت قبل أي شبكة.
 *   • الباقي من `postAudioForPlate` — سكوت بعد ما الطلب اتحرّك.
 * الاختبار بيمشي على القايمة دي ويتأكّد إن **كل كود** له جملة ولافتة **مميّزة**،
 * فمافيش كود يقدر يتسلّل ويتعرض خام (اللي معناه: المالك شاف حرف إنجليزي مش سبب).
 */
export const JUDGE_OUTCOME_CODES = [
  "answered",
  "not_configured", "no_timing", "stale_stream", "window_unproven",
  "split_too_long", "multi_plate_message", "carried_over", "busy", "queue_full",
  "no_audio", "prefix_too_large",
  "timeout", "network", "bad_json", "bad_shape", "no_answer", "error",
  "http_401", "http_404", "http_413", "http_503",
] as const;

export type JudgeOutcomeCode = (typeof JUDGE_OUTCOME_CODES)[number];

/**
 * ترجمة كود نتيجة النبضة لجملة عربية قصيرة تتعرض **جوّه مربّع المالك**.
 *
 * ليه؟ «متوصّل» بتوصف **التخزين على الجهاز** بس (نفق + توكن محفوظين وشكلهم سليم)
 * — مابتقولش حرف عن آخر نبضة. في الحادثة الميدانية ده كان الفرق بين «الميزة
 * شغّالة» و«الميزة ميتة بصمت»: كل الطلبات كانت بترجع من بوابة على السيرفر قبل
 * أي تسجيل (٤٠٤/٤٠١ — `serving/plate_server.py:746-749`)، فلا الخدمة كتبت سطر
 * ولا الجهاز عرض حاجة، والسبب كان مدفون في IndexedDB لحد ما حد يدوس «السجل».
 * سطر واحد جنب «متوصّل» بيخلّي أي فشل يسمّي نفسه من أول نبضة.
 */
export function describeJudgeOutcome(code: string | null | undefined): string {
  if (typeof code !== "string" || !code) return "—";
  const map: Record<string, string> = {
    answered: "وصل رأي ✓",
    not_configured: "مافيش عنوان/توكن محفوظين على الجهاز ده",
    no_timing: "مافيش توقيت كلمات من Deepgram للنبضة دي",
    stale_stream: "النتيجة جات من بث قديم (اتعاد الاتصال) — مافيش صوت مطابق",
    window_unproven: "كلمات النبضة مش بتطلّع لوحة الصف — مانقدرش نثبت النافذة",
    split_too_long: "نصّ اللوحة في رسالة ونصّها في التانية بفاصل أطول من المعقول",
    multi_plate_message: "رسالة واحدة فيها أكتر من لوحة — ومافيش نافذة مثبَتة للصف ده",
    carried_over: "اللوحة اتلمّت من رسالتين — ومانقدرش نثبت نافذة مقسومة لها",
    busy: "طلب سابق لسه شغّال — النبضة فاتت",
    queue_full: "الطابور ملآن — بتتكلم أسرع من الخدمة",
    no_audio: "مافيش صوت متجمّع للقصّ",
    prefix_too_large: "الجلسة بقت طويلة — قفّل المايك وافتحه",
    timeout: "الخدمة ماردّتش في الوقت",
    network: "الطلب مخرجش من الجهاز (نفق واقع / CORS / نت)",
    bad_json: "رد الخدمة مش JSON",
    bad_shape: "رد الخدمة شكله مش مطابق",
    no_answer: "مافيش رد من الخدمة",
    error: "خطأ غير متوقّع في الطلب",
    http_401: "التوكن غلط (٤٠١)",
    http_404: "العنوان غلط — الخدمة مالقتش /transcribe (٤٠٤)",
    http_413: "المبعوت أكبر من سقف الخدمة (٤١٣)",
    http_503: "الخدمة مزنوقة (٥٠٣)",
  };
  if (map[code]) return map[code];
  const m = /^http_(\d{3})$/.exec(code);
  if (m) return `خطأ ${m[1]} من الخدمة`;
  return code;                       // كود جديد: يظهر خام أحسن من ما يختفي
}

/**
 * نفس الأكواد بلافتة **قصيرة** (< ٢٤ محرف) — بتتعرض جوّه سطر عدّاد الجلسة جنب
 * عدد المسكوت، فلازم تفضل سطر واحد على تليفون.
 */
export function shortJudgeReason(code: string | null | undefined): string {
  if (typeof code !== "string" || !code) return "—";
  const map: Record<string, string> = {
    answered: "وصل رأي",
    not_configured: "بلا إعداد",
    no_timing: "بلا توقيت",
    stale_stream: "بث قديم",
    window_unproven: "نافذة مش مثبتة",
    split_too_long: "قسمة أطول من السقف",
    multi_plate_message: "لوحتين في رسالة",
    carried_over: "لوحة من رسالتين",
    busy: "مزنوق",
    queue_full: "الطابور ملآن",
    no_audio: "بلا صوت",
    prefix_too_large: "الجلسة طويلة",
    timeout: "مهلة",
    network: "مخرجش من الجهاز",
    bad_json: "رد مش JSON",
    bad_shape: "رد شكله غلط",
    no_answer: "مافيش رد",
    error: "خطأ غير متوقّع",
    http_401: "توكن غلط",
    http_404: "عنوان غلط",
    http_413: "أكبر من السقف",
    http_503: "الخدمة مزنوقة",
  };
  if (map[code]) return map[code];
  const m = /^http_(\d{3})$/.exec(code);
  if (m) return `خطأ ${m[1]}`;
  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// عدّاد الجلسة الحيّ — **المسكوت بيتعدّ زي المجاوب**
// =============================================================================
// العدّاد القديم كان بيعدّ المجاوب بس، وماكانش بيتعرض غير لو العدد > ٠. النتيجة:
// جلسة الطيّار فيها **صفر طلب** كان شكلها بالحرف زي جلسة الطيّار مقفول فيها =
// مافيش أي سطر خالص. الشكل الجديد بيخلّي الصفر مكتوب بالنص، والمسكوت بعدده وأعلى
// سببه — يعني المالك يعرف من أول نبضتين إن حاجة واقعة وإيه هي.
// ─────────────────────────────────────────────────────────────────────────────

export interface JudgeSessionCounts {
  /** نبضات جالها رأي فعلاً. */
  answered: number;
  /** منها اللي المحرّكين اتفقوا فيها. */
  agree: number;
  /** نبضات سكت فيها الرأي التاني. */
  skipped: number;
  /** توزيع أسباب السكوت (كود → عدد). */
  reasons: Record<string, number>;
}

export function emptyJudgeCounts(): JudgeSessionCounts {
  return { answered: 0, agree: 0, skipped: 0, reasons: {} };
}

/**
 * يزوّد العدّاد بنبضة واحدة. **نقية** — بترجّع كائن جديد، فتنفع جوّه
 * `setState(c => …)` اللي React بينادّيه مرتين في StrictMode بلا تكرار عدّ.
 */
export function bumpJudgeCounts(
  prev: JudgeSessionCounts,
  code: string,
  agreed: boolean,
): JudgeSessionCounts {
  const base = prev ?? emptyJudgeCounts();
  if (code === "answered") {
    return { ...base, answered: base.answered + 1, agree: base.agree + (agreed ? 1 : 0), reasons: { ...base.reasons } };
  }
  const reasons = { ...base.reasons };
  reasons[code] = (reasons[code] ?? 0) + 1;
  return { ...base, skipped: base.skipped + 1, reasons };
}

/** أعلى سبب سكوت — التعادل بيتحسم أبجدياً عشان العرض يبقى ثابت مايرقصش. */
export function topJudgeReason(reasons: Record<string, number> | undefined): string | null {
  const entries = Object.entries(reasons ?? {});
  if (entries.length === 0) return null;
  entries.sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries[0][0];
}

/**
 * سطر العدّاد اللي بيتعرض تحت مربّع المالك أثناء الجلسة.
 *   `الجلسة: 12 نبضة · اتفاق 10 · مسكوتة 2 (بلا توقيت)`
 * وجلسة بلا أي نبضة بتقول كده بالنص — الصفر عمره ما يبقى غياب سطر تاني.
 */
export function formatJudgeSessionLine(c: JudgeSessionCounts): string {
  const s = c ?? emptyJudgeCounts();
  const total = s.answered + s.skipped;
  if (total === 0) return "الجلسة: 0 نبضة — مافيش أي طلب راح للخدمة";
  const top = topJudgeReason(s.reasons);
  const tail = top ? ` (${shortJudgeReason(top)})` : "";
  return `الجلسة: ${total} نبضة · اتفاق ${s.agree} · مسكوتة ${s.skipped}${tail}`;
}

/** سطر JSON لكل نبضة (JSONL) — بالعربي زي ما هو، عشان يتقرا بالعين. */
export function toJsonl(records: JudgeLogRecord[]): string {
  if (records.length === 0) return "";
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export interface JudgeLogSummary {
  total: number;
  /** النبضات اللي جالها رأي تاني فعلاً (مش سكوت). */
  answered: number;
  agreed: number;
  /** نسبة الاتفاق من المجاوبة (٪، صحيح). المقيس على الذهبي كان ٨١٫٧٪. */
  agreeRate: number;
  skipped: number;
  exported: number;
  avgServerMs: number | null;
  bySource: Record<JudgeLogSource, number>;
}

/** دالة نقية — الأرقام اللي بيتبنى عليها قرار «نوسّع ولا لأ» بعد أسبوع. */
export function summarizeJudgeLog(records: JudgeLogRecord[]): JudgeLogSummary {
  const bySource: Record<JudgeLogSource, number> = { agree: 0, ours: 0, deepgram: 0, none: 0, skipped: 0 };
  let agreed = 0, skipped = 0, exported = 0, msSum = 0, msN = 0;
  for (const r of records) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    if (r.agreed) agreed++;
    if (r.skipped) skipped++;
    if (r.exported) exported++;
    if (typeof r.serverMs === "number" && Number.isFinite(r.serverMs)) { msSum += r.serverMs; msN++; }
  }
  const answered = records.length - skipped;
  return {
    total: records.length,
    answered,
    agreed,
    agreeRate: answered > 0 ? Math.round((agreed / answered) * 100) : 0,
    skipped,
    exported,
    avgServerMs: msN > 0 ? Math.round(msSum / msN) : null,
    bySource,
  };
}

// ─────────────────────────────────────────── IndexedDB (قاعدة الطيّار المنفصلة)

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
    const req = indexedDB.open(JUDGE_LOG_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("ts", "ts");
        s.createIndex("agentId", "agentId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * يضيف سطر النبضة. `false` لو الكاتب مش المالك أو التخزين مش متاح — **عمرها ما
 * ترمي**: فشل التسجيل مايوقفش مسار الصوت.
 */
export async function appendJudgeLog(record: JudgeLogRecord): Promise<boolean> {
  if (!isPilotOwner(record?.agentId)) return false;
  try {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

/** يعلّم صفوف اتصدّرت لشيت السجلات. بيرجّع عدد اللي فعلاً اتعلّم. */
export async function markJudgeExported(ids: string[]): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  try {
    const db = await openDB();
    return await new Promise<number>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let n = 0;
      for (const id of ids) {
        const g = store.get(id);
        g.onsuccess = () => {
          const rec = g.result as JudgeLogRecord | undefined;
          if (rec && !rec.exported) { rec.exported = true; store.put(rec); n++; }
        };
      }
      tx.oncomplete = () => res(n);
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    return 0;
  }
}

export async function getJudgeLog(): Promise<JudgeLogRecord[]> {
  try {
    const db = await openDB();
    return await new Promise<JudgeLogRecord[]>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const q = tx.objectStore(STORE).getAll();
      q.onsuccess = () => res((q.result as JudgeLogRecord[]) ?? []);
      q.onerror = () => rej(q.error);
    });
  } catch {
    return [];
  }
}

export async function countJudgeLog(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const q = tx.objectStore(STORE).count();
      q.onsuccess = () => res(q.result ?? 0);
      q.onerror = () => rej(q.error);
    });
  } catch {
    return 0;
  }
}

/** كل السجل كـJSONL — ده اللي بيتنسخ/بيتشيَّر آخر الأسبوع للتحليل. */
export async function judgeLogJsonl(): Promise<string> {
  const all = await getJudgeLog();
  all.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return toJsonl(all);
}

export async function clearJudgeLog(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* مافيش حاجة تتمسح */ }
}
