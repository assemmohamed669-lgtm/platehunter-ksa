/**
 * GET /api/cron/voice-health — 🩺 نبض سيرفر الصوت كل دقيقة (Vercel cron).
 *
 * بيسأل `/health` بتاع سيرفر ماليزيا بس ويكتب صف في `voice_health`.
 * مابيبعتش صوت ولا بيلمس الموديل. مرة في الساعة بيمسح الأقدم من ٧ أيام من
 * الجدولين (`voice_health` و`voice_telemetry`) — `RETENTION_DAYS`.
 *
 * الحماية: لو `CRON_SECRET` متضبط في Vercel لازم الهيدر يطابق. ومن غيره حارس
 * الدقيقة بيمنع إن حد يكرّر النداء ويملا الجدول (نبضة واحدة كل ٤٥ ثانية بالكتير).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRIAL_MODEL_BASE } from "@/lib/trialModelGate";
import { probeVoiceHealth, isCleanupMinute, cronAuthorized, retentionCutoff } from "@/lib/voiceHealth";

export const dynamic = "force-dynamic";

const MIN_GAP_MS = 45_000;

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // حارس الدقيقة
  const { data: last } = await supabaseAdmin
    .from("voice_health")
    .select("checked_at")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.checked_at && Date.now() - new Date(last.checked_at).getTime() < MIN_GAP_MS) {
    return NextResponse.json({ skipped: "too_soon" });
  }

  const row = await probeVoiceHealth({ url: TRIAL_MODEL_BASE + "/health" });
  const { error } = await supabaseAdmin.from("voice_health").insert(row);

  if (isCleanupMinute(new Date())) {
    const cutoff = retentionCutoff(new Date());
    await supabaseAdmin.from("voice_health").delete().lt("checked_at", cutoff);
    await supabaseAdmin.from("voice_telemetry").delete().lt("started_at", cutoff);
  }

  return NextResponse.json(
    { ok: row.ok, ms: row.ms, error: row.error, saved: !error },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
