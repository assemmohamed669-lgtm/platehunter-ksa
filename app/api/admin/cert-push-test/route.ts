/**
 * POST /api/admin/cert-push-test — 🧪 تجربة إشعار الشهايد على موبايل **السوبر أدمن بس** (أجهزته هو).
 *
 * المالك (١٣ أكتوبر ٢٠٢٦): «يشوف من خلاله ان فيه اشعارات بالفعل بتيجي حتي لو اي اشعار وهمي». نفس شكل الإشعار
 * الحقيقي (`lib/certPush.ts`) بعدد شهايد النهارده وأسامي شركاتها + «🧪 تجربة» في الأول — ومابيلمسش علامة الدفعات.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { sendPush, fcmConfigured } from "@/lib/fcm";
import { buildCertPushText } from "@/lib/certPush";
import { riyadhDayStart } from "@/lib/certDaily";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin || !admin.isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!fcmConfigured()) return NextResponse.json({ configured: false, devices: 0, sent: 0, dead: 0 });

  const { data: t } = await supabaseAdmin.from("device_tokens").select("token").eq("agent_id", admin.id);
  const tokens = ((t ?? []) as { token: string }[]).map((x) => x.token);

  // شهايد النهارده (أسامي الشركات بس) — لو مفيش، إشعار تجربة بشركة وهمية
  const today = riyadhDayStart(new Date()).day;
  const { data: rows } = await supabaseAdmin.from("cert_daily").select("uploader").eq("day", today).limit(1000);
  const uploaders = ((rows ?? []) as { uploader?: string }[]).map((r) => r.uploader ?? "");
  const text = buildCertPushText(uploaders.length ? uploaders : ["تجربة"]);

  const r = await sendPush(tokens, {
    title: `🧪 تجربة — ${text.title}`,
    body: text.body,
    data: { url: "/wanted", kind: "certs-test" },
  });
  if (r.dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", r.dead);
  return NextResponse.json({ configured: true, devices: tokens.length, sent: r.sent, dead: r.dead.length, title: text.title });
}
