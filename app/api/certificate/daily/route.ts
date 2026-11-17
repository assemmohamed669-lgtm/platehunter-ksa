/**
 * GET /api/certificate/daily — 📄 «شهايد النهارده» للفرز في صفحة المطلوب (أي مستخدم داخل).
 *
 * اللي السيرفر قراه من شهايد النهارده (بتوقيت السعودية): العدد كله (للجملة الخضرا) + كل شهادة
 * فيها لوحة أو شاص ببياناتها (العربية والبنك والعقد — مفيش بيانات شخصية).
 *  · `?offset=N` = قبل النهارده بـN يوم (٠ = النهارده، لحد أسبوع — المالك ٦ أكتوبر ٢٠٢٦). اليوم
 *    بيتحسب هنا بساعة السيرفر، فساعة الموبايل لو غلط مابتلخبطش حاجة.
 *  · `?count=1` = العدد بس (الجملة الخضرا بتتحدّث كل دقيقة من غير ما تجيب الشهايد كلها).
 *  · `setup: true` = الجدول لسه ماتعملش (`docs/sql/cert-daily.sql`).
 *  · 🔒 **الشهايد الخاصة** (`lib/certPrivate.ts`): المختار بياخد الحساب التاني كمان أو لوحده حسب وضعه — والقرار من
 *    السيرفر (`certAccessOf`). اللي مش في القايمة ⇒ نفس النداء القديم بالظبط.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { riyadhDayStart, dayMinus, CERT_DAYS_BACK } from "@/lib/certDaily";
import { readDayCerts, countDayCerts } from "@/lib/certDailyStore";
import { signCertLink } from "@/lib/certLink";
import { certAccessOf } from "@/lib/certAccessStore";
import { certSourcesFor, mergeDayCerts, CERT_SOURCE_TABLES, type CertSource } from "@/lib/certPrivate";

const isMissingTable = (e: unknown) => {
  const err = e as Error & { code?: string };
  return /42P01|PGRST205|does not exist/.test(`${err?.code ?? ""} ${err?.message ?? ""}`);
};

/**
 * قراية من كل مصدر: القديم بنفس النداء (من غير جدول)، والجديد بجدوله. الجدول الجديد لسه ماتعملش ⇒ بنكمّل
 * بالقديم بس (مانبوّظش اللي «الجديد والقديم»)، ولو هو المصدر الوحيد ⇒ الغلط بيطلع زي القديم.
 */
async function fromSources<T>(sources: CertSource[], read: (table?: string) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (const s of sources) {
    try {
      out.push(await (s === "main" ? read() : read(CERT_SOURCE_TABLES[s])));
    } catch (e) {
      if (s === "private" && sources.length > 1 && isMissingTable(e)) continue;
      throw e;
    }
  }
  return out;
}

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
  const sources = certSourcesFor(await certAccessOf(userId));
  try {
    if (req.nextUrl.searchParams.get("count") === "1") {
      const counts = await fromSources(sources, (t) => (t ? countDayCerts(day, t) : countDayCerts(day)));
      const c = counts.reduce((a, b) => ({ total: a.total + b.total, parsed: a.parsed + b.parsed }), { total: 0, parsed: 0 });
      return NextResponse.json({ day, today, offset, ...c }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const r = mergeDayCerts(await fromSources(sources, (t) => (t ? readDayCerts(day, t) : readDayCerts(day))));
    // 🔗 لينك لكل شهادة يتبعت على واتساب ويفتحها لأي حد (`lib/certLink.ts` — موقّع وبينتهي بعد ٣٠ يوم)
    const now = Date.now();
    const entries = r.entries.map((e) => {
      const t = signCertLink(e.fileId, now);
      return t ? { ...e, link: `${req.nextUrl.origin}/c/${t}` } : e;
    });
    return NextResponse.json({ day, today, offset, ...r, entries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (/cert_daily|42P01|PGRST205/.test(`${err.code ?? ""} ${err.message ?? ""}`)) return NextResponse.json({ day, today, offset, setup: true });
    // (لو مصدر واحد بس — اللي «الجديد بس» والجدول الجديد لسه ماتعملش ⇒ «محتاجة خطوة» زي القديم بالظبط)
    return NextResponse.json({ error: "db_failed" }, { status: 502 });
  }
}
