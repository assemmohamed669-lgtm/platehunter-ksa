/**
 * GET /c/<توكن> — 🔗 لينك الشهادة اللي المندوب بيبعته على واتساب (`lib/certLink.ts`).
 *
 * المالك (٦ أكتوبر ٢٠٢٦): «ويبقي فيهم لينك الشهادة ع الواتس يتبعت معاهم لما يدوس عليها يفتحها».
 * اللي بيدوس عليه مش لازم يكون داخل البرنامج: التوقيع هو الإذن (أي حرف يتغيّر يبطل، وبينتهي بعد ٣٠ يوم)،
 * والسيرفر بيجيب الـPDF من درايف حساب الشهايد. عدد الطلبات محدود لكل جهاز.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCertLink } from "@/lib/certLink";
import { getDriveAccessToken } from "@/lib/gdrive";
import { rateLimit } from "@/lib/apiAuth";
import { requestMeta } from "@/lib/securityLogServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

function page(text: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>شهادة</title></head>`
    + `<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#333">${text}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!rateLimit(`cert-link:${requestMeta(req).ip ?? "?"}`, 60, 60_000, req)) {
    return page("طلبات كتير — جرّب كمان دقيقة.", 429);
  }
  const fileId = verifyCertLink(params.token, Date.now());
  if (!fileId) return page("الرابط ده انتهى أو مش صحيح — اطلب من المندوب يبعته تاني.", 404);

  const token = await getDriveAccessToken();
  if (!token) return page("الشهادة مش متاحة دلوقتي — جرّب كمان شوية.", 502);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return page("الشهادة مش متاحة دلوقتي — جرّب كمان شوية.", 502);

  return new NextResponse(await r.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate.pdf"`,
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
