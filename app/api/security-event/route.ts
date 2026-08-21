/**
 * POST /api/security-event  { type }
 *
 * العميل بيبلّغ عن فشل دخول مشبوه (دخول بحساب مربوط بجهاز تاني مثلاً).
 * الكتابة بتحصل على السيرفر بمفتاح الخدمة — **مافيش دالة داتابيز جديدة مكشوفة**.
 *
 * تفصيلتين مقصودتين:
 *  ١) **مش بنستخدم verifySession** — هي بترفض الحسابات الموقوفة، وإحنا
 *     **عايزين** نسجّل محاولة الدخول بحساب موقوف. فبنتحقق من التوكن بس.
 *  ٢) **نوع الحدث لازم يكون من قايمة العميل** (أحداث الدخول فقط). لو العميل
 *     قدر يبعت admin_action، أي مندوب هيقدر يحشو سجل التدقيق بصفوف كاذبة.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/apiAuth";
import { isClientReportable, type SecurityEventType } from "@/lib/securityLog";
import { logSecurityEvent, requestMeta } from "@/lib/securityLogServer";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ ok: false }, { status: 401 });
  const uid = data.user.id;

  if (!rateLimit(`sec-event:${uid}`, 10, 60_000, req)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let type: unknown;
  try {
    type = (await req.json())?.type;
  } catch { /* ignore */ }

  if (!isClientReportable(type)) {
    return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  }

  logSecurityEvent({
    type: type as SecurityEventType,
    agentId: uid,
    actorLabel: data.user.email ?? null,
    ...requestMeta(req),
  });

  return NextResponse.json({ ok: true });
}
