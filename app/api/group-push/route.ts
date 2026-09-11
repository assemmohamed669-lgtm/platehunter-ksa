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

  const { data: mates } = await supabaseAdmin
    .from("profiles").select("id").eq("team", team).neq("id", uid);
  const ids = (mates ?? []).map((m: { id: string }) => m.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: toks } = await supabaseAdmin
    .from("device_tokens").select("token").in("agent_id", ids);
  const tokens = (toks ?? []).map((t: { token: string }) => t.token);

  const finder = (me as { username?: string | null } | null)?.username || "زميلك";
  const mapsLink: string = String(body.mapsLink ?? "");
  const r = await sendPush(tokens, {
    title: `${finder} لقى سيارة مطلوبة!`,
    body: plate,
    data: { plate, finder, mapsLink },
  });

  // توكنات ماتت (الجهاز شال التطبيق) — امسحها عشان ماتفضلش تتجرّب كل مرة.
  if (r.dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", r.dead);

  return NextResponse.json({ ok: true, sent: r.sent });
}
