/**
 * GET /api/cron/cert-stats — 📊 إحصائيات الشهايد: **دورة العدّ على السيرفر** كل دقيقة (Vercel cron).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): العدّ من الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف ولسه. فالسيرفر بيعدّ
 * لوحده هنا في الخلفية ويحفظ، والصفحة (`/api/admin/cert-stats`) بتعرض آخر نتيجة على طول.
 * المنطق كله في `lib/certStatsJob.ts` (دورة) و`lib/certStats.ts` (العدّ).
 *
 * درايف: بس قراية قايمة الملفات (بي دي إف، من غير المحذوف) — مابيفتحش ولا بيعدّل أي ملف.
 * الحماية: لو `CRON_SECRET` متضبط في Vercel لازم الهيدر يطابق؛ ومن غيره القفل بيمنع إن
 * دورتين يشتغلوا مع بعض.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/voiceHealth";
import { getDriveAccessToken, driveListPage } from "@/lib/gdrive";
import { stepFromPage, type CountTask } from "@/lib/certStats";
import { certStatsTick } from "@/lib/certStatsJob";
import { lockState, saveState, releaseState, platesDb } from "@/lib/certStatsStore";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const maxDuration = 120;

const BASE_Q = "mimeType='application/pdf' and trashed=false";
const FIELDS = "nextPageToken,files(id,name,createdTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
/** وقت إطلاق خطوات جديدة في الدورة — اللي اتبعت بيكمّل (وكل سؤال ليه حد ٢٥ ثانية). */
const BUDGET_MS = 45_000;
const CONCURRENCY = 10;

/** الحدود من حالة العدّ نفسها (تواريخ بالثانية) — مافيش أي مدخل من بره. */
function rangeQ(after: string, until: string): string {
  return BASE_Q + (after ? ` and createdTime >= '${after}'` : "") + (until ? ` and createdTime < '${until}'` : "");
}

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = await getDriveAccessToken();
  const page = async (q: string, pageToken?: string) => {
    if (!token) throw new Error("drive_unavailable");
    const r = await driveListPage(q, token, { fields: FIELDS, orderBy: "createdTime", pageToken, timeoutMs: 25_000 });
    if (!r.ok) throw new Error("drive_failed");
    return r;
  };

  try {
    const out = await certStatsTick({
      lock: lockState, save: saveState, release: releaseState, plates: platesDb,
      step: async (t: CountTask, cut: boolean) => {
        const r = await page(rangeQ(t.after, t.until), t.token);
        return stepFromPage(r.files, r.next, t.after, cut, true);
      },
      listNew: async (since: string, pageToken?: string) => {
        const r = await page(rangeQ(since, ""), pageToken);
        return { files: r.files, next: r.next };
      },
      now: () => new Date(),
      budgetMs: BUDGET_MS,
      concurrency: CONCURRENCY,
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    // الجدول لسه ماتعملش (docs/sql/cert-stats.sql) أو الداتابيز ماردّتش
    return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
  }
}
