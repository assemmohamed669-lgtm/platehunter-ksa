import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveSearch, type DriveFile } from "@/lib/gdrive";
import { looksLikeChassis, looksLikeCertNumber, certSearchToken, plateDigitForms, matchCertFiles } from "@/lib/certificateMatch";
import { certAccessOf } from "@/lib/certAccessStore";
import { certSourcesFor, CERT_SOURCE_TABLES, type CertSource } from "@/lib/certPrivate";
import { findParsedCerts } from "@/lib/certDailyStore";
import { bankPlateToArabic, normalizePlate } from "@/lib/plateParser";

/**
 * 🔎 الشهايد اللي اتقرت من جوّه الملف (`cert_daily`) — المالك (١٩ نوفمبر ٢٠٢٦): «رعب4925 ببحث عليها … مش موجوده».
 * أغلب الملفات اسمها رقم عقد («REPO-301-…») فالبحث بالاسم في درايف مايلاقيهاش، بس لوحتها متقرية من جوّاها.
 */
async function parsedHits(q: string, source: CertSource): Promise<{ id: string; name: string }[]> {
  const table = source === "main" ? undefined : CERT_SOURCE_TABLES[source];
  const find = (query: { plate?: string; digits?: string; vin?: string }) => (table ? findParsedCerts(query, table) : findParsedCerts(query));
  if (looksLikeChassis(q)) return find({ vin: q.trim().toUpperCase() });
  if (looksLikeCertNumber(q)) return [];
  const key = normalizePlate(bankPlateToArabic(q));
  if (!key) return [];
  const digits = key.replace(/\D/g, "");
  if (!digits) return [];
  return key.replace(/\d/g, "") ? find({ plate: key }) : find({ digits });
}

// يهرب علامة التنصيص المفردة في استعلام درايف.
function esc(s: string): string { return s.replace(/'/g, "\\'"); }

/** نفس البحث بالظبط على حساب درايف واحد. */
async function searchOne(q: string, token: string): Promise<{ files: DriveFile[]; scanned: number; mode: string } | null> {
  if (looksLikeChassis(q)) {
    // هيكل (VIN) — بحث بالمحتوى (فريد ومباشر).
    const files = await driveSearch(`fullText contains '${esc(q)}' and mimeType='application/pdf'`, token);
    return { files, scanned: files.length, mode: "chassis" };
  }
  if (looksLikeCertNumber(q)) {
    // رقم شهادة (REPO/CRN أو أرقام ملزوقة) — نبحث بالتوكن المناسب (آخر ٨ للملزوق).
    const tok = certSearchToken(q);
    const files = await driveSearch(`fullText contains '${esc(tok)}' and mimeType='application/pdf'`, token);
    return { files, scanned: files.length, mode: "cert" };
  }
  // الأرقام بكل أشكالها («0076» / «76») — البنك بينزلها من غير الأصفار والمندوب بيها
  const forms = plateDigitForms(q);
  if (!forms.length) return null;
  const all = await driveSearch(`(${forms.map((d) => `name contains '${esc(d)}'`).join(" or ")}) and mimeType='application/pdf'`, token);
  return { files: matchCertFiles(q, all), scanned: all.length, mode: "plate" };
}

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

  // 🔒 الشهايد الخاصة (`lib/certPrivate.ts`): المختار بيدوّر في الحساب التاني كمان أو لوحده حسب وضعه.
  //    اللي مش في القايمة ⇒ الحساب القديم بس زي الأول بالظبط.
  const sources = certSourcesFor(await certAccessOf(userId));
  const files: DriveFile[] = [];
  let scanned = 0;           // كام PDF رجع من درايف قبل الفلترة — للتشخيص
  let mode = "plate";
  let anyToken = false;
  for (const source of sources) {
    const token = await getDriveAccessToken(source);
    if (!token) continue;
    anyToken = true;
    const r = await searchOne(q, token);
    if (!r) return NextResponse.json({ found: false, results: [] });
    mode = r.mode;
    scanned += r.scanned;
    for (const f of r.files) if (!files.some((x) => x.id === f.id)) files.push(f);
    for (const f of await parsedHits(q, source)) if (!files.some((x) => x.id === f.id)) files.push({ id: f.id, name: f.name });
  }
  if (!anyToken) return NextResponse.json({ found: false, results: [], error: "drive_unavailable" });

  const results = files.map((f) => ({ id: f.id, name: f.name, link: f.webViewLink ?? null }));
  // `scanned` و`mode` بيفرّقوا بين «درايف رجع ملفات بس مفيش مطابق» و«درايف
  // مارجّعش حاجة أصلاً» — الاتنين كانوا بيظهروا للمندوب «مفيش شهادة».
  return NextResponse.json({ found: results.length > 0, results, scanned, mode });
}
