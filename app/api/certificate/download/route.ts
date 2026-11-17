import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { getDriveAccessToken, driveDownloadPdf } from "@/lib/gdrive";
import { certAccessOf } from "@/lib/certAccessStore";
import { certSourcesFor } from "@/lib/certPrivate";

/**
 * يجيب ملف الشهادة (PDF) من درايف ويبعته للتطبيق — عشان المندوب يفتحها/يشاركها
 * من غير ما يحتاج حساب جوجل (السيرفر هو اللي له الأكسيز). fileId من نتيجة البحث.
 *
 * 🔒 الشهايد الخاصة (`lib/certPrivate.ts`): المختار بس بيجرّب الحساب التاني لو الملف مش على القديم («الجديد بس» ⇒
 * الجديد الأول). اللي مش في القايمة ⇒ الحساب القديم بس زي الأول بالظبط.
 */
export async function GET(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"), req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`cert-dl:${userId}`, 60, 60_000, req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const id = req.nextUrl.searchParams.get("fileId") || "";
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const mode = await certAccessOf(userId);
  // مختار ⇒ الاتنين (بترتيب وضعه)؛ مش مختار ⇒ القديم بس
  const order = mode === "private_only" ? ["private", "main"] as const : mode ? certSourcesFor(mode) : ["main"] as const;

  let anyToken = false;
  for (const source of order) {
    const token = await getDriveAccessToken(source);
    if (!token) continue;
    anyToken = true;
    const buf = await driveDownloadPdf(id, token);
    if (!buf) continue;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificate-${id}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  if (!anyToken) return NextResponse.json({ error: "drive_unavailable" }, { status: 502 });
  return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
}
