import { NextRequest, NextResponse } from "next/server";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();

    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }

    if (!GOOGLE_API_KEY) {
      return NextResponse.json({ plate: null, error: "missing_api_key" }, { status: 500 });
    }

    // Support both old (AIza...) and new (AQ...) Google AI Studio key formats
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mediaType, data: image } },
              {
                text: `أنت قارئ لوحات سيارات سعودية متخصص. اللوحة السعودية: 3 حروف + 4 أرقام.
حلّل الصورة بعناية واستخرج رقم اللوحة. قد تكون الأرقام والحروف عربية أو إنجليزية.
اكتب الناتج فقط بدون أي كلام إضافي — أمثلة: أبح1234 أو NKD5678 أو هدي3412
إذا كانت الصورة تحتوي لوحة ولو جزئياً أو غير واضحة تماماً، اجتهد وأعطِ أفضل تخمين.
لا تكتب NONE إلا إذا لم توجد أي لوحة على الإطلاق في الصورة.`,
              },
            ],
          }],
          generationConfig: { maxOutputTokens: 32, temperature: 0 },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Gemini error:", res.status, body.slice(0, 400));
      return NextResponse.json(
        { plate: null, error: "gemini_error", detail: res.status, hint: body.slice(0, 300) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

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
