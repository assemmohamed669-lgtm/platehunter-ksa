/**
 * POST /api/excel/parse
 * FormData: { file: File }
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "لم يتم إرسال ملف." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ملاحظة: تم إزالة officecrypto-js لأنه يسبب خطأ في البناء وغير متوفر.
    // المكتبة xlsx تدعم قراءة ملفات Excel بشكل مباشر.
    
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        { error: "تعذّرت قراءة الملف. تأكد من أن الملف ليس محميًا بكلمة مرور." },
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