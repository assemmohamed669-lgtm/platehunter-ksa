/**
 * POST /api/admin/manage-agent
 * Body: { agentId, action, ...payload }  — admin-only.
 * Actions:
 *  - setPassword      { password }
 *  - updateContact    { email?, phone? }
 *  - extendSubscription { subscriptionEnd, amount?, months?, note? }
 *  - resetDevice
 *  - setActive        { active }
 *  - delete
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const adminId = await verifyAdmin(req.headers.get("authorization"));
  if (!adminId) {
    return NextResponse.json({ error: "غير مصرّح." }, { status: 403 });
  }

  const body = await req.json();
  const agentId: string = body.agentId ?? "";
  const action: string = body.action ?? "";
  if (!agentId || !action) {
    return NextResponse.json({ error: "بيانات ناقصة." }, { status: 400 });
  }

  try {
    switch (action) {
      case "setPassword": {
        const password: string = body.password ?? "";
        if (password.length < 6) return NextResponse.json({ error: "كلمة المرور ٦ أحرف على الأقل." }, { status: 400 });
        const { error } = await supabaseAdmin.auth.admin.updateUserById(agentId, { password });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "updateContact": {
        const patch: Record<string, unknown> = {};
        if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;
        if (typeof body.email === "string" && body.email.trim()) {
          const email = body.email.trim().toLowerCase();
          patch.email = email;
          patch.username = email;
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(agentId, { email });
          if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
        }
        if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });
        const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", agentId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "extendSubscription": {
        const subscriptionEnd: string = body.subscriptionEnd ?? "";
        if (!subscriptionEnd) return NextResponse.json({ error: "تاريخ النهاية مطلوب." }, { status: 400 });
        const patch: Record<string, unknown> = { subscription_end: subscriptionEnd, is_active: true };
        if (body.amount != null) patch.subscription_amount = Number(body.amount);
        const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", agentId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        await supabaseAdmin.from("subscription_events").insert({
          agent_id: agentId,
          months: body.months != null ? Number(body.months) : null,
          amount: body.amount != null ? Number(body.amount) : null,
          new_end: subscriptionEnd,
          note: body.note ?? "تمديد الاشتراك",
          created_by: adminId,
        });
        return NextResponse.json({ ok: true });
      }

      case "resetDevice": {
        const { error } = await supabaseAdmin.from("profiles")
          .update({ device_fingerprint: null, session_token: null }).eq("id", agentId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "setActive": {
        const { error } = await supabaseAdmin.from("profiles")
          .update({ is_active: !!body.active }).eq("id", agentId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "delete": {
        await supabaseAdmin.from("subscription_events").delete().eq("agent_id", agentId);
        await supabaseAdmin.from("profiles").delete().eq("id", agentId);
        const { error } = await supabaseAdmin.auth.admin.deleteUser(agentId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "خطأ في الخادم." }, { status: 500 });
  }
}
