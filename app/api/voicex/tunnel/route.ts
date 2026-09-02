/**
 * POST /api/voicex/tunnel  — اللابتوب يحدّث «مؤشّر» لينك نفق VoiceX.
 * =============================================================================
 * اللابتوب مالوش جلسة مالك في Supabase، فمايقدرش ينده RPC المحمي بـauth.uid().
 * المسار ده بيتحقّق من **سرّ مشترك** في ترويسة (env `VOICEX_TUNNEL_SECRET` على
 * Vercel) وبعدها يكتب المؤشّر بمفتاح الخدمة (يتخطّى RLS). محدش تاني يقدر يكتب.
 *
 * Body: { url?: string|null, isUp?: boolean }
 *   • url = أساس النفق الحالي (https). بيتحقّق بـnormalizeJudgeBase (نفس قواعد
 *     الطيّار). url فاضي/null = يمسح العنوان (النفق مش متاح).
 *   • isUp = هل النفق شغّال (افتراضي true). false = المشتركون يرجعوا لديبجرام.
 *
 * ⚠️ التوكن السرّ لـVoiceX **مش** بيمرّ من هنا — بيتحطّ مرة عبر set_voicex_token
 *    (سوبر أدمن). هنا بس اللينك (مش سرّ) + حالة النفق.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeJudgeBase } from "@/lib/plateJudgeGate";

/** مقارنة ثابتة الزمن للسرّ — تتفادى تسريب طول التطابق عبر توقيت الرد. */
function secretMatches(provided: string, expected: string): boolean {
  if (!expected) return false;               // env مش مضبوط = مرفوض دايماً
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;   // timingSafeEqual بيرمي لو الأطوال مختلفة
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const expected = process.env.VOICEX_TUNNEL_SECRET ?? "";
  const provided = req.headers.get("x-voicex-secret") ?? "";
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { url?: unknown; isUp?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  // العنوان: يُطبّع لو موجود؛ فاضي/null = مسح (النفق مش متاح). عنوان موجود لكن غير
  // سليم = خطأ (منقبلش عنوان بايظ يوصل للمشتركين).
  let url: string | null = null;
  if (typeof body.url === "string" && body.url.trim()) {
    url = normalizeJudgeBase(body.url);
    if (!url) return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  const isUp = body.isUp === false ? false : true;

  const { error } = await supabaseAdmin
    .from("voicex_pointer")
    .upsert({ id: true, url, is_up: isUp, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, url, isUp });
}
