import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";

const PROMPT = `Look at the license plate in this image.

Output ONLY the 7 characters from the BOTTOM English row: 3 letters then 4 digits, no spaces, nothing else.

Valid letters on Saudi plates: A B D E G H J K L M N R S T U V X Z

Examples of correct output:
JTT8877
NKD5678
ABD1234

Do NOT describe the plate. Do NOT write any other words. Just the 7 characters.
If no plate is visible at all, output: NONE`;

// Extract plate from model response and normalise letter order.
// Saudi plates display letters RIGHT-to-LEFT (rightmost = first letter).
// Vision models read left-to-right, so they return letters reversed — we flip them back.
// e.g. model reads "TTJ8877" → reverse letters → "JTT8877"
function extractPlate(text: string): string | null {
  const cleaned = text.replace(/\s+/g, "").toUpperCase();

  // Prefer letters-then-digits (most common model output format)
  let m = cleaned.match(/([A-Z]{2,3})([0-9]{3,4})/);
  if (m) {
    const letters = m[1].split("").reverse().join(""); // reverse: TTJ → JTT
    return letters + m[2];
  }
  // Digits-then-letters fallback
  m = cleaned.match(/([0-9]{3,4})([A-Z]{2,3})/);
  if (m) {
    const letters = m[2].split("").reverse().join(""); // reverse: TTJ → JTT
    return letters + m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Auth: only signed-in agents may call — blocks anonymous abuse of the
    // server API key. Rate-limit per agent as a second layer.
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ plate: null, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`read-plate:${userId}`, 60, 60_000)) {
      return NextResponse.json({ plate: null, error: "rate_limited" }, { status: 429 });
    }

    const { image, mediaType, apiKey: clientKey } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }

    // Prefer the agent's OWN key (sent from the client, same key as voice) so
    // camera usage is billed to each agent's account instead of pooling onto
    // one shared account. Falls back to the server key only if the agent
    // hasn't set one. If neither exists the client silently falls back to the
    // free on-device TextDetector, so return a plain (non-fatal) signal.
    const apiKey = (typeof clientKey === "string" && clientKey.trim()) || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ plate: null, error: "missing_api_key" }, { status: 200 });
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // موديل الرؤية الحالي على Groq. (llama-4-scout القديم اتوقف من Groq في
        // ٢٠٢٦/٦/١٧ فكان بيرجّع "model does not exist"). qwen3.6-27b متعدد الوسائط
        // بياخد صور بنفس شكل image_url. reasoning_effort:"none" بيطفّي وضع التفكير
        // فيطلع اللوحة مباشرة (من غير ما التوكنز تتاكل في التفكير).
        model: "qwen/qwen3.6-27b",
        reasoning_effort: "none",
        max_tokens: 40,
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
      console.error("Groq error:", res.status, body.slice(0, 300));
      return NextResponse.json(
        { plate: null, error: "groq_error", detail: res.status, hint: body.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw || raw.toUpperCase().includes("NONE")) {
      return NextResponse.json({ plate: null });
    }

    // If model returned just the plate — use it directly; otherwise extract from response
    const plate = extractPlate(raw) ?? null;
    return NextResponse.json({ plate, raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("read-plate error:", msg);
    return NextResponse.json({ plate: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
