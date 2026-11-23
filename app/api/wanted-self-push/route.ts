/**
 * POST /api/wanted-self-push
 * Body: { plate, info?: [مفتاح، قيمة][] }
 *
 * 🚨 Voice PRO لقى عربية مطلوبة **والمندوب برّه البرنامج** (واتساب/الخريطة) ⇒ إشعار فوق الشاشة لموبايله هو بس، فيه اللوحة
 * وبيانات العربية (`lib/wantedBgAlert.ts` — المالك ٢٣ نوفمبر ٢٠٢٦). الجلسة هي اللي بتحدّد الموبايل — مابيوصلش لحد تاني.
 * 🔒 السوبر أدمن الأول (`WANTED_BG_ALERT_FOR_ALL`).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, fcmConfigured } from "@/lib/fcm";
import { WANTED_BG_ALERT_FOR_ALL, wantedPushPayload } from "@/lib/wantedBgAlert";

/** حد البيانات اللي بتتقبل من الموبايل (الإشعار نفسه بيتقص في `wantedPushPayload`). */
const MAX_INFO = 40;

function cleanInfo(raw: unknown): [string, string][] {
  if (!Array.isArray(raw)) return [];
  const out: [string, string][] = [];
  for (const p of raw.slice(0, MAX_INFO)) {
    if (Array.isArray(p) && p.length >= 2) out.push([String(p[0] ?? "").slice(0, 100), String(p[1] ?? "").slice(0, 300)]);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });

  const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
  const uid = userData.user?.id;
  if (!uid) return NextResponse.json({ error: "الجلسة انتهت." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plate = String(body?.plate ?? "").trim().slice(0, 40);
  if (!plate) return NextResponse.json({ error: "اللوحة مطلوبة." }, { status: 400 });

  if (!WANTED_BG_ALERT_FOR_ALL) {
    const { data: me } = await supabaseAdmin.from("profiles").select("role, is_super").eq("id", uid).maybeSingle();
    const p = me as { role?: string; is_super?: boolean } | null;
    if (!(p?.role === "admin" && p?.is_super === true)) return NextResponse.json({ ok: true, sent: 0, skipped: "not-enabled" });
  }
  if (!fcmConfigured()) return NextResponse.json({ ok: true, sent: 0, skipped: "no-fcm" });

  const { data: rows } = await supabaseAdmin.from("device_tokens").select("token").eq("agent_id", uid);
  const tokens = [...new Set(((rows ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean))];
  if (!tokens.length) return NextResponse.json({ ok: true, sent: 0, skipped: "no-device" });

  const r = await sendPush(tokens, wantedPushPayload(plate, cleanInfo(body?.info)));
  if (r.dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", r.dead);
  return NextResponse.json({ ok: true, sent: r.sent });
}
