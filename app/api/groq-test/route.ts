import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";

// Validates a Groq API key without needing a real recording — hits the
// lightweight models-list endpoint instead of transcriptions. Lets an agent
// confirm their key works before starting a long field recording, rather
// than discovering a bad key only after they finish talking.
export async function POST(req: NextRequest) {
  try {
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`groq-test:${userId}`, 20, 60_000)) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const { apiKey } = await req.json();
    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json({ ok: false, error: "missing_api_key" }, { status: 400 });
    }

    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "invalid_key", detail: res.status, hint: body.slice(0, 200) },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "server_error", detail: msg }, { status: 200 });
  }
}
