import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearch } from "@/lib/gdrive";
import { looksLikeChassis, looksLikeCertNumber, certSearchToken, plateDigits, matchCertFiles } from "@/lib/certificateMatch";

// يهرب علامة التنصيص المفردة في استعلام درايف.
function esc(s: string): string { return s.replace(/'/g, "\\'"); }

/**
 * بحث عن شهادة السحب في Google Drive برقم الهيكل أو اللوحة.
 *  • هيكل (VIN): بحث بالمحتوى `fullText` — فريد ومباشر.
 *  • لوحة (بأي شكل): نجيب كل PDF بأرقام اللوحة، ثم نفلتر بالتطبيع (بيطابق
 *    «د و ا 8403» و«دوا8403» و«٨٤٠٣ دوا»...). لا حساسية للمسافات/الترتيب/عربي-إنجليزي.
 */
export async function GET(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"), req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`cert:${userId}`, 60, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "missing_q" }, { status: 400 });

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ found: false, results: [], error: "drive_unavailable" });

  let files;
  if (looksLikeChassis(q)) {
    // هيكل (VIN) — بحث بالمحتوى (فريد ومباشر).
    files = await driveSearch(`fullText contains '${esc(q)}' and mimeType='application/pdf'`, token);
  } else if (looksLikeCertNumber(q)) {
    // رقم شهادة (REPO/CRN أو أرقام ملزوقة) — نبحث بالتوكن المناسب (آخر ٨ للملزوق).
    const tok = certSearchToken(q);
    files = await driveSearch(`fullText contains '${esc(tok)}' and mimeType='application/pdf'`, token);
  } else {
    const digits = plateDigits(q);
    if (!digits) return NextResponse.json({ found: false, results: [] });
    const all = await driveSearch(`name contains '${esc(digits)}' and mimeType='application/pdf'`, token);
    files = matchCertFiles(q, all);
  }

  const results = files.map((f) => ({ id: f.id, name: f.name, link: f.webViewLink ?? null }));
  return NextResponse.json({ found: results.length > 0, results });
}
