import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  saveFieldCheckEntry, saveFieldCheckEntriesChunked, getAllFieldCheckEntries, clearFieldCheck,
  __breakDbConnectionForTest, type FieldCheckEntry,
} from "@/lib/idb";

/**
 * 📏 قياس: تصدير ١٥٠٠ لوحة — الطريقة القديمة (`Promise.allSettled` على
 * ١٥٠٠ `saveFieldCheckEntry`) مقابل الدفعات (`saveFieldCheckEntriesChunked`).
 *
 * الأرقام بتتطبع في مخرج الاختبار (الزمن في بيئة الاختبار مش موبايل، فمابنحكمش
 * عليه). اللي بنحكم عليه هو **عدد المعاملات وعدد مرات فتح القاعدة** — ده اللي
 * بيفرق على الآيفون: كل معاملة رحلة لعملية التخزين، وكل فتح اتصال جديد.
 *
 * ⚠️ سيناريو «الاتصال ميت» في الآخر عمداً: الطريقة القديمة بتسيب اتصالات مفتوحة.
 */

const AG = "perf-agent";
const mk = (i: number): FieldCheckEntry => ({
  id: `${AG}:${i}`,
  agentId: AG,
  plate: `ابح${String(1000 + (i % 9000))}`,
  row: { "رقم اللوحة": `ابح${1000 + (i % 9000)}`, "الحي": "العليا", "النوع": "و" },
  method: "متشيكة بالصوت",
  lat: 24.7, lng: 46.6, mapsLink: "https://maps.google.com/?q=24.7,46.6",
  checkedAt: new Date(Date.UTC(2026, 9, 3) + i * 1000).toISOString(),
});
const N = 1500;
const entries = Array.from({ length: N }, (_, i) => mk(i));

afterEach(() => { vi.restoreAllMocks(); });

async function measure(
  label: string,
  run: () => Promise<PromiseSettledResult<void>[]>,
  before?: () => Promise<void> | void,
) {
  await clearFieldCheck();
  await before?.();                                         // بعد المسح — المسح نفسه بيصحّي الاتصال
  const tx = vi.spyOn(IDBDatabase.prototype, "transaction");
  const open = vi.spyOn(indexedDB, "open");
  // 🫁 أطول فترة الصفحة ماقدرتش ترد فيها: مؤقّت ٠ بيتعاد طول التصدير وبنقيس أكبر فجوة
  let maxGap = 0, last = performance.now(), probing = true;
  const tick = () => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; if (probing) setTimeout(tick, 0); };
  setTimeout(tick, 0);
  const t0 = performance.now();
  const outcomes = await run();
  const ms = performance.now() - t0;
  probing = false;
  const result = { label, ms: Math.round(ms), tx: tx.mock.calls.length, opens: open.mock.calls.length,
    ok: outcomes.filter((o) => o.status === "fulfilled").length, maxGap: Math.round(maxGap) };
  tx.mockRestore(); open.mockRestore();
  const stored = (await getAllFieldCheckEntries()).length;
  // eslint-disable-next-line no-console
  console.log(`[📏 ${N} لوحة] ${label}: ${result.ms}ms · أطول تهنيج=${result.maxGap}ms · معاملات=${result.tx} · فتح القاعدة=${result.opens} · نجح=${result.ok} · مخزّن=${stored}`);
  return { ...result, stored };
}

const oldWay = () => Promise.allSettled(entries.map((e) => saveFieldCheckEntry(e)));
const newWay = () => saveFieldCheckEntriesChunked(entries);

describe("📏 ١٥٠٠ لوحة — القديم مقابل الدفعات", () => {
  it("اتصال سليم: نفس النتيجة، ومعاملات أقل ×١٠٠", async () => {
    const old = await measure("القديم (allSettled)", oldWay);
    const neu = await measure("الدفعات (chunked)  ", newWay);
    expect(old.ok).toBe(N);
    expect(neu.ok).toBe(N);
    expect(neu.stored).toBe(old.stored);
    expect(old.tx).toBe(N);
    expect(neu.tx).toBe(Math.ceil(N / 100));
  });

  it("🔴 اتصال ميت (الآيفون قتله) قبل الضغط على تصدير", async () => {
    const kill = async () => { await saveFieldCheckEntry(mk(-1)); __breakDbConnectionForTest(); };
    const neu = await measure("الدفعات بعد موت الاتصال", newWay, kill);
    expect(neu.ok).toBe(N);
    expect(neu.opens).toBe(1);                             // فتح واحد بس

    const old = await measure("القديم بعد موت الاتصال ", oldWay, kill);
    expect(old.ok).toBe(N);
    expect(old.opens).toBeGreaterThan(neu.opens);          // كل لوحة بتفتح القاعدة لوحدها
  });
});
