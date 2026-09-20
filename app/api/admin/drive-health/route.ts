/**
 * GET /api/admin/drive-health — **أدمن فقط**.
 *
 * فحص خفيف لاتصال جوجل درايف بتاع الشهادات: بيجدّد الـaccess token وبيعمل
 * بحث صغير على ملفات PDF. الهدف إن المالك يعرف إن الصلاحية ماتت **قبل** ما
 * مندوب يشتكي إن «مفيش شهادة» — ده اللي حصل في سبتمبر ٢٠٢٦ وفضل أسبوعين.
 *
 * مابيرجّعش أي قيمة سرّية — بس `ok` وعدد الملفات.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminContext } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearch } from "@/lib/gdrive";

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  // الفحص بينادي جوجل، فبنحدّه — ٦ مرات في الدقيقة تكفي لأي أدمن.
  if (!rateLimit(`drivehealth:${admin.id}`, 6, 60_000, req)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "drive_unavailable" });

  // أخف بحث ممكن: **ملف واحد** كفاية نعرف بيه إن التوكن سليم والفولدرات مشاركة.
  // (كان بيجيب ٢٠٠ ويعرضهم، فالمالك فهم إن دي كل الشهادات — العدد ده مالوش
  //  أي علاقة بحجم الأرشيف ولا بحد البحث.) صفر = التوكن سليم بس مافيش مشاركة.
  const files = await driveSearch("mimeType='application/pdf'", token, { maxFiles: 1 });
  return NextResponse.json({ ok: true, files: files.length });
}
