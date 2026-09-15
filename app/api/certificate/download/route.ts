import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessTokens } from "@/lib/gdrive";

/**
 * يجيب ملف الشهادة (PDF) من درايف ويبعته للتطبيق — عشان المندوب يفتحها/يشاركها
 * من غير ما يحتاج حساب جوجل (السيرفر هو اللي له الأكسيز). fileId من نتيجة البحث.
 */
export async function GET(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"), req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`cert-dl:${userId}`, 60, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const id = req.nextUrl.searchParams.get("fileId") || "";
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  // الملف ممكن يكون على أي حساب من حسابات الدرايف المتظبّطة — نجرّبهم بالترتيب.
  const tokens = await getDriveAccessTokens();
  if (tokens.length === 0) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  let r: Response | null = null;
  for (const token of tokens) {
    const attempt = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (attempt.ok) { r = attempt; break; }
    r = attempt;   // آخر رد للتشخيص لو كلهم فشلوا
  }
  if (!r || !r.ok) return NextResponse.json({ error: "fetch_failed", detail: r?.status ?? 0 }, { status: 502 });

  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate-${id}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
