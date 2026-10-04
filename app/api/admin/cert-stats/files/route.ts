/**
 * GET /api/admin/cert-stats/files?after=&until=&pageToken=&cut= — 📊 إحصائيات الشهايد،
 * **خطوة** (سوبر أدمن بس).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «مش عايز التأخير دة يحصل … عايز كل الشهادات ميسيبش ولا شهادة
 * ويجيب اسم الشركه بالظبط اللي منزله الشهادة». الصفحة بتعدّ فترات بتاريخ الرفع **مع بعض**
 * (`countAll` في `lib/certStats.ts`)، وكل نداء هنا = صفحة واحدة من درايف لفترة:
 *  · كل الـPDF (من غير المحذوف) — مافيش فلتر على اسم الملف.
 *  · مترتّبة بتاريخ الرفع ⇒ الفترة اللي فيها كتير بتتقسم (`stepFromPage`)؛ `cut=0` = ممنوع.
 *  · باللي رفع كل ملف (صاحبه/آخر حد عدّله) — الرد عدّ متجمّع (رافع ← يوم ← عدد) + أساميهم.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminContext } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveListPage } from "@/lib/gdrive";
import { stepFromPage } from "@/lib/certStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS = "nextPageToken,files(createdTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
/** تاريخ بس — مايدخلش أي حاجة تانية في سؤال درايف. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin || !admin.isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // العدّ = خطوات كتير مع بعض — الحد واسع بس موجود
  if (!rateLimit(`certstats-files:${admin.id}`, 600, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const sp = new URL(req.url).searchParams;
  const after = sp.get("after") ?? "";
  const until = sp.get("until") ?? "";
  if ((after && !ISO.test(after)) || (until && !ISO.test(until))) {
    return NextResponse.json({ error: "bad_range" }, { status: 400 });
  }

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  const q = "mimeType='application/pdf' and trashed=false"
    + (after ? ` and createdTime >= '${after}'` : "")
    + (until ? ` and createdTime < '${until}'` : "");
  const r = await driveListPage(q, token, {
    fields: FIELDS, orderBy: "createdTime", pageToken: sp.get("pageToken") || undefined,
  });
  // فشل ⇒ الصفحة بتعيد الخطوة، ولو فضل يفشل العدّ كله بيفشل (مش بيكمّل بنتيجة ناقصة)
  if (!r.ok) return NextResponse.json({ error: "drive_failed" }, { status: 502 });
  return NextResponse.json(stepFromPage(r.files, r.next, after, sp.get("cut") !== "0"));
}
