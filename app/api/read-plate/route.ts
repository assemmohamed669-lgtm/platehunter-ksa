import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { image, mediaType } = await req.json();

  if (!image || !mediaType) {
    return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data: image },
          },
          {
            type: "text",
            text: `اللوحة السعودية تتكون من 3 حروف عربية + 4 أرقام، أو 3 أحرف إنجليزية + 4 أرقام.
استخرج رقم اللوحة من الصورة بالضبط كما هو مكتوب — حروف + أرقام فقط، لا تكتب أي شيء آخر.
مثال: أبح1234 أو ABC 1234
إذا لم تجد لوحة واضحة، أرجع NONE.`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text.trim() : "";

  if (!text || text === "NONE") {
    return NextResponse.json({ plate: null });
  }

  return NextResponse.json({ plate: text });
}
