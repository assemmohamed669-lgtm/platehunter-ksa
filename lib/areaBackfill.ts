/**
 * ══════════════════════════════════════════════════════════════════════
 *  📍 «املأ الحي والشارع» للسجلات اللي اتصدّرت من غير حي
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (١٩ أكتوبر ٢٠٢٦): مشترك صدّر لوحات كتير من Voice PRO وكان ناسي «الحي تلقائي من الـGPS» مقفول ⇒
 * اللوحات اتسجّلت من غير شارع ولا حي، بس **كل لوحة معاها موقعها**. «اعملها من عندي وكمان يكون فيه زرار عند
 * المندوب» · «عايز دة يحصل ل كل الداتا بتاعته حتي اللي مصدرها من زمان».
 *
 *  · السيرفر (`app/api/area-fill/route.ts`) بيدوّر على سجلات المندوب اللي **ليها موقع ومن غير حي** (`needsAreaFill`)،
 *    والصفحة بتسأل خدمة العناوين (نفس Nominatim بتاع «الحي تلقائي»)، والسيرفر بيضيف الحي على السجل (`applyAreaFill`).
 *    السيرفر بيختم `updated_at` ⇒ موبايل المندوب بينزّل التعديل لوحده أول ما يفتح التشييك.
 *  · الحي بيتكتب في **نفس العمود** اللي كان هيتكتب فيه لو التلقائي كان مفتوح — كل مصدر بعموده.
 *  · سجل ليه حي ⇒ **مايتلمسش** (اللي المندوب كتبه بإيده دايماً الأول). من غير موقع ⇒ مابنخترعش.
 *  · خدمة العناوين طلب في الثانية ⇒ نفس المكان (<١٥م) مايتسألش تاني (`NearbyAddressCache`)، وأي وقفة بتكمّل
 *    من الناقص (اللي اتحفظ مابيرجعش في البحث).
 */
import { AREA_COLUMN, areaOf } from "./fieldCheckView";
import { AREA_KEY } from "./trialRecords";
import { MUJAMMAA_DISTRICT_KEY, MUJAMMAA_RECORD_PREFIX } from "./mujammaaRecords";
import { AUTO_AREA_MIN_GAP_MS, AUTO_AREA_REUSE_M, regionLabel, type GeoAddressLike } from "./autoArea";

/**
 * 🔘 زرار «املأ الحي» في سجلات المندوب — **السوبر أدمن الأول** (قاعدة المالك)، و`true` بعد ما يجرّب.
 * أداة الأدمن بالـID (السوبر أدمن) شغّالة من غير المفتاح ده.
 */
export const AREA_FILL_FOR_ALL = false;

/** بادئة سجلات Voice PRO (`trialEntryId` في `lib/trialRecords.ts`). */
const TRIAL_RECORD_PREFIX = "fc-trial-";

const UNKNOWN = new Set(["", "غير معروف", "غير متاح"]);

/** نص حي «حقيقي»؟ — «غير متاح - غير متاح» (فشل قديم) = مفيش. */
function meaningful(v: unknown): boolean {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return s.split(/\s*-\s*/).some((p) => !UNKNOWN.has(p.trim()));
}

/** العمود اللي الحي بيتكتب فيه — نفس عمود «الحي تلقائي» في مصدر السجل. */
export function areaTargetKey(localId: string): string {
  if (localId.startsWith(TRIAL_RECORD_PREFIX)) return AREA_KEY;               // Voice PRO: «اسم الحي - الشارع»
  if (localId.startsWith(MUJAMMAA_RECORD_PREFIX)) return MUJAMMAA_DISTRICT_KEY; // المجمّع: «اسم الحي»
  return AREA_COLUMN;                                                          // التشييك: «الحي-الشارع»
}

/**
 * السجل ليه حي؟ — بالأسامي اللي العرض والتصدير بيقروها (`areaOf`)، والمجمّع «اسم الحي» كمان.
 * ⚠️ عمود «الحي» لوحده مابيتحسبش: السجلات بتاخد أعمدة ملف التشييك، و«الحي» فيه عنوان صاحب العربية مش مكان المندوب.
 */
