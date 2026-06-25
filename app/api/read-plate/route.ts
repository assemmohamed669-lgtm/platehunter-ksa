import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { image, mediaType } = await req.json();

  if (!image || !mediaType) {
    return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 32,
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
            text: `أنت قارئ لوحات سيارات سعودية متخصص. اللوحة السعودية: 3 حروف + 4 أرقام.
حلّل الصورة بعناية واستخرج رقم اللوحة. قد تكون الأرقام والحروف عربية أو إنجليزية.
اكتب الناتج فقط بدون أي كلام إضافي — أمثلة: أبح1234 أو NKD5678 أو هدي3412
إذا كانت الصورة تحتوي لوحة ولو جزئياً أو غير واضحة تماماً، اجتهد في قراءتها وأعطِ أفضل تخمين.
لا تكتب NONE إلا إذا لم توجد أي لوحة على الإطلاق في الصورة.`,
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
