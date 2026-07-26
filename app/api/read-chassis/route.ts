import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";

const PROMPT = `Look at the image and find the vehicle CHASSIS NUMBER (VIN / رقم الهيكل).

It is a long alphanumeric code — usually 17 characters, letters and digits, no spaces.
It may be printed on a metal plate, a sticker, the windshield, or the door frame.

Output ONLY the chassis number characters, UPPERCASE, no spaces, nothing else.

Examples of correct output:
JT2BG22K1W0123456
MHFLW9EM5K1234567
3N1CN8ADXPL824000

Do NOT describe the image. Do NOT write any other words. Just the chassis characters.
If no chassis number is visible at all, output: NONE`;

// Extract the chassis number from the model response: keep only [A-Z0-9], then
// take the longest run of chassis-like characters (>= 6). VINs are alphanumeric.
function extractChassis(text: string): string | null {
  const cleaned = (text || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 6);
  if (tokens.length === 0) return null;
  // أطول رمز = الأرجح إنه الشاص (بدل أجزاء منفصلة)
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0];
}

export async function POST(req: NextRequest) {
  try {
    // Auth: only signed-in agents may call — blocks anonymous abuse of the
    // server API key. Rate-limit per agent as a second layer. (نفس سياسة read-plate.)
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ chassis: null, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`read-chassis:${userId}`, 60, 60_000)) {
      return NextResponse.json({ chassis: null, error: "rate_limited" }, { status: 429 });
    }

    const { image, mediaType, apiKey: clientKey } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ chassis: null, error: "missing image" }, { status: 400 });
    }

    // مفتاح المندوب نفسه (بتاع الصوت/اللوحة) عشان الاستخدام يتحاسب على حسابه.
    const apiKey = (typeof clientKey === "string" && clientKey.trim()) || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ chassis: null, error: "missing_api_key" }, { status: 200 });
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // نفس موديل الرؤية بتاع read-plate. الشاص أطول من اللوحة فبنسمح بتوكنز أكتر.
        model: "qwen/qwen3.6-27b",
        reasoning_effort: "none",
        max_tokens: 60,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${image}` } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Groq error (chassis):", res.status, body.slice(0, 300));
      return NextResponse.json(
        { chassis: null, error: "groq_error", detail: res.status, hint: body.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw || raw.toUpperCase().includes("NONE")) {
      return NextResponse.json({ chassis: null });
    }

    const chassis = extractChassis(raw) ?? null;
    return NextResponse.json({ chassis, raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("read-chassis error:", msg);
    return NextResponse.json({ chassis: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
