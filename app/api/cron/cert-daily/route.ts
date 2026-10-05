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
import { insertNewCerts, pendingCerts, saveParsedCert, cleanupCerts } from "@/lib/certDailyStore";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const maxDuration = 60;

const FIELDS = "nextPageToken,files(id,name,createdTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
/** أكبر شهادة بنقراها (الشهايد صفحة واحدة — أي حاجة أكبر غلط). */
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  try {
    const out = await certDailyTick({
      now: () => new Date(),
      listSince: async (sinceIso, pageToken) => {
        // التاريخ محسوب هنا (أول النهارده بالثانية) — مافيش أي مدخل من بره
        const r = await driveListPage(`mimeType='application/pdf' and trashed=false and createdTime >= '${sinceIso}'`, token, {
          fields: FIELDS, orderBy: "createdTime", pageToken, timeoutMs: 20_000,
        });
        if (!r.ok) throw new Error("drive_failed");
        return { files: r.files, next: r.next };
      },
      insertNew: insertNewCerts,
      pending: pendingCerts,
      download: async (fileId) => {
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
      },
      extractText: extractPdfText,
      saveParsed: saveParsedCert,
      cleanup: cleanupCerts,
      budgetMs: 40_000,
      concurrency: 6,
    });
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    // الجدول لسه ماتعملش (docs/sql/cert-daily.sql) أو درايف/الداتابيز ماردّوش
    return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
  }
}
