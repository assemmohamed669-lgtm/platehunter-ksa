/**
 * POST /api/admin/create-agent
 * Body: { username: string, password: string }
 *
 * Only callable by an authenticated admin (verified via verifyAdmin).
 * Creates the Supabase Auth user (username -> synthetic email) and the
 * matching `profiles` row with role = 'agent'. This needs the service
 * role key because creating auth users isn't possible with the anon key.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdmin } from "@/lib/supabaseAdmin";

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@platehunter.local`;
}

export async function POST(req: NextRequest) {
  const adminId = await verifyAdmin(req.headers.get("authorization"));
  if (!adminId) {
    return NextResponse.json({ error: "غير مصرّح. يجب تسجيل الدخول كأدمن." }, { status: 403 });
  }

  const { username, password } = await req.json();

  if (!username?.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "اسم المستخدم وكلمة مرور (٦ أحرف على الأقل) مطلوبان." },
      { status: 400 }
    );
  }

  const cleanUsername = username.trim().toLowerCase();
  const email = usernameToEmail(cleanUsername);

  // 1. Create the auth user
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const msg = createError?.message?.includes("already")
      ? "اسم المستخدم هذا مستخدم بالفعل."
      : createError?.message ?? "فشل إنشاء الحساب.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 2. Create the matching profile row
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    username: cleanUsername,
    role: "agent",
  });

  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned account
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: profileError.message.includes("duplicate") ? "اسم المستخدم هذا مستخدم بالفعل." : profileError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, username: cleanUsername });
}
