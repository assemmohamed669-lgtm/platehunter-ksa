/**
 * GET /api/admin/cert-stats — 📊 إحصائيات الشهايد: **آخر نتيجة** (سوبر أدمن بس).
 *
 * العدّ نفسه على السيرفر في الخلفية (`/api/cron/cert-stats` كل دقيقة)؛ هنا بس بنقرا اللي
 * اتحفظ ونحسب اللي الصفحة بتعرضه (`viewFromSnapshot`). من غير ما نجيب طابور العدّ الشغّال
 * ولا عدّه — بس رقم «اتقرا كام ملف لحد دلوقتي».
 *  · `setup: true` = الجدول لسه ماتعملش (`docs/sql/cert-stats.sql`).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { viewFromSnapshot, type CertSnapshot } from "@/lib/certStats";

export const dynamic = "force-dynamic";

interface Row {
  snapshot: CertSnapshot | null;
  running_n: number | null;
  running_started: string | null;
  running_fails: number | null;
  running_fail: string | null;
  last_error: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  if (!admin || !admin.isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("cert_stats_state")
    .select("snapshot:state->snapshot, running_n:state->pass->n, running_started:state->pass->>startedAt, running_fails:state->pass->fails, running_fail:state->pass->>lastFail, last_error:state->>lastError")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    if (/cert_stats_state|42P01|PGRST205/.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      return NextResponse.json({ setup: true });
    }
    return NextResponse.json({ error: "db_failed" }, { status: 502 });
  }
  if (!data) return NextResponse.json({ setup: true });

  const row = data as unknown as Row;
  return NextResponse.json({
    view: row.snapshot ? viewFromSnapshot(row.snapshot, new Date()) : null,
    running: row.running_started
      ? { n: Number(row.running_n ?? 0), startedAt: row.running_started, fails: Number(row.running_fails ?? 0), lastFail: row.running_fail ?? null }
      : null,
    lastError: row.last_error ?? null,
  });
}
