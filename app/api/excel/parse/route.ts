/**
 * POST /api/excel/parse
 * FormData: { file: File, password?: string }
 *
 * Parses an uploaded Excel file into { headers, rows }. If a password is
 * supplied, first attempts to decrypt the file (best-effort — coverage
 * depends on which encryption scheme the original file used; classic
 * "Agile"/"Standard" OOXML encryption is supported, older or custom
 * schemes may not be). Decryption runs server-side because the
 * underlying libraries expect Node's Buffer, which isn't reliably
 * available in the browser bundle.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const password = (formData.get("password") as string | null) || undefined;

    if (!file) {
      return NextResponse.json({ error: "لم يتم إرسال ملف." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (password) {
      try {
        // officecrypto-js: pure-JS decryption for password-protected
        // OOXML files (xlsx/docx). Best-effort — see note above.
        const officecrypto = await import("officecrypto-js");
        buffer = await officecrypto.decrypt(buffer, { password });
      } catch {
        return NextResponse.json(
          {
            error:
              "تعذّر فك التشفير. تأكد من كلمة المرور، أو أن نوع الحماية غير مدعوم — جرّب إزالة الحماية من برنامج Excel وإعادة الرفع.",
          },
          { status: 400 }
        );
      }
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        {
          error: password
            ? "فُكّ التشفير لكن تعذّرت قراءة محتوى الملف."
            : "تعذّرت قراءة الملف. إذا كان محميًا بكلمة مرور، أدخلها في الحقل المخصص.",
        },
        { status: 400 }
      );
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false }) as Record<
      string,
      string
    >[];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({ headers, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
