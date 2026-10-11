/**
 * GET  /api/admin/group-settings            → إعدادات كل المجموعات (للأدمن)
 * POST /api/admin/group-settings            → تعديل مفتاح لمجموعة
 *   Body: { team, notifyEnabled?, shareRecordsEnabled?, leaderId?, sharedDataEnabled?, …MEMBER_LOCK_KEYS? }
 *
 * `leaderId` + `sharedDataEnabled` = ميزة «داتا المجموعة»: المسئول يرفع ملف
 * داتا والأعضاء يفرزوا عليه بس. **مقفولة افتراضياً** — المالك بيفتحها بإيده
 * لكل مجموعة بعد ما يحدّد مسئولها، فمافيش مجموعة بتتأثر من غير قراره.
 *
 * أدمن (مش سوبر بس) — المالك طلب إن الأدمنز يشوفوا ويعدّلوا المجموعات زيه.
 * الكتابة من السيرفر بمفتاح الخدمة، فجدول group_settings مالوش سياسة كتابة.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";

/** 🔒 مفاتيح صلاحيات أعضاء المجموعة: [اسمها في الطلب, العمود]. */
const MEMBER_LOCK_KEYS: [string, string][] = [
  ["recordsLeaderOnly", "records_leader_only"],
  ["lockMemberRecords", "lock_member_records"],
  ["lockMemberSort", "lock_member_sort"],
  ["lockMemberDownload", "lock_member_download"],
  ["lockMemberEdit", "lock_member_edit"],
  ["findsLeaderOnly", "finds_leader_only"],
];

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ error: "مفيش صلاحية." }, { status: 403 });
  const { data, error } = await supabaseAdmin
    // «*» — بيرجّع مفاتيح صلاحيات الأعضاء الجديدة لو SQL بتاعها اتشغّل، ومايفشلش لو لسه.
    .from("group_settings").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // 👥 الملفات اللي المسئولين رفعوها — عشان الأدمن يعرف الملف وصل السيرفر ولا لأ
  //    (بلاغ ٢٩ سبتمبر). فشلها مايوقّفش الإعدادات.
  const cols = "team, file_name, row_count, plate_count, updated_at";
  const [df, cf] = await Promise.all([
    supabaseAdmin.from("team_data_files").select(cols),
    supabaseAdmin.from("team_check_files").select(cols),
  ]);
  return NextResponse.json({ settings: data ?? [], dataFiles: df.data ?? [], checkFiles: cf.data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin) return NextResponse.json({ error: "مفيش صلاحية." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const team = String(b.team ?? "").trim();
  if (!team) return NextResponse.json({ error: "المجموعة مطلوبة." }, { status: 400 });

  // الصف ممكن ما يكونش موجود (الافتراضي مفتوح) — فبنعمل upsert بالقيم الحالية.
  const { data: cur } = await supabaseAdmin
    .from("group_settings")
    .select("notify_enabled, share_records_enabled, leader_id, shared_data_enabled, shared_check_enabled, activity_report_enabled")
    .eq("team", team).maybeSingle();
  const prev = cur as {
    notify_enabled?: boolean; share_records_enabled?: boolean;
    leader_id?: string | null; shared_data_enabled?: boolean; shared_check_enabled?: boolean;
    activity_report_enabled?: boolean;
  } | null;
  // 🔒 صلاحيات الأعضاء (١١ أكتوبر ٢٠٢٦) — أعمدتها من docs/sql/group-member-locks.sql. لو لسه ماتشغّلش وحد بيحاول
  //    يفتح مفتاح منها ⇒ رسالة واضحة؛ والمفاتيح القديمة بتتحفظ عادي.
  //    (صفحة المجموعات بتبعت الستة مع كل حفظ وهي false — ده مش طلب فتح، فحفظ المفاتيح القديمة مايتوقفش.)
  const lockReq = MEMBER_LOCK_KEYS.filter(([k]) => b[k] === true);
  const { data: lockCur, error: lockErr } = await supabaseAdmin
    .from("group_settings").select(MEMBER_LOCK_KEYS.map(([, c]) => c).join(", ")).eq("team", team).maybeSingle();
  if (lockErr && lockReq.length) {
    return NextResponse.json({ error: "شغّل ملف docs/sql/group-member-locks.sql على Supabase الأول." }, { status: 400 });
  }
  const row = {
    team,
    notify_enabled: typeof b.notifyEnabled === "boolean"
      ? b.notifyEnabled
      : (prev?.notify_enabled ?? true),
    share_records_enabled: typeof b.shareRecordsEnabled === "boolean"
      ? b.shareRecordsEnabled
      : (prev?.share_records_enabled ?? true),
    // مسئول المجموعة — `null` بيشيله. لو مش مبعوت خالص بيفضل زي ما هو.
    leader_id: b.leaderId === undefined ? (prev?.leader_id ?? null) : (b.leaderId || null),
    // الميزة **مقفولة افتراضياً**. ومن غير مسئول مافيش معنى لفتحها، فبنقفلها.
    shared_data_enabled: (() => {
      const want = typeof b.sharedDataEnabled === "boolean"
        ? b.sharedDataEnabled
        : (prev?.shared_data_enabled ?? false);
      const leader = b.leaderId === undefined ? (prev?.leader_id ?? null) : (b.leaderId || null);
      return want && !!leader;
    })(),
    // تشييك المجموعة — **مقفول افتراضياً**، ومن غير مسئول مافيش معنى لفتحه.
    shared_check_enabled: (() => {
      const want = typeof b.sharedCheckEnabled === "boolean"
        ? b.sharedCheckEnabled
        : (prev?.shared_check_enabled ?? false);
      const leader = b.leaderId === undefined ? (prev?.leader_id ?? null) : (b.leaderId || null);
      return want && !!leader;
    })(),
    // تقرير النشاط — **مقفول افتراضياً**، للمجموعة اللي السوبر أدمن يفتحها بس،
    // ومن غير مسئول مافيش معنى (هو اللي بيشوفه).
    activity_report_enabled: (() => {
      const want = typeof b.activityReportEnabled === "boolean"
        ? b.activityReportEnabled
        : (prev?.activity_report_enabled ?? false);
      const leader = b.leaderId === undefined ? (prev?.leader_id ?? null) : (b.leaderId || null);
      return want && !!leader;
    })(),
    // 🔒 كلها **مقفولة افتراضياً** ومن غير مسئول مالهاش معنى (المسئول هو اللي مابيتقفلش عليه / بيوصله الإشعار).
    ...(lockErr ? {} : Object.fromEntries(MEMBER_LOCK_KEYS.map(([k, c]) => {
      const want = typeof b[k] === "boolean" ? b[k] : ((lockCur as Record<string, boolean> | null)?.[c] ?? false);
      const leader = b.leaderId === undefined ? (prev?.leader_id ?? null) : (b.leaderId || null);
      return [c, want === true && !!leader];
    }))),
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };
  const { error } = await supabaseAdmin.from("group_settings").upsert(row, { onConflict: "team" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings: row });
}
