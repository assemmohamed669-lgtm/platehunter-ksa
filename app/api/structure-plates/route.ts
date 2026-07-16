/**
 * POST /api/structure-plates
 * Body: { transcript: string, apiKey?: string }  — signed-in agents only.
 *
 * ياخد نص الجلسة الكامل المفرّغ ويبعته لـ Groq llama يرتّبه لصفوف
 * { plate, vehicleType, notes } بالسياق الكامل — ده اللي بيخلّي الفرز يطلع
 * نضيف. النتيجة بتتطبّع وتتحقّق (٣ حروف + ٤ أرقام) على السيرفر قبل ما ترجع.
 * بيستخدم مفتاح Groq بتاع المندوب (أو مفتاح السيرفر fallback).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { buildStructurePrompt, extractJsonObject, normalizeStructuredRows } from "@/lib/structuredPlates";

// موديل نصّي قوي وسريع على Groq لمهمة الاستخراج المنظّم.
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function POST(req: NextRequest) {
  try {
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ rows: null, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`structure:${userId}`, 60, 60_000)) {
      return NextResponse.json({ rows: null, error: "rate_limited" }, { status: 429 });
    }

    const { transcript, apiKey: clientKey } = await req.json();
    if (typeof transcript !== "string" || !transcript.trim()) {
      return NextResponse.json({ rows: [] });
    }

    const apiKey = (typeof clientKey === "string" && clientKey.trim()) || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ rows: null, error: "missing_api_key" }, { status: 200 });
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "أنت بترتّب نص مفرّغ لصفوف JSON فقط. مفيش أي كلام خارج الـ JSON." },
          { role: "user", content: buildStructurePrompt(transcript) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("structure-plates Groq error:", res.status, body.slice(0, 300));
      return NextResponse.json(
        { rows: null, error: "groq_error", detail: res.status, hint: body.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJsonObject(raw);
    const rows = normalizeStructuredRows(parsed);
    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("structure-plates error:", msg);
    return NextResponse.json({ rows: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
