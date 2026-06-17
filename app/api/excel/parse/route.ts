/**
 * POST /api/excel/parse
 * FormData: { file: File, password?: string }
 *
 * Parses an uploaded Excel file into { headers, rows }.
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

    if (password) {
      return NextResponse.json(
        {
          error: "عذراً، ميزة فك تشفير الملفات المحمية بكلمة مرور غير متاحة حالياً. يرجى إزالة كلمة المرور من ملف Excel وإعادة الرفع.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        {
          error: "تعذّرت قراءة الملف. تأكد من أن الملف بصيغة Excel سليمة.",
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