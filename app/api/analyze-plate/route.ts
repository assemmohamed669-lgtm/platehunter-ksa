import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ plate: "", vehicleType: undefined, notes: "", normalized: "" });
  }

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 256,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `أنت مساعد متخصص في استخراج أرقام لوحات السيارات السعودية من النصوص الصوتية المحوّلة.

قواعد لوحات السيارات السعودية:
- اللوحة تتكون من 1-3 حروف عربية + 1-4 أرقام (مثال: ح ب د 1234 أو 1234 ح ب د)
- الحروف المسموح بها فقط: ا، ب، ح، د، ر، س، ص، ط، ع، ق، ك، ل، م، ن، هـ، و، ي
- قد تُذكر أنواع المركبات: ونيت، فان، دباب، شاحنة، باص، مصدومة

النص الصوتي:
"${transcript}"

استخرج المعلومات التالية بصيغة JSON فقط، بدون أي نص إضافي:
{
  "plate": "الحروف العربية + الأرقام بدون مسافات (مثال: حبد1234) أو سلسلة فارغة إن لم تجد",
  "vehicleType": "نوع المركبة إن ذُكر أو null",
  "notes": "أي نص لا يتعلق باللوحة",
  "normalized": "النص بعد تنظيفه"
}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ plate: "", vehicleType: undefined, notes: "", normalized: "" });
  }

  try {
    const raw = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      plate: parsed.plate ?? "",
      vehicleType: parsed.vehicleType ?? undefined,
      notes: parsed.notes ?? "",
      normalized: parsed.normalized ?? "",
    });
  } catch {
    return NextResponse.json({ plate: "", vehicleType: undefined, notes: "", normalized: "" });
  }
}
