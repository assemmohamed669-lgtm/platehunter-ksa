/**
 * GET /api/certificate/daily — 📄 «شهايد النهارده» للفرز في صفحة المطلوب (أي مستخدم داخل).
 *
 * اللي السيرفر قراه من شهايد النهارده (بتوقيت السعودية): العدد كله (للجملة الخضرا) + كل شهادة
 * فيها لوحة أو شاص ببياناتها (العربية والبنك والعقد — مفيش بيانات شخصية).
 *  · `?offset=N` = قبل النهارده بـN يوم (٠ = النهارده، لحد أسبوع — المالك ٦ أكتوبر ٢٠٢٦). اليوم
 *    بيتحسب هنا بساعة السيرفر، فساعة الموبايل لو غلط مابتلخبطش حاجة.
 *  · `?count=1` = العدد بس (الجملة الخضرا بتتحدّث كل دقيقة من غير ما تجيب الشهايد كلها).
 *  · `setup: true` = الجدول لسه ماتعملش (`docs/sql/cert-daily.sql`).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { riyadhDayStart, dayMinus, CERT_DAYS_BACK } from "@/lib/certDaily";
import { readDayCerts, countDayCerts } from "@/lib/certDailyStore";

export const dynamic = "force-dynamic";
// من غيرهم نكست ١٤.٢ بيخزّن قرايات سوبابيز للأبد في راوت GET (أول نتيجة بتفضل ترجع) — زي دورات السيرفر
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"), req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`cert-daily:${userId}`, 30, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  if (!Number.isInteger(offset) || offset < 0 || offset > CERT_DAYS_BACK) {
    return NextResponse.json({ error: "bad_offset" }, { status: 400 });
  }
  const { day: today } = riyadhDayStart(new Date());
  const day = dayMinus(today, offset);
  try {
    const r = req.nextUrl.searchParams.get("count") === "1" ? await countDayCerts(day) : await readDayCerts(day);
    return NextResponse.json({ day, today, offset, ...r }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (/cert_daily|42P01|PGRST205/.test(`${err.code ?? ""} ${err.message ?? ""}`)) return NextResponse.json({ day, today, offset, setup: true });
    return NextResponse.json({ error: "db_failed" }, { status: 502 });
  }
}
