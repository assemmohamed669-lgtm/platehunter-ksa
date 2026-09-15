import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessTokens, driveSearch, type DriveFile } from "@/lib/gdrive";
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

  // كل حسابات الدرايف المتظبّطة — الشهادات متفرّقة على أكتر من حساب.
  const tokens = await getDriveAccessTokens();
  if (tokens.length === 0) return NextResponse.json({ found: false, results: [], error: "drive_unavailable" });
  /** يبحث في كل الحسابات ويدمج النتايج بلا تكرار (نفس الملف ممكن يبقى مشارك). */
  const searchAll = async (query: string): Promise<DriveFile[]> => {
    const lists = await Promise.all(tokens.map((t) => driveSearch(query, t)));
    const seen = new Set<string>();
    const out: DriveFile[] = [];
    for (const list of lists) for (const f of list) { if (!seen.has(f.id)) { seen.add(f.id); out.push(f); } }
    return out;
  };

  let files;
  if (looksLikeChassis(q)) {
    // هيكل (VIN) — بحث بالمحتوى (فريد ومباشر).
    files = await searchAll(`fullText contains '${esc(q)}' and mimeType='application/pdf'`);
  } else if (looksLikeCertNumber(q)) {
    // رقم شهادة (REPO/CRN أو أرقام ملزوقة) — نبحث بالتوكن المناسب (آخر ٨ للملزوق).
    const tok = certSearchToken(q);
    files = await searchAll(`fullText contains '${esc(tok)}' and mimeType='application/pdf'`);
  } else {
    const digits = plateDigits(q);
    if (!digits) return NextResponse.json({ found: false, results: [] });
    const all = await searchAll(`name contains '${esc(digits)}' and mimeType='application/pdf'`);
    files = matchCertFiles(q, all);
  }

  const results = files.map((f) => ({ id: f.id, name: f.name, link: f.webViewLink ?? null }));
  return NextResponse.json({ found: results.length > 0, results });
}
