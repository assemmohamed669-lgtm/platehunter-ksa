import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearchWithStatus } from "@/lib/gdrive";
import { batchFindCertificates, CERT_BATCH_MAX_PLATES, type CertBatchResult } from "@/lib/certBatch";
import { certAccessOf } from "@/lib/certAccessStore";
import { certSourcesFor, mergeCertBatch, CERT_SOURCE_TABLES, type CertSource } from "@/lib/certPrivate";
import { findParsedByPlates } from "@/lib/certDailyStore";
import { bankPlateToArabic, normalizePlate } from "@/lib/plateParser";

/**
 * 🔎 الشهايد اللي اتقرت من جوّه الملف (`cert_daily`) لكل لوحة — المالك (١٩ نوفمبر ٢٠٢٦): أغلب الملفات اسمها رقم عقد
 * («REPO-301-…») فالبحث بالاسم في درايف مايلاقيهاش. نتيجة على شكل نتيجة درايف عشان تتدمج بنفس القاعدة.
 */
async function parsedBatch(plates: string[], source: CertSource): Promise<CertBatchResult> {
  const keyOf = new Map(plates.map((p) => [p, normalizePlate(bankPlateToArabic(p))] as const));
  const found = await (source === "main"
    ? findParsedByPlates([...keyOf.values()])
    : findParsedByPlates([...keyOf.values()], CERT_SOURCE_TABLES[source]));
  const results: CertBatchResult["results"] = {};
  for (const [p, key] of keyOf) results[p] = found.get(key) ?? [];
  return { results, failed: [] };
}

/**
 * 📄 شهايد عربيات الفرز/المطلوب **دفعة واحدة** — `POST { plates: string[] }`.
 *
 * المالك (٤ أكتوبر ٢٠٢٦): عمود «شهايد» قدام كل عربية مطلوبة. البحث العادي سؤال
 * لكل عربية (وحد ٦٠/دقيقة)؛ هنا طلب واحد بكل اللوحات وكل ٢٥ لوحة في سؤال درايف
 * واحد + ذاكرة على السيرفر (`lib/certBatch.ts`). الرد:
 *   `{ results: { [plate]: {id,name}[] }, failed: string[] }` — `failed` = درايف
 *   ماردّش (مش «مفيش شهادة»).
 */
export async function POST(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"), req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // طلب لكل فرز (والعميل بيقسّم القايمة الكبيرة) — ٢٠ في الدقيقة كفاية ومايتعدّاش
  if (!rateLimit(`certb:${userId}`, 20, 60_000, req)) {
    // ⏳ `Retry-After` بالثواني — العميل بيستنى ويعيد بدل ما يرمي الدفعة
    //    ويطلّع «تعذّر» (lib/certificateBatch.ts).
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });
  }

  const body = (await req.json().catch(() => null)) as { plates?: unknown } | null;
  const plates = Array.isArray(body?.plates)
    ? (body!.plates as unknown[]).filter((p): p is string => typeof p === "string").slice(0, CERT_BATCH_MAX_PLATES)
    : [];
  if (!plates.length) return NextResponse.json({ results: {}, failed: [] });

  // 🔒 الشهايد الخاصة (`lib/certPrivate.ts`): المختار بيدوّر في الحساب التاني كمان أو لوحده حسب وضعه، وكل حساب
  //    ليه ذاكرة لوحده. اللي مش في القايمة ⇒ الحساب القديم بس زي الأول بالظبط.
  const parts: CertBatchResult[] = [];
  for (const source of certSourcesFor(await certAccessOf(userId))) {
    const token = await getDriveAccessToken(source);
    if (!token) continue;
    parts.push(await batchFindCertificates(plates, (q) => driveSearchWithStatus(q, token), Date.now(), source));
    parts.push(await parsedBatch(plates, source));
  }
  if (!parts.length) return NextResponse.json({ results: {}, failed: plates, error: "drive_unavailable" });
  return NextResponse.json(mergeCertBatch(parts));
}
