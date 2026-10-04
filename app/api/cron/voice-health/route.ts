/**
 * GET /api/cron/voice-health — 🩺 نبض سيرفر الصوت كل دقيقة (Vercel cron).
 *
 * بيسأل `/health` بتاع سيرفر الصوت، وبعدها (لو صاحي) **مقطع اختبار حقيقي** على `/transcribe`
 * (🎙️ ٤ أكتوبر — `probeVoiceTranscribe`)، ويكتب صف واحد في `voice_health`.
 * 🔴 ليه التفريغ؟ ٤ أكتوبر كارت ماليزيا باظ و`/health` فضل ok — كل تفريغ بيفشل والمراقبة خضرا.
 *   طلب واحد كل دقيقة (~٠.٢٥ث كارت) بمهلة ومن غير إعادة ⇒ مالوش أثر على المناديب ولا السيرفر. مرة في الساعة بيمسح الأقدم من ٧ أيام من
 * الجدولين (`voice_health` و`voice_telemetry`) — `RETENTION_DAYS`.
 *
 * الحماية: لو `CRON_SECRET` متضبط في Vercel لازم الهيدر يطابق. ومن غيره حارس
 * الدقيقة بيمنع إن حد يكرّر النداء ويملا الجدول (نبضة واحدة كل ٤٥ ثانية بالكتير).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRIAL_MODEL_BASE } from "@/lib/trialModelGate";
import { probeVoiceHealth, probeVoiceTranscribe, mergeHealth, isCleanupMinute, cronAuthorized, retentionCutoff } from "@/lib/voiceHealth";
import { voiceProbeClip, VOICE_PROBE_PLATE } from "@/lib/voiceProbeClip";

export const dynamic = "force-dynamic";
/**
 * 🔴 من غير الاتنين دول Next 14 بيخزّن `fetch` بتاع GET هنا: سؤال «آخر نبضة
 * إمتى» كان بيرجع رد الجدول الفاضي دايماً، فالحارس مابيمنعش أي تكرار
 * (اتقاس على Vercel ٣ أكتوبر — نداءين ورا بعض اتكتبوا الاتنين).
 */
export const fetchCache = "force-no-store";
export const revalidate = 0;
/** الفحصين ورا بعض (٥ث + ١٠ث بالكتير) — Vercel Pro. */
export const maxDuration = 30;

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

  const health = await probeVoiceHealth({ url: TRIAL_MODEL_BASE + "/health", timeoutMs: 5000 });
  // 🎙️ التفريغ الحقيقي — بس لو السيرفر صاحي. التوكن = نفس توكن المناديب (app_settings بصلاحية
  //   الخدمة)، عمره ما يتكتب في الرد ولا في الصف.
  let deep = null;
  if (health.ok) {
    const { data: s } = await supabaseAdmin.from("app_settings").select("trial_token").eq("id", true).maybeSingle();
    deep = await probeVoiceTranscribe({
      url: TRIAL_MODEL_BASE + "/transcribe",
      token: String((s as { trial_token?: string } | null)?.trial_token ?? "").trim(),
      clip: voiceProbeClip(),
      expectPlate: VOICE_PROBE_PLATE,
      timeoutMs: 10000,
    });
  }
  const row = mergeHealth(health, deep, VOICE_PROBE_PLATE);
  const { error } = await supabaseAdmin.from("voice_health").insert(row);

  if (isCleanupMinute(new Date())) {
    const cutoff = retentionCutoff(new Date());
    await supabaseAdmin.from("voice_health").delete().lt("checked_at", cutoff);
    await supabaseAdmin.from("voice_telemetry").delete().lt("started_at", cutoff);
  }

  return NextResponse.json(
    { ok: row.ok, ms: row.ms, error: row.error, deep_ms: deep?.ms ?? null, plate: deep?.plate ?? null, saved: !error },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