function rowHasArea(localId: string, row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (localId.startsWith(MUJAMMAA_RECORD_PREFIX) && meaningful(row[MUJAMMAA_DISTRICT_KEY])) return true;
  return meaningful(areaOf(row)) || meaningful(row[AREA_KEY]) || meaningful(row[AREA_COLUMN]);
}

/** رقم الموقع — رقم أو نص رقم (عمود numeric بيرجع نص)؛ فاضي/مش رقم ⇒ null. */
export function coordNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function validCoord(rawLat: unknown, rawLng: unknown): boolean {
  const lat = coordNum(rawLat);
  const lng = coordNum(rawLng);
  if (lat == null || lng == null) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** سجل على السيرفر محتاج حي؟ — ليه موقع ومن غير حي. */
export function needsAreaFill(r: { local_id: unknown; lat: unknown; lng: unknown; extra: unknown }): boolean {
  if (typeof r.local_id !== "string" || !r.local_id) return false;
  if (!validCoord(r.lat, r.lng)) return false;
  const row = r.extra && typeof r.extra === "object" ? (r.extra as Record<string, unknown>) : null;
  return !rowHasArea(r.local_id, row);
}

/** النص اللي هيتكتب: «الشارع - الحي» (زي «الحي تلقائي»)، والمجمّع الحي بس. "" لو العنوان فشل. */
function areaValueFor(localId: string, addr: GeoAddressLike): string {
  if (localId.startsWith(MUJAMMAA_RECORD_PREFIX)) {
    const d = String(addr?.district ?? "").trim();
    return UNKNOWN.has(d) ? "" : d;
  }
  return regionLabel(addr);
}

/**
 * الصف بعد إضافة الحي — **نسخة جديدة**، والباقي زي ما هو. `null` = مافيش حاجة تتكتب
 * (السجل خد حي في النص، أو العنوان فشل).
 */
export function applyAreaFill(
  localId: string,
  row: Record<string, unknown> | null | undefined,
  addr: GeoAddressLike,
): Record<string, unknown> | null {
  if (rowHasArea(localId, row)) return null;
  const value = areaValueFor(localId, addr);
  if (!value) return null;
  return { ...(row ?? {}), [areaTargetKey(localId)]: value };
}

// ══════════════════════════════════════════════════════════════════════
//  ⚡ نفس المكان مايتسألش تاني
// ══════════════════════════════════════════════════════════════════════

/** خانة ~١١م — أي نقطة أقل من ١٥م من نقطة اتعرفت بتلاقيها في خانتها أو اللي جنبها. */
const CELL_DEG = 0.0001;

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export class NearbyAddressCache {
  private cells = new Map<string, { lat: number; lng: number; addr: GeoAddressLike }[]>();
  constructor(private readonly radiusM: number = AUTO_AREA_REUSE_M) {}

  private cell(lat: number, lng: number): [number, number] {
    return [Math.floor(lat / CELL_DEG), Math.floor(lng / CELL_DEG)];
  }

  get(lat: number, lng: number): GeoAddressLike | undefined {
    const [cy, cx] = this.cell(lat, lng);
    const reach = Math.ceil(this.radiusM / 11) || 1;
    let best: { d: number; addr: GeoAddressLike } | null = null;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const p of this.cells.get(`${cy + dy}:${cx + dx}`) ?? []) {
          const d = metersBetween(lat, lng, p.lat, p.lng);
          if (d < this.radiusM && (!best || d < best.d)) best = { d, addr: p.addr };
        }
      }
    }
    return best?.addr;
  }

  set(lat: number, lng: number, addr: GeoAddressLike): void {
    const [cy, cx] = this.cell(lat, lng);
    const k = `${cy}:${cx}`;
    const list = this.cells.get(k) ?? [];
    list.push({ lat, lng, addr });
    this.cells.set(k, list);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  🔁 التشغيل كله (الصفحة) — بحث ⇒ عناوين ⇒ حفظ على دفعات
// ══════════════════════════════════════════════════════════════════════

export interface AreaFillProgress {
  phase: "scan" | "fill" | "done" | "stopped" | "error";
  /** سجلات اتقرت من السيرفر. */
  scanned: number;
  /** ليها موقع ومن غير حي. */
  total: number;
  /** خلصت (اتحفظت أو اتعدّت). */
  done: number;
  /** اتكتب ليها حي فعلاً. */
  filled: number;
  /** خدت عنوان عربية جنبها (من غير طلب). */
  reused: number;
  /** خدمة العناوين مارجّعتش حاجة ليها. */
  failed: number;
  /** الوقت الباقي تقريباً بالثواني. */
  etaSec: number | null;
  error?: string;
}

export interface ScanItem { id: string; lat: number; lng: number; at?: string | null }
export interface ApplyItem { id: string; street: string; district: string }

/** نداء واحد للسيرفر (`/api/area-fill`) — الصفحة بتحط الجلسة والمندوب. */
export type AreaFillCall = (body: { action: "scan"; after?: string | null } | { action: "apply"; items: ApplyItem[] }) =>
  Promise<{ items?: ScanItem[]; next?: string | null; scanned?: number; updated?: number; skipped?: number }>;

export interface RunAreaFillOptions {
  call: AreaFillCall;
  reverse: (lat: number, lng: number) => Promise<GeoAddressLike>;
  onProgress?: (p: AreaFillProgress) => void;
  signal?: AbortSignal;
  /** بين طلبين لخدمة العناوين (سياستها: طلب في الثانية). */
  minGapMs?: number;
  /** قبل المحاولة التانية لعنوان فشل. */
  retryDelayMs?: number;
  /** فشل ورا بعض كده ⇒ الخدمة زحمة ⇒ استنى `cooldownMs`. */
  failStreak?: number;
  cooldownMs?: number;
  batchSize?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAreaFill(o: RunAreaFillOptions): Promise<AreaFillProgress> {
  const gap = o.minGapMs ?? AUTO_AREA_MIN_GAP_MS;
  const retryDelay = o.retryDelayMs ?? 3000;
  const failStreak = o.failStreak ?? 5;
  const cooldown = o.cooldownMs ?? 60_000;
  const batchSize = Math.max(1, Math.min(o.batchSize ?? 25, 100));
  const sleep = o.sleep ?? realSleep;
  const p: AreaFillProgress = { phase: "scan", scanned: 0, total: 0, done: 0, filled: 0, reused: 0, failed: 0, etaSec: null };
  const emit = () => o.onProgress?.({ ...p });
  const aborted = () => !!o.signal?.aborted;

  // ١. السجلات الناقصة كلها (خفيفة: رقم + موقع)
  const todo: ScanItem[] = [];
  try {
    let after: string | null = null;
    for (let guard = 0; guard < 10_000; guard++) {
      if (aborted()) { p.phase = "stopped"; emit(); return p; }
      const r = await o.call({ action: "scan", after });
      todo.push(...(r.items ?? []));
      p.scanned += r.scanned ?? 0;
      p.total = todo.length;
      emit();
      if (!r.next) break;
      after = r.next;
    }
  } catch (e) {
    p.phase = "error"; p.error = (e as Error)?.message ?? String(e); emit(); return p;
  }
  // بالترتيب اللي اتسجّلت بيه ⇒ العربيات اللي ورا بعض جنب بعض
  todo.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));

  // ٢. العناوين + الحفظ على دفعات
  p.phase = "fill"; emit();
  const cache = new NearbyAddressCache();
  let pending: ApplyItem[] = [];
  let lastCallAt = 0;
  let streak = 0;
  let calls = 0;

  const flush = async () => {
    if (!pending.length) return;
    const items = pending;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await o.call({ action: "apply", items });
        p.filled += r.updated ?? 0;
        pending = [];
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await sleep(2000 * (attempt + 1));
      }
    }
    throw lastErr;
  };

  const lookup = async (lat: number, lng: number): Promise<GeoAddressLike | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(retryDelay);
      const wait = lastCallAt + gap - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      calls++;
      let addr: GeoAddressLike | null = null;
      try { addr = await o.reverse(lat, lng); } catch { addr = null; }
      if (addr && regionLabel(addr)) return addr;
      if (aborted()) return null;
    }
    return null;
  };

  const eta = () => {
    const left = p.total - p.done;
    if (left <= 0) return 0;
    const perItem = p.done ? calls / p.done : 1;   // كام طلب لكل عربية (القريب من غير طلب)
    return Math.ceil((left * perItem * Math.max(gap, 1)) / 1000);
  };

  try {
    for (const it of todo) {
      if (aborted()) break;
      let addr = cache.get(it.lat, it.lng);
      if (addr) {
        p.reused++;
      } else {
        addr = (await lookup(it.lat, it.lng)) ?? undefined;
        if (addr) { cache.set(it.lat, it.lng, addr); streak = 0; }
      }
      if (addr) {
        pending.push({ id: it.id, street: String(addr.street ?? ""), district: String(addr.district ?? "") });
      } else if (!aborted()) {
        p.failed++;
        if (++streak >= failStreak) { streak = 0; await sleep(cooldown); }   // الخدمة زحمة ⇒ نهدى شوية
      } else {
        break;   // «وقّف» في نص الطلب ⇒ ماتتحسبش فشل
      }
      p.done++;
      p.etaSec = eta();
      if (pending.length >= batchSize) await flush();
      emit();
    }
    await flush();
  } catch (e) {
    p.phase = "error"; p.error = (e as Error)?.message ?? String(e); emit(); return p;
  }
  p.phase = aborted() ? "stopped" : "done";
  p.etaSec = p.phase === "done" ? 0 : p.etaSec;
  emit();
  return p;
}

