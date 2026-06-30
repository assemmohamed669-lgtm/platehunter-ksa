import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();

    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ plate: null, error: "missing_api_key" }, { status: 500 });
    }

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 32,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: image },
            },
            {
              type: "text",
              text: `أنت قارئ لوحات سيارات سعودية متخصص. اللوحة السعودية: 3 حروف + 4 أرقام.
حلّل الصورة بعناية واستخرج رقم اللوحة. قد تكون الأرقام والحروف عربية أو إنجليزية.
اكتب الناتج فقط بدون أي كلام إضافي — أمثلة: أبح1234 أو NKD5678 أو هدي3412
إذا كانت الصورة تحتوي لوحة ولو جزئياً أو غير واضحة تماماً، اجتهد وأعطِ أفضل تخمين.
لا تكتب NONE إلا إذا لم توجد أي لوحة على الإطلاق في الصورة.`,
            },
          ],
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string })?.text?.trim() ?? "";

    if (!text || text.toUpperCase() === "NONE") {
      return NextResponse.json({ plate: null });
    }

    return NextResponse.json({ plate: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("read-plate error:", msg);
    return NextResponse.json({ plate: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
