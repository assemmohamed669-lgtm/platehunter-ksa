/**
 * GET  /api/admin/group-settings            → إعدادات كل المجموعات (للأدمن)
 * POST /api/admin/group-settings            → تعديل مفتاح لمجموعة
 *   Body: { team, notifyEnabled?, shareRecordsEnabled? }
 *
 * أدمن (مش سوبر بس) — المالك طلب إن الأدمنز يشوفوا ويعدّلوا المجموعات زيه.
 * الكتابة من السيرفر بمفتاح الخدمة، فجدول group_settings مالوش سياسة كتابة.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ error: "مفيش صلاحية." }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from("group_settings").select("team, notify_enabled, share_records_enabled");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ settings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ error: "مفيش صلاحية." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const team = String(b.team ?? "").trim();
  if (!team) return NextResponse.json({ error: "المجموعة مطلوبة." }, { status: 400 });

  // الصف ممكن ما يكونش موجود (الافتراضي مفتوح) — فبنعمل upsert بالقيم الحالية.
  const { data: cur } = await supabaseAdmin
    .from("group_settings").select("notify_enabled, share_records_enabled").eq("team", team).maybeSingle();
  const row = {
    team,
    notify_enabled: typeof b.notifyEnabled === "boolean"
      ? b.notifyEnabled
      : ((cur as { notify_enabled?: boolean } | null)?.notify_enabled ?? true),
    share_records_enabled: typeof b.shareRecordsEnabled === "boolean"
      ? b.shareRecordsEnabled
      : ((cur as { share_records_enabled?: boolean } | null)?.share_records_enabled ?? true),
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };
  const { error } = await supabaseAdmin.from("group_settings").upsert(row, { onConflict: "team" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings: row });
}