// ══════════════════════════════════════════════════════════════════════
//  🗨️ الكلام اللي بيظهر في الصفحة
// ══════════════════════════════════════════════════════════════════════

const ar = (n: number) => n.toLocaleString("ar-EG");

/** الوقت الباقي — «أقل من دقيقة» / «حوالي ٥ دقيقة» / «حوالي ١ ساعة و٣٥ دقيقة». */
export function etaText(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  if (sec < 60) return "أقل من دقيقة";
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `حوالي ${ar(m)} دقيقة`;
  return m ? `حوالي ${ar(h)} ساعة و${ar(m)} دقيقة` : `حوالي ${ar(h)} ساعة`;
}

export function areaFillStatusText(p: AreaFillProgress): string {
  switch (p.phase) {
    case "scan":
      return `بقرا السجلات… ${ar(p.scanned)}`;
    case "fill": {
      const eta = etaText(p.etaSec);
      return `${ar(p.done)} من ${ar(p.total)} لوحة` + (eta ? ` — باقي ${eta}` : "");
    }
    case "done":
      if (!p.total) return "مفيش لوحات ناقصة حي — كل اللي ليها موقع ليها حي (واللي من غير موقع مانقدرش نعرف مكانها).";
      return `✅ خلصنا — اتكتب الحي والشارع قدام ${ar(p.filled)} لوحة.`
        + (p.failed ? ` ${ar(p.failed)} لوحة خدمة العناوين مارجّعتش ليها حاجة — دوس «ابدأ» تاني بعد شوية.` : "");
    case "stopped":
      return `وقّفت — اتكتب ${ar(p.filled)} لوحة. دوس «ابدأ» يكمّل من الناقص.`;
    case "error":
      return `حصل غلط: ${p.error ?? "مش معروف"} — دوس «ابدأ» تاني وهيكمّل من الناقص.`;
  }
}
