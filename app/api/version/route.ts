/**
 * GET /api/version — بترجّع نسخة البرنامج المنشورة + ملاحظة التحديث، بدون كاش.
 * العميل بيقارنها بالنسخة المضمّنة في الجافاسكريبت اللي عنده؛ لو مختلفة يظهر بانر التحديث.
 */
import { NextResponse } from "next/server";
import { APP_VERSION, UPDATE_NOTE } from "@/lib/appVersion";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION, note: UPDATE_NOTE },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
