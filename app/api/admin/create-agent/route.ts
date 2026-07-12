/**
 * POST /api/admin/create-agent
 * Body: { email, password, phone?, role?: 'agent'|'admin', subscriptionEnd?: 'YYYY-MM-DD' }
 * (Back-compat: accepts `username` instead of `email`.)
 *
 * Admin-only. Creates the Supabase Auth user + the matching `profiles` row.
 * Agents get a monthly subscription (start = today, end = subscriptionEnd or +1 month).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { classifyAgentCreateError } from "@/lib/adminErrors";

function normalizeEmail(raw: string): string {
  const v = raw.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@platehunter.local`;
}

function addMonths(d: Date, n: number): string {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

const TRIAL_DAYS = 15;

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) {
    return NextResponse.json({ error: "غير مصرّح. يجب تسجيل الدخول كأدمن." }, { status: 403 });
  }
  const adminId = admin.id;

  const body = await req.json();
  const rawId: string = body.email ?? body.username ?? "";
  const password: string = body.password ?? "";
  const phone: string | null = body.phone?.trim() || null;
  const trial: boolean = body.trial === true;
  // حساب تجربة دائماً مندوب (مش أدمن)
  const role: "agent" | "admin" = trial ? "agent" : (body.role === "admin" ? "admin" : "agent");
  const subscriptionEnd: string | null = body.subscriptionEnd || null;

  // Only a super admin can create other admins.
  if (role === "admin" && !admin.isSuper) {
    return NextResponse.json({ error: "إنشاء أدمن للسوبر-أدمن فقط." }, { status: 403 });
  }

  if (!rawId.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "الإيميل وكلمة مرور (٦ أحرف على الأقل) مطلوبان." },
      { status: 400 }
    );
  }
  // التليفون إجباري للمندوب العادي فقط — اختياري لحساب التجربة.
  if (role === "agent" && !trial && !phone) {
    return NextResponse.json({ error: "رقم التليفون مطلوب للمندوب." }, { status: 400 });
  }

  const email = normalizeEmail(rawId);

  // 1. Create the auth user
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = classifyAgentCreateError(createError?.message, (createError as any)?.code);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  // الأدمن بلا اشتراك · التجربة = 15 يوم من اليوم · المندوب العادي = +شهر أو التاريخ المُدخل.
  const end = role === "admin"
    ? null
    : trial
      ? addDays(today, TRIAL_DAYS)
      : (subscriptionEnd || addMonths(today, 1));

  // 2. Create the matching profile row
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    username: email,
    email,
    phone,
    role,
    is_active: true,
    is_trial: trial,
    subscription_start: role === "admin" ? null : start,
    subscription_end: end,
  });
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    // Don't blame the email blindly — a reused PHONE also trips a unique
    // constraint here, and reporting it as "email already used" is misleading.
    return NextResponse.json(
      { error: classifyAgentCreateError(profileError.message) },
      { status: 400 }
    );
  }

  if (role === "agent") {
    await supabaseAdmin.from("subscription_events").insert({
      agent_id: created.user.id, new_end: end,
      note: trial ? `تجربة مجانية ${TRIAL_DAYS} يوم` : "إنشاء الحساب",
      created_by: adminId,
    });
  }

  return NextResponse.json({ ok: true, email, role });
}
