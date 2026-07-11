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
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";

// Actions only a SUPER admin may perform (destructive / privilege-changing).
const SUPER_ONLY = new Set(["delete", "setActive", "setRole"]);

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) {
    return NextResponse.json({ error: "غير مصرّح." }, { status: 403 });
  }
  const adminId = admin.id;

  const body = await req.json();
  const agentId: string = body.agentId ?? "";
  const action: string = body.action ?? "";
  if (!agentId || !action) {
    return NextResponse.json({ error: "بيانات ناقصة." }, { status: 400 });
  }

  // Look up the target so a non-super admin can't touch destructive actions
  // or manage another ADMIN's account (which would allow takeover/lockout).
  const { data: target } = await supabaseAdmin
    .from("profiles").select("role, is_super").eq("id", agentId).single();

  if (SUPER_ONLY.has(action) && !admin.isSuper) {
    return NextResponse.json({ error: "الإجراء ده للسوبر-أدمن فقط." }, { status: 403 });
  }
  // Only a super admin may act on an admin account; and no one may act on the
  // super admin's account (except the super acting on non-super admins).
  if (target?.role === "admin" && !admin.isSuper) {
    return NextResponse.json({ error: "مايصحّش تدير حساب أدمن." }, { status: 403 });
  }
  if (target?.is_super && agentId !== adminId) {
    return NextResponse.json({ error: "مايصحّش تعدّل حساب السوبر-أدمن." }, { status: 403 });
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

      case "setRole": {
        const role: "admin" | "agent" = body.role === "admin" ? "admin" : "agent";
        const patch: Record<string, unknown> = { role, is_active: true };
        if (role === "admin") {
          // الأدمن بلا اشتراك
          patch.subscription_start = null;
          patch.subscription_end = null;
        } else {
          // رجوع لمندوب: امنحه شهر لو مفيش اشتراك
          const d = new Date(); d.setMonth(d.getMonth() + 1);
          patch.subscription_start = new Date().toISOString().slice(0, 10);
          patch.subscription_end = d.toISOString().slice(0, 10);
        }
        const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", agentId);
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
