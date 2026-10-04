import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearchWithStatus } from "@/lib/gdrive";
import { batchFindCertificates, CERT_BATCH_MAX_PLATES } from "@/lib/certBatch";

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
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { plates?: unknown } | null;
  const plates = Array.isArray(body?.plates)
    ? (body!.plates as unknown[]).filter((p): p is string => typeof p === "string").slice(0, CERT_BATCH_MAX_PLATES)
    : [];
  if (!plates.length) return NextResponse.json({ results: {}, failed: [] });

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ results: {}, failed: plates, error: "drive_unavailable" });

  const out = await batchFindCertificates(plates, (q) => driveSearchWithStatus(q, token));
  return NextResponse.json(out);
}
