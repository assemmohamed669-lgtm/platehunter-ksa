/**
 * /api/admin/payments — حسابات المناديب (لأي أدمن).
 *
 * GET  ?month=YYYY-MM   → دفعات الشهر ده (كل المناديب).
 * GET  ?agentId=<uuid>  → كل دفعات مندوب واحد (سجل الدفعات).
 * POST { action }:
 *   • "add"     { agentId, amount, paidAt?, method?, note? } → يسجّل دفعة.
 *   • "delete"  { id }                                       → يمسح دفعة.
 *   • "setNote" { agentId, note }                            → ملاحظة الدفع على المندوب.
 *   • "setFee"  { agentId, fee }                             → رسم شهري مخصّص (null = يرجع للمقترح).
 *
 * كله عبر service role بعد التحقق إنك أدمن — الجدول مقفول بالـRLS.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { monthRange } from "@/lib/agentBilling";

const deny = () => NextResponse.json({ error: "غير مصرّح. لازم تكون أدمن." }, { status: 403 });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return deny();
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const month = url.searchParams.get("month");

  let q = supabaseAdmin
    .from("agent_payments")
    .select("id, agent_id, amount, paid_at, method, note, created_at")
    .order("paid_at", { ascending: false });

  if (agentId) {
    q = q.eq("agent_id", agentId);
  } else if (month) {
    const { start, end } = monthRange(month);
    q = q.gte("paid_at", start).lt("paid_at", end);
  }

  const { data, error } = await q;
  if (error) return bad(error.message);
  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return deny();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "add": {
        const amount = Number(body.amount);
        if (!body.agentId || !Number.isFinite(amount) || amount <= 0) return bad("المبلغ والمندوب مطلوبين.");
        const row: Record<string, unknown> = {
          agent_id: body.agentId, amount,
          method: body.method || null, note: body.note || null, created_by: admin.id,
        };
        if (body.paidAt) row.paid_at = body.paidAt;   // وإلا الافتراضي = النهاردة
        const { error } = await supabaseAdmin.from("agent_payments").insert(row);
        if (error) return bad(error.message);
        return NextResponse.json({ ok: true });
      }
      case "delete": {
        if (!body.id) return bad("id مطلوب.");
        const { error } = await supabaseAdmin.from("agent_payments").delete().eq("id", body.id);
        if (error) return bad(error.message);
        return NextResponse.json({ ok: true });
      }
      case "setNote": {
        if (!body.agentId) return bad("المندوب مطلوب.");
        const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
        const { error } = await supabaseAdmin.from("profiles").update({ payment_note: note }).eq("id", body.agentId);
        if (error) return bad(error.message);
        return NextResponse.json({ ok: true });
      }
      case "setFee": {
        if (!body.agentId) return bad("المندوب مطلوب.");
        const fee = body.fee === null || body.fee === "" || body.fee === undefined ? null : Number(body.fee);
        if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return bad("رسم غير صالح.");
        const { error } = await supabaseAdmin.from("profiles").update({ monthly_fee: fee }).eq("id", body.agentId);
        if (error) return bad(error.message);
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("عملية غير معروفة.");
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقّع." }, { status: 500 });
  }
}
