/**
 * GET /api/cron/cert-daily — 📄 «شهايد النهارده»: دورة كل دقيقة (Vercel cron).
 *
 * المالك (٥ أكتوبر ٢٠٢٦): «انهردة يفرز علي ال 690 شهادة دول بس». بتلقط شهايد النهارده من درايف
 * وتقرا بيانات كل واحدة مرة واحدة (`lib/certDailyJob.ts`) — والمطلوب بيفرز عليها.
 * درايف: قراية بس. الحماية: `CRON_SECRET` لو متضبط (زي باقي الدورات).
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/voiceHealth";
import { getDriveAccessToken, driveListPage } from "@/lib/gdrive";
import { certDailyTick } from "@/lib/certDailyJob";
import { extractPdfText } from "@/lib/pdfText";
import { insertNewCerts, pendingCerts, saveParsedCert, cleanupCerts, readDayCerts, sampleNoPlateCerts } from "@/lib/certDailyStore";
import { certTextShape } from "@/lib/certTextShape";
import { riyadhDayStart, dayMinus, CERT_DAYS_BACK } from "@/lib/certDaily";
import { certParseStats } from "@/lib/certParseStats";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const maxDuration = 60;

const FIELDS = "nextPageToken,files(id,name,createdTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
/** أكبر شهادة بنقراها (الشهايد صفحة واحدة — أي حاجة أكبر غلط). */
const MAX_BYTES = 15 * 1024 * 1024;

/** ملف الشهادة من درايف (قراية بس). */
async function downloadPdf(fileId: string, token: string): Promise<Uint8Array | null> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > 0 && buf.byteLength <= MAX_BYTES ? new Uint8Array(buf) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 🩺 مقياس القارئ على شهايد يوم (`?diag=1&offset=N`) — أرقام بس، مفيش لوحة ولا اسم ملف بيطلع.
  const url = new URL(req.url);
  if (url.searchParams.get("diag") === "1") {
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!Number.isInteger(offset) || offset < 0 || offset > CERT_DAYS_BACK) {
      return NextResponse.json({ error: "bad_offset" }, { status: 400 });
    }
    const day = dayMinus(riyadhDayStart(new Date()).day, offset);
    try {
      const d = await readDayCerts(day);
      return NextResponse.json({ day, total: d.total, parsed: d.parsed, ...certParseStats(d.entries) },
        { headers: { "Cache-Control": "no-store, max-age=0" } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
    }
  }

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  // 🩺 شكل نص ٣ شهايد مالقيناش فيها لوحة (`?diag=shape&offset=N`) — كل حرف ورقم مستخبي
  // (`lib/certTextShape.ts`)، فبيبان مكان اللوحة وشكلها من غير أي اسم ولا رقم.
  if (url.searchParams.get("diag") === "shape") {
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!Number.isInteger(offset) || offset < 0 || offset > CERT_DAYS_BACK) {
      return NextResponse.json({ error: "bad_offset" }, { status: 400 });
    }
    const day = dayMinus(riyadhDayStart(new Date()).day, offset);
    try {
      const ids = await sampleNoPlateCerts(day, 3);
      const samples: string[][] = [];
      for (const id of ids) {
        const bytes = await downloadPdf(id, token);
        samples.push(bytes ? certTextShape(await extractPdfText(bytes)) : ["(الملف مانزلش)"]);
      }
      return NextResponse.json({ day, samples }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
    }
  }

  try {
    const out = await certDailyTick({
      now: () => new Date(),
      listRange: async (fromIso, toIso, pageToken) => {
        // التواريخ محسوبة في الدورة (أول اليوم بالثانية) — مافيش أي مدخل من بره
        const q = `mimeType='application/pdf' and trashed=false and createdTime >= '${fromIso}'`
          + (toIso ? ` and createdTime < '${toIso}'` : "");
        const r = await driveListPage(q, token, {
          fields: FIELDS, orderBy: "createdTime", pageToken, timeoutMs: 20_000,
        });
        if (!r.ok) throw new Error("drive_failed");
        return { files: r.files, next: r.next };
      },
      insertNew: insertNewCerts,
      pending: pendingCerts,
      download: (fileId) => downloadPdf(fileId, token),
      extractText: extractPdfText,
      saveParsed: saveParsedCert,
      cleanup: cleanupCerts,
      budgetMs: 40_000,
      concurrency: 8,
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    // الجدول لسه ماتعملش (docs/sql/cert-daily.sql) أو درايف/الداتابيز ماردّوش
    return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
  }
}
