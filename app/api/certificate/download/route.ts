import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken } from "@/lib/gdrive";

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

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });

  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) return NextResponse.json({ error: "fetch_failed", detail: r.status }, { status: 502 });

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
