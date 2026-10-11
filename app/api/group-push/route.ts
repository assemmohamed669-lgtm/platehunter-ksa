/**
 * POST /api/group-push
 * Body: { plate, mapsLink? }
 *
 * المندوب لقى سيارة مطلوبة → بنبعت إشعار هاتف لباقي مجموعته، حتى والتطبيق
 * مقفول عندهم. الإشعار اللي جوّه التطبيق (GroupFindNotifier) شغّال بالتوازي
 * عن طريق Realtime — ده بيغطّي اللي التطبيق مقفول عنده بس.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, fcmConfigured } from "@/lib/fcm";
import { findAlertRecipients, shouldSendFind } from "@/lib/groupLocks";
import { buildFindPush, type FindRow } from "@/lib/findPush";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });

  const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
  const uid = userData.user?.id;
  if (!uid) return NextResponse.json({ error: "الجلسة انتهت." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plate: string = String(body.plate ?? "").trim();
  if (!plate) return NextResponse.json({ error: "اللوحة مطلوبة." }, { status: 400 });

  // مجموعة اللي لقاها + اسمه — السيرفر هو اللي بيحدّدهم، مش الكلاينت.
  const { data: me } = await supabaseAdmin
    .from("profiles").select("team, username").eq("id", uid).single();
  const team = (me as { team?: string | null } | null)?.team ?? null;
  if (!team || !fcmConfigured()) return NextResponse.json({ ok: true, sent: 0 });

  // إشعارات المجموعة مقفولة من صفحة المجموعات؟ مانبعتش. (غياب الصف = مفتوح.)
  // 🔒 «إشعار المطلوب للمسئول بس» (المالك ١١ أكتوبر ٢٠٢٦) ⇒ المسئول لوحده، حتى لو الإشعار العادي مقفول.
  //    «*» عشان لو SQL المفاتيح الجديدة لسه ماتشغّلش الطلب مايفشلش (ويفضل زي الأول).
  const { data: gs } = await supabaseAdmin
    .from("group_settings").select("*").eq("team", team).maybeSingle();
  const s = gs as { notify_enabled?: boolean; finds_leader_only?: boolean; leader_id?: string | null } | null;
  if (!shouldSendFind(s)) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "notifications-off" });
  }

  const { data: mates } = await supabaseAdmin
    .from("profiles").select("id").eq("team", team).neq("id", uid);
  const ids = findAlertRecipients({
    finderId: uid,
    mateIds: (mates ?? []).map((m: { id: string }) => m.id),
    leaderId: s?.leader_id ?? null,
    notifyEnabled: s?.notify_enabled !== false,
    findsLeaderOnly: s?.finds_leader_only === true && !!s?.leader_id,
  });
  if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: toks } = await supabaseAdmin
    .from("device_tokens").select("token").in("agent_id", ids);
  const tokens = (toks ?? []).map((t: { token: string }) => t.token);

  // 🔔 الإشعار من صف اللقطة نفسه (المالك ١١ أكتوبر ٢٠٢٦): اسم المندوب + اللوحة + المجموعة + الوقت + بيانات العربية،
  //    والضغط عليه بيفتح صفحة التفاصيل. نسخة قديمة من التطبيق مابتبعتش رقم اللقطة ⇒ آخر لقطة ليه بنفس اللوحة.
  const findId = String(body.findId ?? "").trim();
  const base = supabaseAdmin.from("group_finds")
    .select("id, team, finder_name, plate, info, maps_link, created_at").eq("finder_id", uid);
  const { data: found } = findId
    ? await base.eq("id", findId).maybeSingle()
    : await base.eq("plate", plate).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const finder = (me as { username?: string | null } | null)?.username || "زميلك";
  const row: FindRow = (found as FindRow | null) ?? {
    id: "", team, finder_name: finder, plate, info: null, maps_link: String(body.mapsLink ?? "") || null, created_at: new Date().toISOString(),
  };
  const r = await sendPush(tokens, buildFindPush({ ...row, finder_name: row.finder_name || finder }));

  // توكنات ماتت (الجهاز شال التطبيق) — امسحها عشان ماتفضلش تتجرّب كل مرة.
  if (r.dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", r.dead);

  return NextResponse.json({ ok: true, sent: r.sent });
}
