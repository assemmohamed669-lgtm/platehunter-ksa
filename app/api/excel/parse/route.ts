/**
 * POST /api/excel/parse
 * FormData: { file: File, password?: string }
 *
 * Parses an uploaded Excel file into { headers, rows }. If a password is
 * supplied, it returns an error stating that password-protected files 
 * are not currently supported due to library constraints.
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

    // تم إلغاء فك التشفير عبر officecrypto-js لعدم توفر المكتبة
    if (password) {
      return NextResponse.json(
        { error: "ملفات Excel المحمية بكلمة مرور غير مدعومة حالياً." },
        { status: 400 }
      );
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        {
          error: "تعذّرت قراءة الملف. إذا كان محميًا بكلمة مرور، يرجى إزالة الحماية أولاً قبل رفعه.",
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