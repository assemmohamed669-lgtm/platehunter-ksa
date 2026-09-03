/**
 * POST /api/admin/voicex-bulk
 * Body: { enabled: boolean }  — **سوبر أدمن فقط**.
 *
 * يفتح/يقفل محرّك الصوت VoiceX لكل **المناديب** مرة واحدة.
 *
 * 🔒 حدود الإجراء (مقصودة):
 *   • بيلمس **المناديب بس** (`role = 'agent'`) — الأدمنز والسوبر أدمن
 *     **مايتأثروش نهائياً**، فالمالك مايقفلش الصوت على نفسه بالغلط.
 *   • مافيش أي تعديل تاني — `rest_pages_enabled` وباقي الإعدادات زي ما هي.
 *   • بيرجّع عدد الحسابات اللي اتغيّرت عشان الواجهة تأكّد للمالك.
 *
 * ليه راوت مستقل عن `manage-agent`؟ لأن ده بيشتغل على **كل المناديب** مافيش
 * `agentId` واحد، والراوت التاني كل حمايته مبنية على هدف واحد محدّد.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { logSecurityEvent, requestMeta } from "@/lib/securityLogServer";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const admin = await verifyAdminContext(authHeader);
  if (!admin) {
    const hasToken = !!authHeader?.startsWith("Bearer ");
    return NextResponse.json(
      { error: hasToken ? "الجلسة انتهت أو مش صلاحية أدمن — سجّل خروج ودخول وجرّب تاني." : "مفيش جلسة — سجّل دخول الأول." },
      { status: 403 },
    );
  }

  // إجراء جماعي بيأثّر على كل المناديب مرة واحدة ⇒ للسوبر أدمن بس.
  if (!admin.isSuper) {
    logSecurityEvent({
      type: "admin_action", agentId: admin.id,
      detail: "DENIED super_only:voicexBulk", ...requestMeta(req),
    });
    return NextResponse.json({ error: "الإجراء ده للسوبر-أدمن فقط." }, { status: 403 });
  }

  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات ناقصة." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "بيانات ناقصة." }, { status: 400 });
  }
  const enabled = body.enabled;

  // المناديب بس: role = 'agent'. (الأدمن role='admin' فمابيتلمسش، والسوبر أدمن
  // أدمن كمان ⇒ بره النطاق تلقائياً.) الفلتر على السيرفر مش على العميل.
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ voicex_enabled: enabled })
    .eq("role", "agent")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const count = data?.length ?? 0;
  logSecurityEvent({
    type: "admin_action", agentId: admin.id,
    detail: `voicexBulk:${enabled ? "on" : "off"} count=${count}`,
    ...requestMeta(req),
  });

  return NextResponse.json({ ok: true, count });
}
