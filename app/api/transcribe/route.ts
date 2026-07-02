import { NextRequest, NextResponse } from "next/server";

// Voice-to-text for plate registration via Groq's hosted Whisper. Uses the
// AGENT'S OWN API key (sent from the client, not a shared server key) — each
// field agent has their own free Groq account, so usage never pools onto one
// account's rate limit no matter how many agents use the app.
export async function POST(req: NextRequest) {
  try {
    const { audio, mimeType, apiKey } = await req.json();
    if (!audio || !apiKey) {
      return NextResponse.json({ text: null, error: "missing_audio_or_key" }, { status: 400 });
    }

    const buffer = Buffer.from(audio, "base64");
    let ext = (mimeType?.split("/")[1] ?? "m4a").split(";")[0];
    // The native Android recorder plugin only outputs raw AAC/ADTS
    // (mimeType "audio/aac") — that codec isn't in Groq's allowed extension
    // list (flac/mp3/mp4/mpeg/mpga/m4a/ogg/opus/wav/webm), even though the
    // audio itself is valid AAC. Relabel it to m4a, the closest supported
    // container for the same codec, so Groq's extension check accepts it.
    if (ext === "aac") ext = "m4a";
    const blob = new Blob([buffer], { type: mimeType || "audio/m4a" });

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "ar");
    form.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Groq transcription error:", res.status, body.slice(0, 300));
      return NextResponse.json(
        { text: null, error: "groq_error", detail: res.status, hint: body.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("transcribe error:", msg);
    return NextResponse.json({ text: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
