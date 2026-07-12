/**
 * POST /api/excel/decrypt
 * FormData: { file: File, password: string }
 *
 * SheetJS (النسخة المجانية) لا تفكّ تشفير ملفات Excel المحمية بكلمة مرور
 * (تشفير ECMA-376 الحديث AES) — تكتفي برمي "File is password-protected".
 * هذا الـ route يفكّ التشفير بمكتبة officecrypto-tool ويعيد الملف بعد فك
 * تشفيره (bytes) عشان العميل يقرأه محلياً بمنطق الفرز/الأعمدة المعتاد.
 */
import { NextRequest, NextResponse } from "next/server";
import officeCrypto from "officecrypto-tool";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const password = String(formData.get("password") ?? "");

    if (!file) {
      return NextResponse.json({ error: "لم يتم إرسال ملف." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "كلمة المرور مطلوبة." }, { status: 400 });
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
    const message = err instanceof Error ? err.message : "خطأ غير معروف.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
