/**
 * POST /api/excel/parse
 * FormData: { file: File }
 *
 * **مقفول على المناديب المسجّلين فقط** — قراءة الإكسيل على السيرفر بتستهلك
 * ذاكرة/CPU، ولو مفتوح للعامة يبقى تعطيل رخيص للخدمة.
 * (ملاحظة: الراوت ده مالوش أي مستخدم في التطبيق حالياً — القراءة كلها بقت محلية
 * على الجهاز. مرشّح للحذف بعد التأكد إن مافيش أداة برّه بتنده عليه.)
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifySession, rateLimit } from "@/lib/apiAuth";

export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const userId = await verifySession(req.headers.get("authorization"), req);
    if (!userId) {
      return NextResponse.json({ error: "الجلسة غير صالحة — سجّل الدخول تاني." }, { status: 401 });
    }
    if (!rateLimit(`excel-parse:${userId}`, 20, 60_000, req)) {
      return NextResponse.json({ error: "محاولات كتير — استنى دقيقة وجرّب تاني." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "لم يتم إرسال ملف." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "الملف أكبر من ٣٠ ميجا." }, { status: 413 });
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