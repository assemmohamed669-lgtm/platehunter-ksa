import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 32,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: image,
            },
          },
          {
            type: "text",
            text: `أنت متخصص في قراءة لوحات السيارات السعودية.

اللوحة السعودية لها صفّان:
- الصف العلوي: 3 حروف عربية + 4 أرقام
- الصف السفلي: نفس اللوحة بالإنجليزية — 3 حروف لاتينية + 4 أرقام

الحروف اللاتينية الممكنة فقط على اللوحة السعودية هي:
A  B  D  E  G  H  J  K  L  M  N  R  S  T  U  V  X  Z
(لا توجد حروف مثل C, F, I, O, P, Q, W, Y على اللوحات السعودية)

المطلوب:
اقرأ الصف السفلي (الإنجليزي) فقط، وأخرج الحروف الثلاثة والأرقام الأربعة بدون مسافات.
أمثلة للإجابة الصحيحة: JTT8877 أو NKD5678 أو ABD1234 أو HGR3421

اجتهد دائماً حتى لو الصورة غير واضحة تماماً.
لا تكتب NONE إلا إذا لم توجد لوحة سيارة على الإطلاق في الصورة.`,
          },
        ],
      }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
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
