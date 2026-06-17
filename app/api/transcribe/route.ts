/**
 * POST /api/transcribe
 * Receives audio as multipart/form-data, sends to OpenAI Whisper,
 * returns raw transcript for the client to parse via plateParser.ts
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // needs file system access for FormData

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY غير مضبوط على الخادم." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "لم يتم إرسال ملف صوتي." },
        { status: 400 }
      );
    }

    // Whisper transcription — prompt helps it recognise Saudi plate format
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ar",
      prompt:
        "رقم اللوحة السعودية يتكون من ٣ حروف عربية وأربعة أرقام. " +
        "مثال: أبح ١٢٣٤ أو صد ٥٦٧٨. " +
        "الحروف الممكنة: أ ب ح د ر س ص ط ع ق ك ل م ن هـ و ي. " +
        "قد يذكر العميل نوع المركبة: ونيت، فان، دباب، مصدومة.",
      response_format: "text",
    });

    return NextResponse.json({ transcript: transcription });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "خطأ غير معروف من Whisper.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
