import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ plate: null, error: "missing_api_key" }, { status: 500 });
    }

    const response = await client.chat.completions.create({
      model: "llama-3.2-11b-vision-preview",
      max_tokens: 32,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${image}` },
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

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text || text.toUpperCase() === "NONE") {
      return NextResponse.json({ plate: null });
    }
    return NextResponse.json({ plate: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("read-plate error:", msg);
    return NextResponse.json({ plate: null, error: "server_error", detail: msg.slice(0, 200) }, { status: 500 });
  }
}
