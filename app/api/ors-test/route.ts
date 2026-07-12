/**
 * POST /api/ors-test  { apiKey }
 * يختبر مفتاح OpenRouteService بطلب توجيه بسيط بين نقطتين (على السيرفر لتفادي CORS).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let apiKey = "";
  try {
    const body = await req.json();
    apiKey = String(body.apiKey ?? "").trim();
  } catch { /* ignore */ }
  if (!apiKey) return NextResponse.json({ ok: false, error: "المفتاح فارغ." }, { status: 400 });

  try {
    // نقطتان قريبتان في الرياض — مجرد فحص صلاحية المفتاح.
    const url =
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(apiKey)}` +
      `&start=46.6753,24.7136&end=46.6853,24.7236`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) return NextResponse.json({ ok: true });
    const text = await r.text();
    const error =
      r.status === 403 || r.status === 401
        ? "المفتاح غير صالح أو غير مفعّل."
        : `خطأ من الخادم (${r.status}).`;
    return NextResponse.json({ ok: false, error, detail: text.slice(0, 200) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? "تعذّر الاتصال بالخدمة." });
  }
}
