/**
 * 🔒 **الشهايد الخاصة** — حساب درايف تاني لناس معيّنة بس.
 *
 * المالك (١٧ نوفمبر ٢٠٢٦): «الايميل القديم المربوط حاليا ل المستخدمين هيفضل زي ماهو والايميل الجديد اللي هنربطه دة
 * هيبقي ل ناس معينه فقط انا اختارهم». قراراته:
 *  · السوبر أدمن بس بيختار — **بالاسم** (يضيف ويشيل).
 *  · لكل واحد: «الجديد بس» (`private_only`) أو «الجديد والقديم» (`both`).
 *  · الإشعار للمختارين بس، **بنفس شكل** الإشعار الحالي.
 *
 * اللي مش في القايمة مابيتغيّرلوش أي حاجة: نفس الجدول (`cert_daily`) ونفس الإشعار ونفس البحث.
 * الجديد في جدول لوحده (`cert_daily_private`) وحالة إشعار لوحدها — فمفيش أي خلط بين الاتنين.
 * الإذن على **السيرفر** (`lib/certAccessStore.ts`) — اللي مش متختار مايوصلش للجديد حتى لو حاول.
 */
import type { DailyCertEntry } from "./certDaily";
import type { CertBatchResult, CertHit } from "./certBatch";
import { isActiveSubscriber, certPushUrl, type SubscriberRow } from "./certPush";

export type CertSource = "main" | "private";
export type CertAccessMode = "private_only" | "both";

export const CERT_SOURCE_TABLES: Record<CertSource, string> = { main: "cert_daily", private: "cert_daily_private" };
export const CERT_PUSH_STATE_TABLES: Record<CertSource, string> = { main: "cert_push_state", private: "cert_push_state_private" };

export const CERT_ACCESS_MODE_LABELS: Record<CertAccessMode, string> = {
  private_only: "الجديد بس",
  both: "الجديد والقديم",
};

export function parseAccessMode(v: unknown): CertAccessMode | null {
  return v === "private_only" || v === "both" ? v : null;
}

/** المصادر اللي المندوب يشوفها: مش في القايمة ⇒ القديم بس (زي دلوقتي بالظبط). */
export function certSourcesFor(mode: CertAccessMode | null): CertSource[] {
  if (mode === "both") return ["main", "private"];
  if (mode === "private_only") return ["private"];
  return ["main"];
}

export interface DayCerts { total: number; parsed: number; entries: DailyCertEntry[] }

/** شهايد اليوم من أكتر من حساب: العدد بيتجمع، والشهايد بترتيب الرفع، ونفس الملف مرة واحدة. */
export function mergeDayCerts(parts: readonly DayCerts[]): DayCerts {
  if (parts.length === 1) return parts[0];
  const seen = new Set<string>();
  const entries: DailyCertEntry[] = [];
  for (const p of parts) for (const e of p.entries) {
    if (seen.has(e.fileId)) continue;
    seen.add(e.fileId);
    entries.push(e);
  }
  entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return {
    total: parts.reduce((s, p) => s + p.total, 0),
    parsed: parts.reduce((s, p) => s + p.parsed, 0),
    entries,
  };
}

/**
 * عمود «شهايد» من أكتر من حساب: الشهايد بتتجمع لكل لوحة من غير تكرار. اللوحة «تعذّر» بس لو حساب ماردّش
 * **ومالقيناش** ليها شهادة من التاني (لو لقينا، تبان).
 */
export function mergeCertBatch(parts: readonly CertBatchResult[]): CertBatchResult {
  if (parts.length === 1) return parts[0];
  const results: Record<string, CertHit[]> = {};
  for (const p of parts) for (const [plate, hits] of Object.entries(p.results)) {
    const cur = results[plate] ?? (results[plate] = []);
    for (const h of hits) if (!cur.some((x) => x.id === h.id)) cur.push(h);
  }
  const failed: string[] = [];
  for (const p of parts) for (const plate of p.failed) {
    if (failed.includes(plate) || (results[plate]?.length ?? 0) > 0) continue;
    failed.push(plate);
  }
  return { results, failed };
}

/**
 * مين ياخد إشعار دفعة شهايد:
 *  · القديم ⇒ كل المشتركين زي دلوقتي، **إلا أي حد مختار** (أي وضع) — المالك (١٩ نوفمبر ٢٠٢٦): «اللي اختارة يجيلو
 *    فقط اشعار ل الشهادات اللي بتنزل علي الايميل دة فقط». («الجديد والقديم» = بيشوف القديم في الصفحة بس.)
 *  · الجديد ⇒ المختارين بس (أي وضع)، واشتراكهم شغّال.
 * الدوسة بتفتح نفس المكان بتاع الإشعار الحالي (`certPushUrl`). مجمّعين حسب المكان.
 */
export function pushAudience(
  profiles: readonly (SubscriberRow & { id: string })[],
  today: string,
  source: CertSource,
  access: ReadonlyMap<string, CertAccessMode>,
): { url: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const p of profiles) {
    if (!isActiveSubscriber(p, today)) continue;
    const mode = access.get(p.id) ?? null;
    if (source === "main" ? mode !== null : mode === null) continue;
    const url = certPushUrl(p);
    groups.set(url, [...(groups.get(url) ?? []), p.id]);
  }
  return [...groups].map(([url, ids]) => ({ url, ids }));
}
