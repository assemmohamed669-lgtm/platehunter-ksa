/**
 * GET /api/cron/cert-daily-private — 🔒 **الشهايد الخاصة**: نفس دورة «شهايد النهارده» (`/api/cron/cert-daily`) بالظبط،
 * بس على **حساب الدرايف التاني** (`GDRIVE2_*`) وفي جدوله لوحده (`cert_daily_private`) — وإشعارها للمختارين بس.
 *
 * المالك (١٧ نوفمبر ٢٠٢٦): «الايميل القديم المربوط حاليا ل المستخدمين هيفضل زي ماهو والايميل الجديد اللي هنربطه دة
 * هيبقي ل ناس معينه فقط انا اختارهم». دورة لوحدها عشان أي حاجة فيها (الحساب لسه ماتوصلش · الجدول لسه ماتعملش)
 * ماتأثرش على الدورة القديمة ولا وقتها. درايف: قراية بس. الحماية: `CRON_SECRET` زي باقي الدورات.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/voiceHealth";
import { getDriveAccessToken, driveListPage, driveDownloadPdf, privateDriveConfigured } from "@/lib/gdrive";
import { certDailyTick } from "@/lib/certDailyJob";
import { extractPdfText } from "@/lib/pdfText";
import {
  insertNewCerts, pendingCerts, saveParsedCert, cleanupCerts, requeueNoPlateCerts,
  requeueMissingCertNoCerts, requeueMissingTenantCerts, requeueStaleFieldsCerts,
} from "@/lib/certDailyStore";
import { runCertPush } from "@/lib/certPushStore";
import { CERT_SOURCE_TABLES } from "@/lib/certPrivate";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const maxDuration = 60;

const FIELDS = "nextPageToken,files(id,name,createdTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";
/** أكبر شهادة بنقراها (الشهايد صفحة واحدة — أي حاجة أكبر غلط). */
const MAX_BYTES = 15 * 1024 * 1024;
const T = CERT_SOURCE_TABLES.private;

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // الحساب التاني لسه ماتوصلش ⇒ مفيش حاجة تتعمل (مش غلط)
  if (!privateDriveConfigured()) return NextResponse.json({ skipped: "not_configured" });

  const token = await getDriveAccessToken("private");
  if (!token) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  try {
    const out = await certDailyTick({
      now: () => new Date(),
      listRange: async (fromIso, toIso, pageToken) => {
        // التواريخ محسوبة في الدورة (أول اليوم بالثانية) — مافيش أي مدخل من بره
        const q = `mimeType='application/pdf' and trashed=false and createdTime >= '${fromIso}'`
          + (toIso ? ` and createdTime < '${toIso}'` : "");
        const r = await driveListPage(q, token, { fields: FIELDS, orderBy: "createdTime", pageToken, timeoutMs: 20_000 });
        if (!r.ok) throw new Error("drive_failed");
        return { files: r.files, next: r.next };
      },
      insertNew: (rows) => insertNewCerts(rows, T),
      pending: (fromDay, limit) => pendingCerts(fromDay, limit, T),
      requeueNoPlate: (fromDay, beforeIso) => requeueNoPlateCerts(fromDay, beforeIso, T),
      requeueMissingCertNo: (fromDay) => requeueMissingCertNoCerts(fromDay, T),
      requeueMissingTenant: (fromDay) => requeueMissingTenantCerts(fromDay, T),
      requeueStaleFields: (fromDay, beforeIso) => requeueStaleFieldsCerts(fromDay, beforeIso, T),
      download: async (fileId) => {
        const buf = await driveDownloadPdf(fileId, token, { maxBytes: MAX_BYTES });
        return buf ? new Uint8Array(buf) : null;
      },
      extractText: extractPdfText,
      saveParsed: (fileId, fields, tries, done) => saveParsedCert(fileId, fields, tries, done, T),
      cleanup: (beforeDay) => cleanupCerts(beforeDay, T),
      budgetMs: 40_000,
      concurrency: 8,
    });
    // 🔔 نفس الإشعار بالظبط — للمختارين بس. غلطه مايوقفش الدورة.
    const push = await runCertPush("private").catch((e) => ({ action: "error", error: String((e as Error)?.message ?? e) }));
    return NextResponse.json({ ...out, push }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    // الجدول لسه ماتعملش (docs/sql/cert-private.sql) أو درايف/الداتابيز ماردّوش
    return NextResponse.json({ error: (e as Error)?.message || "error" }, { status: 500 });
  }
}
