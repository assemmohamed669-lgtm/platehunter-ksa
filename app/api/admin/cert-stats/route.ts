/**
 * GET /api/admin/cert-stats — 📊 إحصائيات الشهايد — **سوبر أدمن بس**.
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا».
 *
 * بيقرا **كل** ملفات الـPDF من درايف (من غير المحذوف) بتاريخ رفعها وفولدرها، وبيحسب
 * (`lib/certStats.ts`): الإجمالي · كل شركة (= الفولدر المشارك) · كل يوم لآخر ٣٠ يوم.
 * الأرشيف ممكن يبقى آلاف الملفات (١٠٠٠ في الصفحة) ⇒ النتيجة بتتحفظ نص ساعة، و
 * `?refresh=1` بيحسب من جديد (بحد). طلبين في نفس الوقت ⇒ حساب واحد.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminContext } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearchWithStatus, driveGetFolder } from "@/lib/gdrive";
import { buildCertStats, resolveTopFolders, NO_FOLDER, type CertStats, type StatFile } from "@/lib/certStats";

// الأرشيف الكبير بياخد وقت (كل صفحة ١٠٠٠ ملف) — نسيب الحساب يكمّل.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CACHE_MS = 30 * 60_000;
type Result = CertStats & { generatedAt: string; truncated: boolean };
let cache: { at: number; data: Result } | null = null;
let inflight: Promise<Result | { error: string }> | null = null;

async function compute(): Promise<Result | { error: string }> {
  const token = await getDriveAccessToken();
  if (!token) return { error: "drive_unavailable" };
  const r = await driveSearchWithStatus("mimeType='application/pdf' and trashed=false", token, {
    fields: "nextPageToken,files(id,name,createdTime,parents)",
    maxFiles: 300_000,
    maxPages: 300,
  });
  if (!r.ok) return { error: "drive_failed" };
  const files = r.files.filter((f) => typeof f.createdTime === "string") as StatFile[];
  const parentIds = files.map((f) => f.parents?.[0]).filter((x): x is string => !!x);
  const tops = await resolveTopFolders(parentIds, (id) => driveGetFolder(id, token));
  const stats = buildCertStats(
    files,
    (f) => (f.parents?.[0] ? tops.get(f.parents[0]) ?? NO_FOLDER : NO_FOLDER),
    new Date(),
    30,
  );
  return { ...stats, generatedAt: new Date().toISOString(), truncated: r.truncated };
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin || !admin.isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (refresh && !rateLimit(`certstats:${admin.id}`, 3, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.data);

  if (!inflight) inflight = compute().finally(() => { inflight = null; });
  const out = await inflight;
  if ("error" in out) return NextResponse.json(out, { status: 502 });
  cache = { at: Date.now(), data: out };
  return NextResponse.json(out);
}
