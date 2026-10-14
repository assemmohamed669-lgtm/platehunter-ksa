/**
 * POST /api/admin/cert-push-test — 🧪 تجربة إشعار الشهايد — **السوبر أدمن بس**.
 *
 * المالك (١٣ أكتوبر ٢٠٢٦): «يشوف من خلاله ان فيه اشعارات بالفعل بتيجي حتي لو اي اشعار وهمي». نفس شكل الإشعار
 * الحقيقي (`lib/certPush.ts`) بعدد شهايد النهارده وأسامي شركاتها + «🧪 تجربة» في الأول — ومابيلمسش علامة الدفعات.
 *
 * من غير إيميل ⇒ على أجهزته هو. بإيميل (`{ email }`) ⇒ على أجهزة الحساب ده — المالك (١٤ أكتوبر ٢٠٢٦): الآيفون اللي
 * بيجرّب عليه داخل بحساب أدمن تاني. والرد بيقول الأجهزة المسجّلة آيفون ولا أندرويد.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { sendPush, fcmConfigured } from "@/lib/fcm";
import { buildCertPushText, likeExact } from "@/lib/certPush";
import { riyadhDayStart } from "@/lib/certDaily";
import { cleanEmail } from "@/lib/cleanEmail";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin || !admin.isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!fcmConfigured()) return NextResponse.json({ configured: false, devices: 0, sent: 0, dead: 0 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = cleanEmail(typeof body.email === "string" ? body.email : "");
  let target: { id: string } | null = null;
  if (email) {
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").ilike("email", likeExact(email)).limit(1).maybeSingle();
    target = (prof as { id: string } | null) ?? null;
    // حسابات اتعملت بالإيد ممكن إيميلها في الدخول (auth) بس ومش في profiles
    if (!target) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => (x.email ?? "").toLowerCase() === email);
      if (u) target = { id: u.id };
    }
    if (!target) return NextResponse.json({ configured: true, notFound: true, devices: 0, sent: 0, dead: 0, target: email });
  }
  const targetId = email ? (target as { id: string }).id : admin.id;

  const { data: t } = await supabaseAdmin.from("device_tokens").select("token, platform").eq("agent_id", targetId);
  const rowsT = (t ?? []) as { token: string; platform?: string | null }[];
  const tokens = rowsT.map((x) => x.token);
  const platforms = {
    ios: rowsT.filter((x) => x.platform === "ios").length,
    android: rowsT.filter((x) => x.platform === "android").length,
  };

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
  return NextResponse.json({
    configured: true, devices: tokens.length, sent: r.sent, dead: r.dead.length, title: text.title,
    platforms, target: email || undefined,
  });
}
