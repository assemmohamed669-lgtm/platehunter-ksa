/**
 * POST /api/admin/push  — إشعار هاتف يبعته الأدمن للمناديب.
 * Body: { title?, body, target: "all" | "team" | "agent", team?, agentId? }
 *
 * سوبر أدمن بس — ده بث لكل الأجهزة، مش إجراء على حساب واحد.
 * بيوصل حتى والتطبيق مقفول (على النسخة المثبّتة من المتجر اللي سجّلت توكن).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { sendPush, fcmConfigured } from "@/lib/fcm";

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ error: "مفيش صلاحية." }, { status: 403 });
  if (!admin.isSuper) {
    return NextResponse.json({ error: "الإجراء ده للسوبر-أدمن فقط." }, { status: 403 });
  }
  if (!fcmConfigured()) {
    return NextResponse.json({ error: "إشعارات الهاتف مش متظبّطة على السيرفر (FCM_SERVICE_ACCOUNT)." }, { status: 400 });
  }

  const b = await req.json().catch(() => ({}));
  const text = String(b.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "اكتب نص الإشعار." }, { status: 400 });
  const title = String(b.title ?? "").trim() || "قناص اللوحات";
  const target: string = String(b.target ?? "all");

  // مين ياخد الإشعار — المناديب بس (الأدمن ماياخدش بث).
  let q = supabaseAdmin.from("profiles").select("id").eq("role", "agent");
  if (target === "team") {
    const team = String(b.team ?? "").trim();
    if (!team) return NextResponse.json({ error: "اختار المجموعة." }, { status: 400 });
    q = q.eq("team", team);
  } else if (target === "agent") {
    const agentId = String(b.agentId ?? "");
    if (!agentId) return NextResponse.json({ error: "اختار المندوب." }, { status: 400 });
    q = q.eq("id", agentId);
  }
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0, devices: 0 });

  // التوكنات ممكن تتجاب على دفعات لو المناديب كتير — .in بياخد قايمة طويلة عادي
  // لكن بنقسّمها عشان ماتكبرش أوي في الـURL.
  const tokens: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: t } = await supabaseAdmin
      .from("device_tokens").select("token").in("agent_id", ids.slice(i, i + 200));
    tokens.push(...(t ?? []).map((x: { token: string }) => x.token));
  }

  const r = await sendPush(tokens, { title, body: text });
  if (r.dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", r.dead);

  return NextResponse.json({ ok: true, sent: r.sent, devices: tokens.length, agents: ids.length });
}
