/**
 * POST /api/excel/decrypt
 * FormData: { file: File, password: string }
 *
 * SheetJS (النسخة المجانية) لا تفكّ تشفير ملفات Excel المحمية بكلمة مرور
 * (تشفير ECMA-376 الحديث AES) — تكتفي برمي "File is password-protected".
 * هذا الـ route يفكّ التشفير بمكتبة officecrypto-tool ويعيد الملف بعد فك
 * تشفيره (bytes) عشان العميل يقرأه محلياً بمنطق الفرز/الأعمدة المعتاد.
 *
 * **مقفول على المناديب المسجّلين فقط**: فكّ التشفير بيستهلك CPU/رام السيرفر، ولو
 * مفتوح للعامة يبقى (١) تعطيل رخيص للخدمة، (٢) آلة تجريب كلمات سر على حسابنا.
 */
import { NextRequest, NextResponse } from "next/server";
import officeCrypto from "officecrypto-tool";
import { verifySession, rateLimit } from "@/lib/apiAuth";

export const runtime = "nodejs";

// أكبر ملف مسموح — أكبر من كده مافيش داعي يتفكّ على السيرفر.
const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const userId = await verifySession(req.headers.get("authorization"), req);
    // كود مميّز: العميل بيفرّق بينه وبين 401 بتاعة «كلمة مرور الملف غلط».
    if (!userId) {
      return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });
    }
    if (!rateLimit(`excel-decrypt:${userId}`, 20, 60_000, req)) {
      return NextResponse.json({ error: "محاولات كتير — استنى دقيقة وجرّب تاني." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const password = String(formData.get("password") ?? "");

    if (!file) {
      return NextResponse.json({ error: "لم يتم إرسال ملف." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "كلمة المرور مطلوبة." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "الملف أكبر من ٣٠ ميجا — فكّ تشفيره على الكمبيوتر واحفظه بدون كلمة سر." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // لو الملف مش مشفّر أصلاً، رجّعه زي ما هو.
    let out: Buffer;
    if (officeCrypto.isEncrypted(buffer)) {
      try {
        out = await officeCrypto.decrypt(buffer, { password });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // كلمة مرور غلط → رسالة مخصّصة (401) عشان العميل يعيد السؤال.
        if (/incorrect|password|wrong/i.test(msg)) {
          return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
        }
        return NextResponse.json({ error: "تعذّر فك تشفير الملف." }, { status: 400 });
      }
    } else {
      out = buffer;
    }

    // نعيد الـ bytes الخام — العميل يبني منها File ويقرأها بمنطقه الكامل.
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(out.length),
      },
    });
  } catch (err) {
    // مانرجّعش رسالة الخطأ الداخلية للعميل — ممكن تسرّب مسارات السيرفر أو
    // تفاصيل المكتبة. العميل بيتجاهلها أصلاً (lib/excel.ts) ويعرض رسالته.
    console.error("excel/decrypt failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر معالجة الملف." }, { status: 500 });
  }
}
